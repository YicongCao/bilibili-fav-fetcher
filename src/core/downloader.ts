import path from 'node:path';
import { mkdir, rename, rm, stat, writeFile } from 'node:fs/promises';
import { concatParts, downloadRange, fileSize } from '../utils/stream.js';
import { httpFetch } from '../utils/net.js';
import { log } from '../utils/logger.js';

export interface DownloadFileOptions {
  url: string;
  backupUrls?: string[];
  dest: string;
  cookies?: Record<string, string>;
  headers?: Record<string, string>;
  /** 单条流的 Range 分片线程数（硬上限 3） */
  threads?: number;
  /** 小于该体积不分片 */
  minPartSize?: number;
  timeoutMs?: number;
  idleMs?: number;
  onProgress?: (bytesDone: number, bytesTotal: number, speedBps: number) => void;
  signal?: AbortSignal;
}

interface PartRange {
  index: number;
  start: number;
  end: number;
}

/** 探测体积与 Range 支持：逐个尝试主/备 URL，跳过连不上的 CDN 节点 */
async function probe(
  opts: DownloadFileOptions,
  urls: string[],
): Promise<{ total: number; supportsRange: boolean; url: string }> {
  const headers: Record<string, string> = { ...(opts.headers ?? {}) };
  if (opts.cookies && Object.keys(opts.cookies).length) {
    headers.Cookie = Object.entries(opts.cookies)
      .map(([k, v]) => `${k}=${v}`)
      .join('; ');
  }
  headers.Range = 'bytes=0-0';

  let lastErr: unknown;
  for (const url of urls) {
    try {
      const res = await httpFetch(url, { headers, redirect: 'follow' });
      const range = res.headers.get('content-range');
      const accept = res.headers.get('accept-ranges');
      const total = range ? Number(range.split('/')[1]) : Number(res.headers.get('content-length') ?? 0);
      await res.body?.cancel().catch(() => undefined);
      return { total: Number.isFinite(total) ? total : 0, supportsRange: Boolean(range) || accept === 'bytes', url };
    } catch (err) {
      lastErr = err;
      log.debug(`探测失败 ${new URL(url).host}：${(err as Error).message}`);
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error('所有候选地址均不可达');
}

function splitParts(total: number, threads: number): PartRange[] {
  const safeThreads = Math.max(1, Math.min(3, threads));
  const step = Math.ceil(total / safeThreads);
  const parts: PartRange[] = [];
  for (let i = 0; i < safeThreads; i += 1) {
    const start = i * step;
    const end = Math.min(total - 1, start + step - 1);
    if (start > end) break;
    parts.push({ index: i, start, end });
  }
  return parts;
}

/**
 * 下载单条流：Range 分片（≤3）+ 分片级断点续传 + backup_url 切换 + 空闲停滞中断
 * 过程产物：dest.part{i} 与 dest.parts.json；完成后合并为 dest
 */
export async function downloadFile(opts: DownloadFileOptions): Promise<void> {
  const dest = opts.dest;
  await mkdir(path.dirname(dest), { recursive: true });

  const urls = [opts.url, ...(opts.backupUrls ?? [])].filter(Boolean);
  const { total, supportsRange, url: primaryUrl } = await probe(opts, urls);
  // 把探测成功的地址排到最前，其余作为备份
  const orderedUrls = [primaryUrl, ...urls.filter((u) => u !== primaryUrl)];
  const minPart = opts.minPartSize ?? 8 * 1024 * 1024;
  const threads = Math.max(1, Math.min(3, opts.threads ?? 1));
  const useParts = supportsRange && total > minPart && threads > 1;
  const parts: PartRange[] = useParts
    ? splitParts(total, threads)
    : [{ index: 0, start: 0, end: Math.max(total - 1, 0) }];

  const partFile = (index: number) => `${dest}.part${index}`;
  const stateFile = `${dest}.parts.json`;
  if (useParts) {
    await writeFile(stateFile, JSON.stringify({ total, parts }), 'utf8');
  }

  let lastDone = 0;
  let lastAt = Date.now();
  const sizes = new Map<number, number>();
  const ticker = setInterval(() => {
    if (!opts.onProgress) return;
    void Promise.all(parts.map(async (p) => sizes.set(p.index, await fileSize(partFile(p.index)))))
      .then(() => {
        const done = [...sizes.values()].reduce((a, b) => a + b, 0);
        const now = Date.now();
        const speed = Math.round((done - lastDone) / Math.max((now - lastAt) / 1000, 0.001));
        lastDone = done;
        lastAt = now;
        opts.onProgress?.(done, total, Math.max(speed, 0));
      })
      .catch(() => undefined);
  }, 500);

  try {
    await Promise.all(
      parts.map(async (p) => {
        const target = partFile(p.index);
        let attempt = 0;
        for (;;) {
          if (opts.signal?.aborted) throw new Error('任务已取消');
          const existing = await fileSize(target);
          const remaining = p.end - p.start + 1 - existing;
          if (remaining <= 0) return;
          if (existing > 0) log.info(`续传 ${path.basename(target)}：已有 ${existing} 字节，继续下载剩余 ${remaining} 字节`);
          const url = orderedUrls[Math.min(attempt, orderedUrls.length - 1)];
          try {
            await downloadRange({
              url,
              cookies: opts.cookies,
              headers: opts.headers,
              file: target,
              append: existing > 0,
              rangeStart: p.start + existing,
              rangeEnd: p.end,
              timeoutMs: opts.timeoutMs ?? 30_000,
              idleMs: opts.idleMs ?? 20_000,
            });
            return;
          } catch (err) {
            attempt += 1;
            if (attempt >= orderedUrls.length * 2) throw err;
            log.debug(`分片 ${p.index} 重试（${(err as Error).message}）`);
            await new Promise((r) => setTimeout(r, 800 * attempt));
          }
        }
      }),
    );
  } finally {
    clearInterval(ticker);
  }

  if (parts.length > 1) {
    await concatParts(
      parts.map((p) => partFile(p.index)),
      dest,
    );
    await rm(stateFile, { force: true }).catch(() => undefined);
  } else {
    const size = await fileSize(partFile(0));
    if (total && size < total) throw new Error(`下载不完整：${size}/${total} 字节`);
    await rename(partFile(0), dest);
  }

  const finalSize = (await stat(dest)).size;
  if (total && finalSize !== total) {
    log.warn(`文件大小与预期不一致：${finalSize}/${total}（可能在代理后，交由封装阶段校验）`);
  }
  log.debug(`下载完成 ${path.basename(dest)}：${finalSize} 字节`);
}
