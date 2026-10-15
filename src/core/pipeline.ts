import path from 'node:path';
import { mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { getConfig } from '../config.js';
import { log } from '../utils/logger.js';
import { downloadMedia, planMedia } from './engines/native.js';
import { muxToContainer } from './muxer.js';
import { probeFile } from '../utils/ffmpeg.js';
import type { TaskRecord } from '../types/index.js';

class Semaphore {
  private active = 0;

  private readonly queue: Array<() => void> = [];

  constructor(private readonly limit: number) {}

  async acquire(): Promise<void> {
    if (this.active < this.limit) {
      this.active += 1;
      return;
    }
    await new Promise<void>((resolve) => this.queue.push(resolve));
    this.active += 1;
  }

  release(): void {
    this.active -= 1;
    const next = this.queue.shift();
    if (next) next();
  }
}

export interface PipelineHooks {
  onTaskUpdate?: (task: TaskRecord) => void;
  /** 封装完成后的收尾（弹幕 / 封面 / metadata），由 S5/S6 注入 */
  finalize?: (task: TaskRecord, file: string) => Promise<void>;
}

export function destPath(task: TaskRecord, root: string): string {
  return path.join(root, task.outDir, `${task.baseName}.${task.container}`);
}

/**
 * 流水线：下载队列（≤3）与转码队列（≤3）重叠执行
 * 任务下载完立刻交棒转码，下载槽立即释放给下一个任务
 */
export async function runPipeline(
  cookies: Record<string, string>,
  tasks: TaskRecord[],
  hooks: PipelineHooks = {},
): Promise<{ done: number; failed: number; skipped: number }> {
  const config = getConfig();
  const root = config.output.root;
  const dlSem = new Semaphore(Math.max(1, Math.min(3, config.download.maxParallelTasks)));
  const muxSem = new Semaphore(Math.max(1, Math.min(3, config.mux.maxParallel)));

  let done = 0;
  let failed = 0;
  let skipped = 0;

  await Promise.all(
    tasks.map(async (task) => {
      const dest = destPath(task, root);
      if (config.download.skipExisting && existsSync(dest)) {
        task.stage = 'skipped';
        skipped += 1;
        hooks.onTaskUpdate?.(task);
        return;
      }

      await dlSem.acquire();
      let plan;
      try {
        task.stage = 'planning';
        hooks.onTaskUpdate?.(task);
        plan = await planMedia(cookies, task);
        task.quality = {
          want: plan.quality.want,
          got: `${plan.quality.video.qualityLabel}${plan.quality.video.hdr ? ' HDR' : ''}`,
          hdr: plan.quality.video.hdr,
          fps: plan.quality.video.fps,
          codec: plan.quality.video.codec,
          width: plan.quality.video.width,
          height: plan.quality.video.height,
          degraded: plan.quality.degraded,
        };

        task.stage = 'downloading';
        hooks.onTaskUpdate?.(task);
        await downloadMedia(cookies, task, plan, {
          onProgress: (bytesDone, bytesTotal, speed) => {
            task.progress = { bytesDone, bytesTotal, speedBps: speed, etaSec: speed ? Math.round((bytesTotal - bytesDone) / speed) : 0 };
            hooks.onTaskUpdate?.(task);
          },
        });
      } catch (err) {
        task.stage = 'failed';
        task.error = { code: 'DOWNLOAD_FAIL', message: (err as Error).message, at: Date.now() };
        failed += 1;
        hooks.onTaskUpdate?.(task);
        dlSem.release();
        return;
      }
      dlSem.release();

      await muxSem.acquire();
      try {
        task.stage = 'muxing';
        hooks.onTaskUpdate?.(task);
        await mkdir(path.dirname(dest), { recursive: true });

        const label = task.partTitle && task.totalPages > 1 ? `${task.title} P${task.page} ${task.partTitle}` : task.title;
        await muxToContainer({
          videoFile: plan.videoFile,
          audioFile: plan.audioFile,
          dest,
          hdr: plan.quality.video.hdr,
          meta: {
            title: label,
            artist: task.up.name,
            date: new Date(task.pubDate || Date.now()).toISOString().slice(0, 10),
            comment: `${task.bvid} P${task.page}`,
            description: task.desc?.slice(0, 500),
            genre: 'bilibili',
          },
        });

        const probe = await probeFile(dest);
        if (!probe.hasVideo) throw new Error('封装产物缺少视频流');

        task.stage = 'finalizing';
        hooks.onTaskUpdate?.(task);
        await hooks.finalize?.(task, dest);

        task.stage = 'done';
        done += 1;
        hooks.onTaskUpdate?.(task);
        log.info(`✔ ${path.basename(dest)}（${probe.width}x${probe.height}，${probe.duration.toFixed(0)}s，音轨：${probe.hasAudio ? '有' : '无'}）`);
      } catch (err) {
        task.stage = 'failed';
        task.error = { code: 'MUX_FAIL', message: (err as Error).message, at: Date.now() };
        failed += 1;
        log.error(`✖ ${task.baseName}：${(err as Error).message}`);
        hooks.onTaskUpdate?.(task);
      } finally {
        muxSem.release();
      }
    }),
  );

  return { done, failed, skipped };
}
