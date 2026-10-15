import path from 'node:path';
import { readJson, writeJsonAtomic } from '../utils/fsx.js';
import { log } from '../utils/logger.js';
import type { TaskRecord } from '../types/index.js';

/**
 * 任务库：断点续传的唯一依据
 * - 内存即时更新 + 节流原子落盘（默认 500ms）
 * - 关键节点（阶段切换/完成/失败/退出）强制 flush
 */
export class TaskStore {
  private tasks = new Map<string, TaskRecord>();

  private dirty = false;

  private timer: NodeJS.Timeout | null = null;

  private constructor(
    readonly file: string,
    private readonly flushMs: number,
  ) {}

  static async load(root: string, flushMs = 500): Promise<TaskStore> {
    const file = path.join(root, '.state', 'tasks.json');
    const store = new TaskStore(file, flushMs);
    const list = await readJson<TaskRecord[]>(file);
    for (const t of list ?? []) store.tasks.set(t.id, t);
    if (list?.length) log.info(`已载入任务库：${list.length} 个任务`);
    return store;
  }

  startAutoFlush(): void {
    if (this.timer) return;
    this.timer = setInterval(() => {
      void this.flush();
    }, this.flushMs);
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    void this.flush(true);
  }

  upsert(task: TaskRecord): void {
    task.updatedAt = Date.now();
    this.tasks.set(task.id, task);
    this.dirty = true;
  }

  get(id: string): TaskRecord | undefined {
    return this.tasks.get(id);
  }

  all(): TaskRecord[] {
    return [...this.tasks.values()];
  }

  pending(): TaskRecord[] {
    return this.all().filter(
      (t) => t.stage !== 'done' && t.stage !== 'skipped',
    );
  }

  /** 扫盘校验后的恢复信息 */
  recover(): { resumed: number; failed: number } {
    let resumed = 0;
    let failed = 0;
    for (const task of this.tasks.values()) {
      if (task.stage === 'done' || task.stage === 'skipped') continue;
      if (['planning', 'downloading', 'muxing', 'finalizing'].includes(task.stage)) {
        // 分片文件保留在 .cache，回到 queued 由队列重新投递并续传
        task.stage = 'queued';
        resumed += 1;
      } else if (task.stage === 'failed') {
        failed += 1;
      }
    }
    return { resumed, failed };
  }

  async flush(force = false): Promise<void> {
    if (!this.dirty && !force) return;
    await writeJsonAtomic(this.file, this.all());
    this.dirty = false;
  }
}
