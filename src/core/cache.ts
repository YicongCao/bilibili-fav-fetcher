import path from 'node:path';
import { readdir, rm, stat } from 'node:fs/promises';
import { log } from '../utils/logger.js';
import { formatBytes } from '../utils/fsx.js';
import { dirSize } from './disk.js';
import type { TaskStore } from './taskStore.js';

export function mediaCacheRoot(root: string): string {
  return path.join(root, '.cache', 'media');
}

/** 一个任务可能留下两类分片目录：主引擎 <id>、副引擎 <id>-ytdlp */
export function taskCacheDirs(root: string, taskId: string): string[] {
  const base = mediaCacheRoot(root);
  return [path.join(base, taskId), path.join(base, `${taskId}-ytdlp`)];
}

export interface CleanResult {
  removed: number;
  bytes: number;
}

/** 任务封装成功后立即删除它的中间分片 */
export async function cleanTaskCache(root: string, taskId: string): Promise<CleanResult> {
  let bytes = 0;
  let removed = 0;
  for (const dir of taskCacheDirs(root, taskId)) {
    const size = await dirSize(dir).catch(() => 0);
    if (!size) continue;
    await rm(dir, { recursive: true, force: true }).catch(() => undefined);
    bytes += size;
    removed += 1;
  }
  if (bytes) log.debug(`已清理分片缓存 ${taskId}（${formatBytes(bytes)}）`);
  return { removed, bytes };
}

/** 清理已完成/已跳过任务残留的分片（未完成任务的分片保留，用于续传） */
export async function cleanDoneCache(root: string, store: TaskStore): Promise<CleanResult> {
  const keep = new Set<string>();
  for (const task of store.all()) {
    if (task.stage !== 'done' && task.stage !== 'skipped') keep.add(task.id);
  }

  const base = mediaCacheRoot(root);
  const entries = await readdir(base).catch(() => [] as string[]);
  let bytes = 0;
  let removed = 0;
  for (const name of entries) {
    const id = name.replace(/-ytdlp$/, '');
    if (keep.has(id)) continue;
    const dir = path.join(base, name);
    const info = await stat(dir).catch(() => null);
    if (!info?.isDirectory()) continue;
    const size = await dirSize(dir).catch(() => 0);
    await rm(dir, { recursive: true, force: true }).catch(() => undefined);
    bytes += size;
    removed += 1;
  }
  return { removed, bytes };
}

/** 清空全部分片缓存（未完成任务将重新完整下载） */
export async function cleanAllCache(root: string): Promise<CleanResult> {
  const base = mediaCacheRoot(root);
  const bytes = await dirSize(base).catch(() => 0);
  await rm(base, { recursive: true, force: true }).catch(() => undefined);
  return { removed: bytes ? 1 : 0, bytes };
}
