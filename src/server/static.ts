import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import path from 'node:path';
import type { IncomingMessage, ServerResponse } from 'node:http';

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.mp4': 'video/mp4',
  '.mov': 'video/quicktime',
  '.m4s': 'video/mp4',
  '.webm': 'video/webm',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ass': 'text/plain; charset=utf-8',
  '.srt': 'application/x-subrip; charset=utf-8',
  '.vtt': 'text/vtt; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
};

function mimeOf(file: string): string {
  return MIME[path.extname(file).toLowerCase()] ?? 'application/octet-stream';
}

/** 安全拼接：不允许跳出 root */
export function safeJoin(root: string, relPath: string): string | null {
  const target = path.resolve(root, relPath.replace(/^\/+/, ''));
  const base = path.resolve(root);
  if (target !== base && !target.startsWith(base + path.sep)) return null;
  return target;
}

/** 带 Range 支持的静态文件响应（视频拖动进度条依赖它） */
export async function sendFile(req: IncomingMessage, res: ServerResponse, file: string): Promise<boolean> {
  let info;
  try {
    info = await stat(file);
  } catch {
    return false;
  }
  if (info.isDirectory()) return false;

  const type = mimeOf(file);
  const size = info.size;
  const rangeHeader = req.headers.range;
  const match = rangeHeader ? /bytes=(\d*)-(\d*)/.exec(rangeHeader) : null;

  if (match) {
    const start = match[1] ? Number(match[1]) : 0;
    const end = match[2] ? Math.min(Number(match[2]), size - 1) : size - 1;
    if (!Number.isFinite(start) || start > end || start >= size) {
      res.writeHead(416, { 'Content-Range': `bytes */${size}` });
      res.end();
      return true;
    }
    res.writeHead(206, {
      'Content-Type': type,
      'Content-Length': end - start + 1,
      'Content-Range': `bytes ${start}-${end}/${size}`,
      'Accept-Ranges': 'bytes',
    });
    createReadStream(file, { start, end }).pipe(res);
    return true;
  }

  res.writeHead(200, { 'Content-Type': type, 'Content-Length': size, 'Accept-Ranges': 'bytes' });
  createReadStream(file).pipe(res);
  return true;
}
