import path from 'node:path';
import { writeFile } from 'node:fs/promises';
import { httpFetch } from '../utils/net.js';
import { UA, WEB_REFERER } from '../api/client.js';
import { log } from '../utils/logger.js';
import type { TaskRecord } from '../types/index.js';

/** 去掉 @320w_200h_1c 之类的裁剪后缀，取原图 */
export function originalCoverUrl(url: string): string {
  return url.replace(/@[^@/]*$/, '');
}

function extFromContentType(contentType: string): string {
  const type = contentType.toLowerCase();
  if (type.includes('png')) return '.png';
  if (type.includes('webp')) return '.jpg';
  if (type.includes('gif')) return '.gif';
  return '.jpg';
}

/** 封面下载：与视频同名同目录 */
export async function writeCover(task: TaskRecord, videoFile: string): Promise<string | null> {
  if (!task.cover) return null;
  const url = originalCoverUrl(task.cover);
  try {
    const res = await httpFetch(url, { headers: { 'User-Agent': UA, Referer: WEB_REFERER } });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const buf = Buffer.from(await res.arrayBuffer());
    const ext = extFromContentType(res.headers.get('content-type') ?? 'image/jpeg');
    const file = `${videoFile.slice(0, videoFile.lastIndexOf('.'))}${ext}`;
    await writeFile(file, buf);
    log.debug(`封面 ${path.basename(file)}：${buf.length} 字节`);
    return file;
  } catch (err) {
    log.warn(`封面下载失败（${task.bvid}）：${(err as Error).message}`);
    return null;
  }
}
