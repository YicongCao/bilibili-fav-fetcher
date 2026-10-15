import path from 'node:path';
import { readJson, writeJsonAtomic } from '../utils/fsx.js';
import { log } from '../utils/logger.js';
import { getConfig } from '../config.js';
import type { TaskStore } from './taskStore.js';
import type { TaskRecord } from '../types/index.js';

export interface QueueState {
  schema: 'bili-dl/queue@1';
  status: 'running' | 'paused' | 'stopped';
  cursor: number;
  order: string[];
  inflight: string[];
  delayed: { id: string; notBefore: number }[];
  stats: { total: number; done: number; failed: number; skipped: number; bytesDone: number; startedAt: number };
  configSnapshot: { maxParallelTasks: number; quality: string; engineMode: string };
  heartbeat: number;
  updatedAt: number;
}

function emptyState(): QueueState {
  const cfg = getConfig();
  return {
    schema: 'bili-dl/queue@1',
    status: 'running',
    cursor: 0,
    order: [],
    inflight: [],
    delayed: [],
    stats: { total: 0, done: 0, failed: 0, skipped: 0, bytesDone: 0, startedAt: Date.now() },
    configSnapshot: {
      maxParallelTasks: cfg.download.maxParallelTasks,
      quality: cfg.download.quality,
      engineMode: cfg.engines.mode,
    },
    heartbeat: Date.now(),
    updatedAt: Date.now(),
  };
}

/**
 * 下载队列：所有任务的唯一入口
 * - 自带 metadata（outputs/.state/queue.json），可中断、可恢复
 * - 首次失败排队首；第 2 次起排队尾并退避
 */
export class DownloadQueue {
  private state: QueueState = emptyState();

  private dirty = false;

  private timer: NodeJS.Timeout | null = null;

  private constructor(
    readonly file: string,
    private readonly store: TaskStore,
  ) {}

  static async load(root: string, store: TaskStore): Promise<DownloadQueue> {
    const file = path.join(root, '.state', 'queue.json');
    const queue = new DownloadQueue(file, store);
    const saved = await readJson<QueueState>(file);
    if (saved?.schema === 'bili-dl/queue@1') {
      queue.state = { ...emptyState(), ...saved };
      // 进程重启后不存在「在途」，清空残留 inflight，避免任务永远不被投递
      if (queue.state.inflight.length) {
        log.info(`清理上次中断残留的在途任务：${queue.state.inflight.length} 个`);
        queue.state.inflight = [];
        queue.dirty = true;
      }
      log.info(
        `已载入队列：${queue.state.order.length} 个任务，上次状态 ${queue.state.status}（${new Date(queue.state.heartbeat).toLocaleString('zh-CN')}）`,
      );
    }
    queue.startHeartbeat();
    return queue;
  }

  private static readonly ACTIVE_STAGES = new Set(['planning', 'downloading', 'muxing', 'finalizing']);

  private startHeartbeat(): void {
    const cfg = getConfig();
    this.timer = setInterval(() => {
      this.state.heartbeat = Date.now();
      this.dirty = true;
      void this.flush();
    }, cfg.queue.heartbeatMs);
  }

  /** 幂等入队：同一 taskId 只出现一次 */
  enqueue(tasks: TaskRecord[]): void {
    for (const task of tasks) {
      if (this.state.order.includes(task.id)) continue;
      this.state.order.push(task.id);
      this.dirty = true;
    }
    this.state.stats.total = this.state.order.length;
  }

  /** 首次失败 → 队首；第 2 次及以后 → 队尾 + 退避 */
  requeue(task: TaskRecord): void {
    const cfg = getConfig();
    const idx = this.state.order.indexOf(task.id);
    if (idx >= 0) this.state.order.splice(idx, 1);
    this.state.inflight = this.state.inflight.filter((x) => x !== task.id);

    if (task.retryCount <= cfg.queue.retryHeadUntil) {
      this.state.order.splice(this.state.cursor, 0, task.id);
      log.info(`重试（第 ${task.retryCount} 次）→ 队首：${task.baseName}`);
    } else {
      const backoff = Math.min(cfg.queue.backoffBaseMs * 2 ** (task.retryCount - 1), cfg.queue.backoffMaxMs);
      this.state.order.push(task.id);
      this.state.delayed = this.state.delayed.filter((d) => d.id !== task.id);
      this.state.delayed.push({ id: task.id, notBefore: Date.now() + backoff });
      log.info(`重试（第 ${task.retryCount} 次）→ 队尾，${Math.round(backoff / 1000)}s 后可用：${task.baseName}`);
    }
    this.dirty = true;
  }

  /** 取出下一个可执行的任务（跳过延迟中的）；游标走到末尾后从头补扫，保证不漏任务 */
  take(): TaskRecord | null {
    const now = Date.now();
    const scan = (from: number): TaskRecord | null => {
      for (let i = from; i < this.state.order.length; i += 1) {
        const id = this.state.order[i];
        const task = this.store.get(id);
        if (!task) continue;
        if (task.stage === 'done' || task.stage === 'skipped') {
          if (i >= this.state.cursor) this.state.cursor = i + 1;
          continue;
        }
        // 正在执行的任务不会被重复投递
        if (this.state.inflight.includes(id)) continue;
        if (DownloadQueue.ACTIVE_STAGES.has(task.stage)) continue;
        const delay = this.state.delayed.find((d) => d.id === id);
        if (delay && delay.notBefore > now) continue;
        this.state.cursor = i + 1;
        this.state.inflight.push(id);
        this.dirty = true;
        return task;
      }
      return null;
    };
    return scan(this.state.cursor) ?? (this.state.cursor > 0 ? scan(0) : null);
  }

  complete(id: string, status: 'done' | 'failed' | 'skipped', bytes = 0): void {
    this.state.inflight = this.state.inflight.filter((x) => x !== id);
    this.state.delayed = this.state.delayed.filter((x) => x.id !== id);
    if (status === 'done') this.state.stats.done += 1;
    else if (status === 'failed') this.state.stats.failed += 1;
    else this.state.stats.skipped += 1;
    this.state.stats.bytesDone += bytes;
    this.dirty = true;
  }

  cancel(id: string): void {
    const idx = this.state.order.indexOf(id);
    if (idx >= 0) this.state.order.splice(idx, 1);
    this.state.inflight = this.state.inflight.filter((x) => x !== id);
    this.dirty = true;
  }

  /** 插队到队首 */
  prioritize(id: string): void {
    const idx = this.state.order.indexOf(id);
    if (idx >= 0) this.state.order.splice(idx, 1);
    this.state.inflight = this.state.inflight.filter((x) => x !== id);
    this.state.order.splice(this.state.cursor, 0, id);
    this.state.delayed = this.state.delayed.filter((x) => x.id !== id);
    this.dirty = true;
  }

  pause(): void {
    this.state.status = 'paused';
    this.dirty = true;
    void this.flush(true);
  }

  resume(): void {
    this.state.status = 'running';
    this.dirty = true;
    void this.flush(true);
  }

  get status(): QueueState['status'] {
    return this.state.status;
  }

  snapshot(): QueueState {
    return this.state;
  }

  remaining(): number {
    return this.state.order.filter((id) => {
      const t = this.store.get(id);
      return t && t.stage !== 'done' && t.stage !== 'skipped';
    }).length;
  }

  async flush(force = false): Promise<void> {
    if (!this.dirty && !force) return;
    this.state.updatedAt = Date.now();
    await writeJsonAtomic(this.file, this.state);
    this.dirty = false;
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    this.state.status = 'stopped';
    void this.flush(true);
  }
}
