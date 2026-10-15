import path from 'node:path';
import { readdir, stat, statfs } from 'node:fs/promises';
import { getConfig } from '../config.js';

export interface DiskUsage {
  /** outputs 根目录 */
  root: string;
  /** 目录总占用（含 .cache 中间分片） */
  usedBytes: number;
  /** 其中 .cache 占用 */
  cacheBytes: number;
  /** 上限字节数；null = 不限制 */
  limitBytes: number | null;
  /** usedBytes / limitBytes */
  ratio: number;
  /** 所在磁盘剩余 / 总容量 */
  freeBytes: number;
  totalBytes: number;
  /** 采样时间 */
  at: number;
}

const cache = new Map<string, { usage: DiskUsage; at: number }>();

/** 递归统计目录体积（跳过无权限/已删除的条目） */
export async function dirSize(dir: string): Promise<number> {
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return 0;
  }
  let total = 0;
  // 分批并发，避免一次性打开过多 fd
  for (let i = 0; i < entries.length; i += 32) {
    const batch = entries.slice(i, i + 32);
    const sizes = await Promise.all(
      batch.map(async (e) => {
        const p = path.join(dir, e.name);
        try {
          if (e.isDirectory()) return await dirSize(p);
          if (e.isFile()) return (await stat(p)).size;
        } catch {
          /* 忽略 */
        }
        return 0;
      }),
    );
    total += sizes.reduce((a, b) => a + b, 0);
  }
  return total;
}

async function fsSpace(dir: string): Promise<{ freeBytes: number; totalBytes: number }> {
  try {
    const s = await statfs(dir);
    return { freeBytes: Number(s.bavail) * Number(s.bsize), totalBytes: Number(s.blocks) * Number(s.bsize) };
  } catch {
    return { freeBytes: 0, totalBytes: 0 };
  }
}

/** outputs 目录占用采样（默认按 limits.checkEveryMs 缓存） */
export async function outputUsage(root: string, opts: { maxAgeMs?: number } = {}): Promise<DiskUsage> {
  const cfg = getConfig();
  const maxAge = opts.maxAgeMs ?? cfg.limits.checkEveryMs;
  const hit = cache.get(root);
  if (hit && Date.now() - hit.at < maxAge) return hit.usage;

  const [usedBytes, cacheBytes, space] = await Promise.all([
    dirSize(root),
    dirSize(path.join(root, '.cache')),
    fsSpace(root),
  ]);
  const limitBytes = cfg.limits.maxOutputGB === null ? null : Math.round(cfg.limits.maxOutputGB * 1024 ** 3);
  const usage: DiskUsage = {
    root,
    usedBytes,
    cacheBytes,
    limitBytes,
    ratio: limitBytes ? usedBytes / limitBytes : 0,
    freeBytes: space.freeBytes,
    totalBytes: space.totalBytes,
    at: Date.now(),
  };
  cache.set(root, { usage, at: usage.at });
  return usage;
}

export function isOverLimit(usage: DiskUsage): boolean {
  return usage.limitBytes !== null && usage.usedBytes >= usage.limitBytes;
}

export function isNearLimit(usage: DiskUsage): boolean {
  const cfg = getConfig();
  return usage.limitBytes !== null && usage.ratio >= cfg.limits.warnRatio;
}

/** 手动刷新（如清空缓存后） */
export function invalidateUsage(root?: string): void {
  if (root) cache.delete(root);
  else cache.clear();
}
