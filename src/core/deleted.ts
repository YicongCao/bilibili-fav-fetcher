import path from 'node:path';
import { readJson, writeJsonAtomic } from '../utils/fsx.js';

export interface DeletedEntry {
  bvid: string;
  page: number;
  title: string;
  at: number;
  bytes?: number;
}

export interface DeletedFile {
  schema: 'bili-dl/deleted@1';
  items: Record<string, DeletedEntry>;
}

/** 删除标记：bvid + 分 P（删除后保留 metadata，靠这个标记避免下载器重新下载） */
export function deletedKey(bvid: string, page: number): string {
  return `${bvid}:${page}`;
}

export function deletedFile(root: string): string {
  return path.join(root, '.state', 'deleted.json');
}

const cache = new Map<string, { at: number; data: DeletedFile }>();

/** 读取删除标记（进程内 3s 缓存，避免每个任务都读盘） */
export async function loadDeleted(root: string): Promise<DeletedFile> {
  const file = deletedFile(root);
  const hit = cache.get(file);
  if (hit && Date.now() - hit.at < 3000) return hit.data;
  const saved = await readJson<DeletedFile>(file);
  const data: DeletedFile = saved?.schema === 'bili-dl/deleted@1' ? saved : { schema: 'bili-dl/deleted@1', items: {} };
  cache.set(file, { at: Date.now(), data });
  return data;
}

export function invalidateDeleted(root: string): void {
  cache.delete(deletedFile(root));
}

export async function isDeleted(root: string, bvid: string, page: number): Promise<boolean> {
  const data = await loadDeleted(root);
  return Boolean(data.items[deletedKey(bvid, page)]);
}

export async function markDeleted(root: string, entries: DeletedEntry[]): Promise<void> {
  const data = await loadDeleted(root);
  for (const e of entries) data.items[deletedKey(e.bvid, e.page)] = e;
  await writeJsonAtomic(deletedFile(root), data);
  invalidateDeleted(root);
}

export async function restoreDeleted(root: string, keys: string[]): Promise<number> {
  const data = await loadDeleted(root);
  let n = 0;
  for (const k of keys) {
    if (data.items[k]) {
      delete data.items[k];
      n += 1;
    }
  }
  await writeJsonAtomic(deletedFile(root), data);
  invalidateDeleted(root);
  return n;
}
