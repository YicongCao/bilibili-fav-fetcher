import path from 'node:path';
import { writeFile } from 'node:fs/promises';
import { fetchDanmaku } from '../api/danmaku.js';
import { layoutDanmaku } from '../danmaku/layout.js';
import { buildAss } from '../danmaku/ass.js';
import { buildSrt } from '../danmaku/srt.js';
import { log } from '../utils/logger.js';
import { getConfig } from '../config.js';
import type { TaskRecord } from '../types/index.js';

/** 弹幕落盘：与视频同名同目录，ass + srt 各一份 */
export async function writeDanmaku(cookies: Record<string, string>, task: TaskRecord, videoFile: string): Promise<string[]> {
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
    const content =
      format === 'ass'
        ? buildAss(placed, { width, height, title: task.title })
        : buildSrt(items);
    await writeFile(file, content, 'utf8');
    written.push(file);
  }
  log.info(`弹幕 ${path.basename(videoFile)}：${items.length} 条 → ${config.danmaku.formats.join('+')}`);
  return written;
}
