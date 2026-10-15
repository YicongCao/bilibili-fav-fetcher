import path from 'node:path';
import { writeFile } from 'node:fs/promises';
import { fetchDanmaku } from '../api/danmaku.js';
import { layoutDanmaku } from '../danmaku/layout.js';
import { buildAss } from '../danmaku/ass.js';
import { buildSrt } from '../danmaku/srt.js';
import { writeCover } from './cover.js';
import { updateIndexLocal, writeSidecarMeta } from './sidecar.js';
import { log } from '../utils/logger.js';
import { getConfig } from '../config.js';
import type { TaskRecord } from '../types/index.js';

/** 弹幕落盘：与视频同名同目录，ass + srt 各一份 */
export async function writeDanmaku(
  cookies: Record<string, string>,
  task: TaskRecord,
  videoFile: string,
): Promise<string[]> {
  const config = getConfig();
  if (!config.danmaku.enabled || !config.danmaku.formats.length) return [];

  const items = await fetchDanmaku(task.cid, cookies);
  if (!items.length) {
    log.debug(`${task.baseName}：无弹幕`);
    return [];
  }

  const width = task.quality?.width || 1920;
  const height = task.quality?.height || 1080;
  const placed = layoutDanmaku(items, { width, height, maxOverlap: config.danmaku.maxOverlap });

  const written: string[] = [];
  for (const format of config.danmaku.formats) {
    const file = `${videoFile.slice(0, videoFile.lastIndexOf('.'))}.${format}`;
    const content = format === 'ass' ? buildAss(placed, { width, height, title: task.title }) : buildSrt(items);
    await writeFile(file, content, 'utf8');
    written.push(file);
  }
  log.info(`弹幕 ${path.basename(videoFile)}：${items.length} 条 → ${config.danmaku.formats.join('+')}`);
  return written;
}

/** 收尾：弹幕 → 封面 → metadata 侧车 → 回写 index.json */
export async function finalizeTask(
  cookies: Record<string, string>,
  task: TaskRecord,
  videoFile: string,
): Promise<void> {
  const config = getConfig();
  const subtitles = await writeDanmaku(cookies, task, videoFile).catch((err) => {
    log.warn(`弹幕失败（${task.bvid}）：${(err as Error).message}`);
    return [] as string[];
  });
  const poster = await writeCover(task, videoFile);
  const meta = await writeSidecarMeta(task, videoFile, { poster, subtitles });
  await updateIndexLocal(config.output.root, task, videoFile, { poster, subtitles, meta });
}
