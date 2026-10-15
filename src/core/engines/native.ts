import path from 'node:path';
import { mkdir } from 'node:fs/promises';
import { playurl } from '../../api/playurl.js';
import { selectBest, type QualityResult } from '../quality.js';
import { downloadFile } from '../downloader.js';
import { getConfig } from '../../config.js';
import { log } from '../../utils/logger.js';
import type { DownloadEngine, MediaPlanResult, RunHooks } from './types.js';
import type { TaskRecord } from '../../types/index.js';

export const NATIVE_HEADERS = {
  Referer: 'https://www.bilibili.com/',
  'User-Agent':
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
};

export interface NativePlan extends MediaPlanResult {
  raw: QualityResult;
}

/** 主引擎（自研）：选流 + 多线程分片下载，零外部依赖 */
export class NativeEngine implements DownloadEngine {
  readonly name = 'native' as const;

  constructor(private readonly cookies: Record<string, string> = {}) {}

  async healthcheck(): Promise<{ ok: boolean; version?: string; reason?: string }> {
    return { ok: true, version: 'native-1.0' };
  }

  async plan(task: TaskRecord): Promise<NativePlan> {
    const config = getConfig();
    const data = await playurl(this.cookies, task.bvid, task.cid, config.download.fnval);
    const quality = selectBest(data, config.download, task.duration);
    if (!quality) throw Object.assign(new Error('未获取到可用视频流'), { code: 'NO_STREAM' });

    const cacheDir = path.join(config.output.root, '.cache', 'media', task.id);
    await mkdir(cacheDir, { recursive: true });
    return {
      kind: 'dash',
      videoFile: path.join(cacheDir, 'video.m4s'),
      audioFile: quality.audio ? path.join(cacheDir, 'audio.m4s') : undefined,
      qualityLabel: `${quality.video.qualityLabel}${quality.video.hdr ? ' HDR' : ''}`,
      hdr: quality.video.hdr,
      fps: quality.video.fps,
      codec: quality.video.codec,
      width: quality.video.width,
      height: quality.video.height,
      degraded: quality.degraded,
      raw: quality,
    };
  }

  async run(task: TaskRecord, plan: NativePlan, hooks: RunHooks): Promise<{ videoFile: string; audioFile?: string }> {
    const config = getConfig();
    const headers = { ...NATIVE_HEADERS, Referer: `https://www.bilibili.com/video/${task.bvid}/` };

    const total = plan.raw.video.bytes + (plan.raw.audio?.bytes ?? 0);
    let base = 0;

    await downloadFile({
      url: plan.raw.video.url,
      backupUrls: plan.raw.video.backupUrls,
      dest: plan.videoFile,
      cookies: this.cookies,
      headers,
      threads: config.download.maxStreamsPerTask,
      idleMs: config.timeout.idleMs,
      signal: hooks.signal,
      onProgress: (d, _t, speed) => hooks.onProgress?.(d, total, speed),
    });

    if (plan.raw.audio && plan.audioFile) {
      const done = base + plan.raw.video.bytes;
      await downloadFile({
        url: plan.raw.audio.url,
        backupUrls: plan.raw.audio.backupUrls,
        dest: plan.audioFile,
        cookies: this.cookies,
        headers,
        threads: config.download.maxStreamsPerTask,
        idleMs: config.timeout.idleMs,
        signal: hooks.signal,
        onProgress: (d, _t, speed) => hooks.onProgress?.(done + d, total, speed),
      });
    }

    log.info(
      `已下载 ${task.baseName}（${plan.qualityLabel} ${plan.width}x${plan.height} ${plan.fps}fps ${plan.codec}）`,
    );
    return { videoFile: plan.videoFile, audioFile: plan.audioFile };
  }
}
