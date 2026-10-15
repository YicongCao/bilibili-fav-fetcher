import { createWriteStream } from 'node:fs';
import { createReadStream } from 'node:fs';
import { stat, unlink } from 'node:fs/promises';
import { Readable, pipeline } from 'node:stream';
import { promisify } from 'node:util';
import { cookieHeader } from './http.js';
import { httpFetch } from './net.js';

const pipelineAsync = promisify(pipeline);

export class IdleTimeoutError extends Error {
  constructor(readonly idleMs: number) {
    super(`读取空闲超过 ${idleMs}ms，判定为停滞`);
    this.name = 'IdleTimeoutError';
  }
}

export interface RangeOptions {
  url: string;
  cookies?: Record<string, string>;
  headers?: Record<string, string>;
  file: string;
  append?: boolean;
  rangeStart?: number;
  rangeEnd?: number;
  timeoutMs?: number;
  idleMs?: number;
  onBytes?: (n: number) => void;
}

/** 把一段 Range 响应流式写入文件；支持空闲停滞中断 */
export async function downloadRange(opts: RangeOptions): Promise<number> {
  const headers: Record<string, string> = { ...(opts.headers ?? {}) };
  if (opts.cookies && Object.keys(opts.cookies).length) headers.Cookie = cookieHeader(opts.cookies);
  if (opts.rangeStart !== undefined) {
    headers.Range = `bytes=${opts.rangeStart}-${opts.rangeEnd ?? ''}`;
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), opts.timeoutMs ?? 30_000);

  const res = await httpFetch(opts.url, { headers, signal: controller.signal, redirect: 'follow' });
  clearTimeout(timer);
  if (!res.ok && res.status !== 206) {
    throw new Error(`HTTP ${res.status} ${res.statusText}`);
  }
  if (!res.body) throw new Error('响应无 body');

  let written = 0;
  let lastAt = Date.now();
  const idleMs = opts.idleMs ?? 20_000;
  const idleTimer = setInterval(() => {
    if (Date.now() - lastAt > idleMs) controller.abort();
  }, 1000);

  const source = Readable.fromWeb(res.body as Parameters<typeof Readable.fromWeb>[0]);
  source.on('data', (chunk: Buffer) => {
    const n = chunk.length;
    written += n;
    lastAt = Date.now();
    opts.onBytes?.(n);
  });

  const dest = createWriteStream(opts.file, { flags: opts.append ? 'a' : 'w' });
  try {
    await pipelineAsync(source, dest);
  } catch (err) {
    if (controller.signal.aborted && Date.now() - lastAt > idleMs) {
      throw new IdleTimeoutError(idleMs);
    }
    throw err;
  } finally {
    clearInterval(idleTimer);
  }
  return written;
}

export async function fileSize(file: string): Promise<number> {
  try {
    const s = await stat(file);
    return s.size;
  } catch {
    return 0;
  }
}

/** 顺序合并分片文件为最终文件 */
export async function concatParts(parts: string[], dest: string): Promise<void> {
  const out = createWriteStream(dest, { flags: 'w' });
  for (const p of parts) {
    await pipelineAsync(createReadStream(p), out, { end: false });
    await unlink(p).catch(() => undefined);
  }
  await new Promise<void>((resolve, reject) => {
    out.end((err?: Error | null) => (err ? reject(err) : resolve()));
  });
}
