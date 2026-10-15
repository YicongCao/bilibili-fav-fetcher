import { promises as fs } from 'node:fs';
import path from 'node:path';

/** 解析为绝对路径（相对路径基于当前工作目录） */
export function resolvePath(p: string): string {
  return path.isAbsolute(p) ? p : path.resolve(process.cwd(), p);
}

export async function ensureDir(dir: string): Promise<void> {
  await fs.mkdir(dir, { recursive: true });
}

export async function pathExists(p: string): Promise<boolean> {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

export async function readJson<T>(file: string): Promise<T | null> {
  if (!(await pathExists(file))) return null;
  try {
    const text = await fs.readFile(file, 'utf8');
    return JSON.parse(text) as T;
  } catch {
    return null;
  }
}

/** 原子写：写 .tmp 后 rename，避免进程被杀导致文件损坏 */
export async function writeJsonAtomic(file: string, data: unknown): Promise<void> {
  const target = resolvePath(file);
  await ensureDir(path.dirname(target));
  // 唯一临时文件名：避免并发 flush 时相互覆盖导致 rename 失败
  const tmp = `${target}.${process.pid}.${Math.random().toString(36).slice(2, 8)}.tmp`;
  await fs.writeFile(tmp, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
  await fs.rename(tmp, target);
}

/** 原子写文本（不走 JSON.stringify，用于 library.js 这类「内容即代码」的文件） */
export async function writeTextAtomic(file: string, text: string): Promise<void> {
  const target = resolvePath(file);
  await ensureDir(path.dirname(target));
  const tmp = `${target}.${process.pid}.${Math.random().toString(36).slice(2, 8)}.tmp`;
  await fs.writeFile(tmp, text, 'utf8');
  await fs.rename(tmp, target);
}

export async function chmod600(file: string): Promise<void> {
  try {
    await fs.chmod(resolvePath(file), 0o600);
  } catch {
    /* 忽略（如文件系统不支持） */
  }
}

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return '-';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let v = bytes;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i += 1;
  }
  return `${v.toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}
