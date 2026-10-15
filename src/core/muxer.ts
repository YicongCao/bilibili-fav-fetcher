import path from 'node:path';
import { mkdir, rename, rm, stat } from 'node:fs/promises';
import { runFfmpeg } from '../utils/ffmpeg.js';
import { log } from '../utils/logger.js';

export interface MuxMeta {
  title: string;
  artist: string;
  date?: string;
  comment?: string;
  description?: string;
  genre?: string;
}

export interface MuxInput {
  videoFile: string;
  audioFile?: string;
  dest: string;
  meta: MuxMeta;
  hdr?: boolean;
  faststart?: boolean;
  onProgress?: (sec: number) => void;
  idleMs?: number;
}

function formatOf(dest: string): string {
  const ext = path.extname(dest).toLowerCase();
  if (ext === '.mov') return 'mov';
  if (ext === '.mkv') return 'matroska';
  return 'mp4';
}

function metadataArgs(meta: MuxMeta): string[] {
  const args: string[] = [];
  const push = (key: string, value?: string) => {
    if (value) args.push('-metadata', `${key}=${value.replace(/\n/g, ' ').slice(0, 500)}`);
  };
  push('title', meta.title);
  push('artist', meta.artist);
  push('date', meta.date);
  push('comment', meta.comment);
  push('description', meta.description);
  push('genre', meta.genre);
  return args;
}

/**
 * 封装为单文件容器（默认 mp4，-c copy 不重编码）
 * 中间产物 dest.muxing，完成后原子 rename
 */
export async function muxToContainer(input: MuxInput): Promise<string> {
  const dest = input.dest;
  const tmp = `${dest}.muxing`;
  await mkdir(path.dirname(dest), { recursive: true });

  const args: string[] = ['-y'];
  args.push('-i', input.videoFile);
  if (input.audioFile) args.push('-i', input.audioFile);
  args.push('-map', '0:v:0');
  if (input.audioFile) args.push('-map', '1:a:0');
  args.push('-c', 'copy');
  if (input.hdr) {
    args.push('-color_primaries', 'bt2020', '-color_trc', 'smpte2084', '-colorspace', 'bt2020nc');
  }
  if (input.faststart !== false) args.push('-movflags', '+faststart');
  args.push(...metadataArgs(input.meta));
  // 中间产物后缀是 .muxing，必须显式指定封装格式
  args.push('-f', formatOf(dest));
  args.push(tmp);

  try {
    await runFfmpeg(args, {
      onProgress: (sec) => input.onProgress?.(sec),
      idleMs: input.idleMs,
    });
  } catch (err) {
    await rm(tmp, { force: true }).catch(() => undefined);
    throw err;
  }

  await rename(tmp, dest);
  const size = (await stat(dest)).size;
  log.debug(`封装完成 ${path.basename(dest)}：${size} 字节`);
  return dest;
}

/** 多段同编码文件：字节级拼接 → 失败降级为 concat demuxer */
export async function joinSegments(
  files: string[],
  dest: string,
  meta: MuxMeta,
  opts: { onProgress?: (sec: number) => void; idleMs?: number } = {},
): Promise<string> {
  await mkdir(path.dirname(dest), { recursive: true });
  const tmp = `${dest}.muxing`;
  const listFile = `${dest}.concat.txt`;
  const { writeFile } = await import('node:fs/promises');

  await writeFile(
    listFile,
    files.map((f) => `file '${f.replace(/'/g, "'\\''")}'`).join('\n'),
    'utf8',
  );

  try {
    await runFfmpeg(
      ['-y', '-f', 'concat', '-safe', '0', '-i', listFile, '-c', 'copy', ...metadataArgs(meta), '-movflags', '+faststart', tmp],
      { onProgress: (sec) => opts.onProgress?.(sec), idleMs: opts.idleMs },
    );
    await rename(tmp, dest);
  } catch (err) {
    log.warn(`concat demuxer 失败，降级为 remux：${(err as Error).message}`);
    await runFfmpeg(
      ['-y', '-f', 'concat', '-safe', '0', '-i', listFile, '-c:v', 'libx264', '-crf', '20', '-c:a', 'aac', ...metadataArgs(meta), '-movflags', '+faststart', tmp],
      { onProgress: (sec) => opts.onProgress?.(sec), idleMs: opts.idleMs },
    );
    await rename(tmp, dest);
  } finally {
    await rm(listFile, { force: true }).catch(() => undefined);
  }
  return dest;
}
