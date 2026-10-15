import path from 'node:path';
import { mkdir, rename, rm, stat } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { getConfig } from '../config.js';
import { log } from '../utils/logger.js';
import { muxToContainer } from './muxer.js';
import { probeFile } from '../utils/ffmpeg.js';
import { finalizeTask } from './finalize.js';
import { Watchdog } from './watchdog.js';
import { createEngine, decideEngine, type EngineName } from './engines/index.js';
import type { TaskRecord } from '../types/index.js';
import type { TaskStore } from './taskStore.js';
import type { DownloadQueue } from './queue.js';

export interface PipelineContext {
  cookies: Record<string, string>;
  store: TaskStore;
  queue: DownloadQueue;
}

export interface PipelineHooks {
  onTaskUpdate?: (task: TaskRecord) => void;
}

export function destPath(task: TaskRecord, root: string): string {
  return path.join(root, task.outDir, `${task.baseName}.${task.container}`);
}

/** 处理单个任务：选引擎 → 计划 → 下载（带停滞看门狗）→ 封装 → 收尾 */
async function processTask(task: TaskRecord, ctx: PipelineContext, hooks: PipelineHooks): Promise<void> {
  const config = getConfig();
  const root = config.output.root;
  const dest = destPath(task, root);

  if (config.download.skipExisting && existsSync(dest)) {
    task.stage = 'skipped';
    ctx.store.upsert(task);
    ctx.queue.complete(task.id, 'skipped');
    hooks.onTaskUpdate?.(task);
    return;
  }

  const controller = new AbortController();
  let stallCount = 0;
  const watchdog = new Watchdog(task.id, (event) => {
    stallCount = event.stallCount;
    // 第 1 次：断开重连（不换引擎）；第 3 次：交由下面的引擎决策切换
    controller.abort();
  });
  watchdog.start();

  let currentEngine: EngineName = decideEngine(task) ?? 'native';
  task.engine = currentEngine;

  try {
    for (let attempt = 0; attempt < 3; attempt += 1) {
      if (controller.signal.aborted && attempt > 0) {
        // 停滞中断后的重连重试
        log.info(`重试 ${task.baseName}（停滞重连，第 ${attempt} 次）`);
      }
      const engine = createEngine(currentEngine, ctx.cookies);
      const plan = await engine.plan(task);
      task.quality = {
        want: config.download.quality,
        got: plan.qualityLabel,
        hdr: plan.hdr,
        fps: plan.fps,
        codec: plan.codec,
        width: plan.width,
        height: plan.height,
        degraded: plan.degraded,
      };
      task.stage = 'downloading';
      ctx.store.upsert(task);
      hooks.onTaskUpdate?.(task);

      const result = await engine.run(task, plan, {
        signal: controller.signal,
        onProgress: (bytesDone, bytesTotal, speed) => {
          watchdog.tick(bytesDone);
          task.progress = {
            bytesDone,
            bytesTotal,
            speedBps: speed,
            etaSec: speed ? Math.round((bytesTotal - bytesDone) / speed) : 0,
          };
          hooks.onTaskUpdate?.(task);
        },
      });

      task.stage = 'muxing';
      ctx.store.upsert(task);
      await mkdir(path.dirname(dest), { recursive: true });

      const label =
        task.partTitle && task.totalPages > 1 ? `${task.title} P${task.page} ${task.partTitle}` : task.title;
      const meta = {
        title: label,
        artist: task.up.name,
        date: new Date(task.pubDate || Date.now()).toISOString().slice(0, 10),
        comment: `${task.bvid} P${task.page}`,
        description: task.desc?.slice(0, 500),
        genre: 'bilibili',
      };

      if (result.audioFile) {
        await muxToContainer({ videoFile: result.videoFile, audioFile: result.audioFile, dest, hdr: plan.hdr, meta });
      } else {
        // 副引擎已产出成品容器：补写元数据后落位
        const tmp = `${dest}.muxing`;
        await muxToContainer({ videoFile: result.videoFile, dest: tmp, hdr: false, meta, faststart: true });
        await rename(tmp, dest);
      }

      const probe = await probeFile(dest);
      if (!probe.hasVideo) throw new Error('封装产物缺少视频流');

      task.stage = 'finalizing';
      ctx.store.upsert(task);
      await finalizeTask(ctx.cookies, task, dest);

      task.stage = 'done';
      ctx.store.upsert(task);
      ctx.queue.complete(task.id, 'done', (await stat(dest).catch(() => ({ size: 0 }))).size);
      hooks.onTaskUpdate?.(task);
      log.info(`✔ ${path.basename(dest)}（${probe.width}x${probe.height}，${probe.duration.toFixed(0)}s）`);
      return;
    }
    throw new Error('重试次数耗尽');
  } catch (err) {
    const message = (err as Error).message;
    task.retryCount += 1;
    task.error = { code: 'DOWNLOAD_FAIL', message, at: Date.now() };

    const next = decideEngine(task, { errorCode: task.error.code, stallCount });
    const maxRetry = config.download.retry;
    const canRetry = task.retryCount <= maxRetry;

    task.stage = canRetry ? 'queued' : 'failed';
    if (next !== currentEngine && canRetry) {
      log.warn(`切换引擎 ${currentEngine} → ${next}：${task.baseName}`);
      task.engine = next;
      task.engineHistory = [...(task.engineHistory ?? []), { engine: currentEngine, at: Date.now(), result: 'switched' }];
      ctx.queue.prioritize(task.id);
    } else if (canRetry) {
      ctx.queue.requeue(task);
    } else {
      task.stage = 'failed';
      ctx.queue.complete(task.id, 'failed');
    }
    ctx.store.upsert(task);
    hooks.onTaskUpdate?.(task);
    log.error(`✖ ${task.baseName}：${message}`);
  } finally {
    watchdog.stop();
  }
}

/** 队列驱动的流水线：并行取任务，下载/转码信号量在 processTask 内部分别生效 */
export async function runQueue(
  ctx: PipelineContext,
  hooks: PipelineHooks = {},
): Promise<{ done: number; failed: number; skipped: number }> {
  const config = getConfig();
  const workers = Math.max(1, Math.min(3, config.download.maxParallelTasks));

  const worker = async () => {
    for (;;) {
      if (ctx.queue.status !== 'running') return;
      const task = ctx.queue.take();
      if (!task) return;
      await processTask(task, ctx, hooks);
      await ctx.queue.flush();
      await ctx.store.flush();
    }
  };

  await Promise.all(Array.from({ length: workers }, () => worker()));

  const all = ctx.store.all();
  return {
    done: all.filter((t) => t.stage === 'done').length,
    failed: all.filter((t) => t.stage === 'failed').length,
    skipped: all.filter((t) => t.stage === 'skipped').length,
  };
}

/** 清理孤儿临时文件 */
export async function cleanOrphans(root: string): Promise<void> {
  const cache = path.join(root, '.cache', 'media');
  if (existsSync(cache)) {
    log.debug(`保留缓存目录 ${cache}（分片续传需要）`);
  }
  void rm(`${cache}/.DS_Store`, { force: true }).catch(() => undefined);
}
