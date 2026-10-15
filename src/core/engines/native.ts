import path from 'node:path';
import { mkdir } from 'node:fs/promises';
import { playurl } from '../../api/playurl.js';
import { selectBest, type QualityResult } from '../quality.js';
import { downloadFile } from '../downloader.js';
import { getConfig } from '../../config.js';
import { log } from '../../utils/logger.js';
import { WEB_REFERER } from '../../api/client.js';
import type { TaskRecord } from '../../types/index.js';

export const NATIVE_HEADERS = {
  Referer: WEB_REFERER,
  'User-Agent':
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
};

export interface MediaPlan {
  quality: QualityResult;
  videoFile: string;
  audioFile?: string;
  cacheDir: string;
}

/** 主引擎（native）：选流并给出本地缓存路径 */
export async function planMedia(cookies: Record<string, string>, task: TaskRecord): Promise<MediaPlan> {
  const config = getConfig();
  const data = await playurl(cookies, task.bvid, task.cid, config.download.fnval);
  const quality = selectBest(data, config.download, task.duration);
  if (!quality) throw Object.assign(new Error('未获取到可用视频流'), { code: 'NO_STREAM' });

  const cacheDir = path.join(config.output.root, '.cache', 'media', task.id);
  await mkdir(cacheDir, { recursive: true });
  return {
    quality,
    videoFile: path.join(cacheDir, 'video.m4s'),
    audioFile: quality.audio ? path.join(cacheDir, 'audio.m4s') : undefined,
    cacheDir,
  };
}

/** 主引擎（native）：下载视频/音频流到缓存目录（分片 ≤3、可续传） */
export async function downloadMedia(
  cookies: Record<string, string>,
  task: TaskRecord,
  plan: MediaPlan,
  hooks: {
    onProgress?: (bytesDone: number, bytesTotal: number, speedBps: number) => void;
    signal?: AbortSignal;
  } = {},
): Promise<{ videoFile: string; audioFile?: string }> {
  const config = getConfig();
  const headers = { ...NATIVE_HEADERS, Referer: `https://www.bilibili.com/video/${task.bvid}/` };

  let done = 0;
  const total = plan.quality.video.bytes + (plan.quality.audio?.bytes ?? 0);
  const report = () => hooks.onProgress?.(done, total, 0);

  await downloadFile({
    url: plan.quality.video.url,
    backupUrls: plan.quality.video.backupUrls,
    dest: plan.videoFile,
    cookies,
    headers,
    threads: config.download.maxStreamsPerTask,
    idleMs: config.timeout.idleMs,
    signal: hooks.signal,
    onProgress: (d) => {
      done = d;
      report();
    },
  });

  if (plan.quality.audio && plan.audioFile) {
    const base = done;
    await downloadFile({
      url: plan.quality.audio.url,
      backupUrls: plan.quality.audio.backupUrls,
      dest: plan.audioFile,
      cookies,
      headers,
      threads: config.download.maxStreamsPerTask,
      idleMs: config.timeout.idleMs,
      signal: hooks.signal,
      onProgress: (d) => {
        done = base + d;
        report();
      },
    });
  }

  log.info(
    `已下载 ${task.baseName}（${plan.quality.video.qualityLabel}${plan.quality.video.hdr ? ' HDR' : ''} ${plan.quality.video.width}x${plan.quality.video.height} ${plan.quality.video.fps}fps ${plan.quality.video.codec}）`,
  );
  return { videoFile: plan.videoFile, audioFile: plan.audioFile };
}
