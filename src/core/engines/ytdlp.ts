import { spawn } from 'node:child_process';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { chmod, mkdir, readdir, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { existsSync } from 'node:fs';
import { getConfig } from '../../config.js';
import { httpFetch } from '../../utils/net.js';
import { log } from '../../utils/logger.js';
import type { DownloadEngine, MediaPlanResult, RunHooks } from './types.js';
import type { TaskRecord } from '../../types/index.js';

const execFileAsync = promisify(execFile);
const RELEASE_URL = 'https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp_macos';

/** 定位 yt-dlp：配置路径 → PATH → bin/ → 自动下载 */
export async function resolveYtdlp(): Promise<string> {
  const cfg = getConfig();
  if (cfg.engines.ytdlp.path && existsSync(cfg.engines.ytdlp.path)) return cfg.engines.ytdlp.path;

  try {
    const { stdout } = await execFileAsync('which', ['yt-dlp'], { encoding: 'utf8' });
    const found = stdout.trim();
    if (found) return found;
  } catch {
    /* 不在 PATH */
  }

  const local = path.resolve('bin', 'yt-dlp');
  if (existsSync(local)) return local;

  if (!cfg.engines.ytdlp.autoDownload) throw new Error('未找到 yt-dlp 且未开启自动下载');
  log.info('正在下载 yt-dlp 到 bin/ ...');
  await mkdir('bin', { recursive: true });
  const res = await httpFetch(RELEASE_URL, { redirect: 'follow' });
  if (!res.ok) throw new Error(`下载 yt-dlp 失败：HTTP ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  await writeFile(local, buf, { mode: 0o755 });
  await chmod(local, 0o755);
  return local;
}

async function writeCookieFile(cookies: Record<string, string>): Promise<string> {
  const file = path.resolve('state', 'yt-dlp-cookies.txt');
  await mkdir('state', { recursive: true });
  const lines = ['# Netscape HTTP Cookie File'];
  for (const [name, value] of Object.entries(cookies)) {
    lines.push(`.bilibili.com\tTRUE\t/\tFALSE\t0\t${name}\t${value}`);
  }
  await writeFile(file, `${lines.join('\n')}\n`, 'utf8');
  return file;
}

export class YtDlpEngine implements DownloadEngine {
  readonly name = 'ytdlp' as const;

  constructor(private readonly cookies: Record<string, string> = {}) {}

  async healthcheck(): Promise<{ ok: boolean; version?: string; reason?: string }> {
    try {
      const bin = await resolveYtdlp();
      const { stdout } = await execFileAsync(bin, ['--version'], { encoding: 'utf8' });
      return { ok: true, version: stdout.trim() };
    } catch (err) {
      return { ok: false, reason: (err as Error).message };
    }
  }

  /** yt-dlp 内部自选流，这里只给出输出路径 */
  async plan(task: TaskRecord): Promise<MediaPlanResult & { raw?: unknown }> {
    const cfg = getConfig();
    const cacheDir = path.join(cfg.output.root, '.cache', 'media', `${task.id}-ytdlp`);
    await mkdir(cacheDir, { recursive: true });
    return {
      kind: 'segments',
      videoFile: path.join(cacheDir, 'out.mp4'),
      qualityLabel: 'yt-dlp',
      hdr: false,
      fps: 0,
      codec: '',
      width: 0,
      height: 0,
      degraded: false,
    };
  }

  async run(
    task: TaskRecord,
    plan: MediaPlanResult & { raw?: unknown },
    hooks: RunHooks,
  ): Promise<{ videoFile: string; audioFile?: string }> {
    const cfg = getConfig();
    const bin = await resolveYtdlp();
    const cookieFile = await writeCookieFile(this.cookies);
    const url = `https://www.bilibili.com/video/${task.bvid}${task.totalPages > 1 ? `/?p=${task.page}` : ''}`;
    const outTemplate = path.join(path.dirname(plan.videoFile), 'out.%(ext)s');

    const args = [
      url,
      '-f',
      'bv*[height<=2160]+ba/bv*+ba/b',
      '--merge-output-format',
      'mp4',
      '-o',
      outTemplate,
      '--no-playlist',
      '--no-write-thumbnail',
      '--no-write-subs',
      '--no-write-auto-subs',
      '--concurrent-fragments',
      String(cfg.engines.ytdlp.concurrentFragments),
      '--cookies',
      cookieFile,
      '--newline',
    ];
    if (cfg.download.maxSpeed) args.push('--limit-rate', cfg.download.maxSpeed);

    await new Promise<void>((resolve, reject) => {
      const child = spawn(bin, args, { stdio: ['ignore', 'pipe', 'pipe'] });
      let err = '';
      child.stdout.on('data', (chunk: Buffer) => {
        const text = chunk.toString();
        const match = text.match(/(\d+(?:\.\d+)?)% of\s+~?([\d.]+\w+)/);
        if (match) {
          const pct = Number(match[1]) / 100;
          hooks.onProgress?.(Math.round(pct * 1_000_000), 1_000_000, 0);
        }
      });
      child.stderr.on('data', (chunk: Buffer) => {
        err += chunk.toString();
        if (err.length > 4000) err = err.slice(-4000);
      });
      hooks.signal?.addEventListener('abort', () => child.kill('SIGTERM'));
      child.on('error', reject);
      child.on('close', (code) => {
        if (code === 0) resolve();
        else reject(new Error(`yt-dlp 退出码 ${code}：${err.slice(-400)}`));
      });
    });

    const dir = path.dirname(plan.videoFile);
    const files = await readdir(dir);
    const produced = files.find((f) => f.startsWith('out.') && !f.endsWith('.part'));
    if (!produced) throw new Error('yt-dlp 未产出文件');
    const producedPath = path.join(dir, produced);
    const finalPath = plan.videoFile;
    const { rename } = await import('node:fs/promises');
    await rename(producedPath, finalPath);
    log.info(`yt-dlp 产出 ${path.basename(finalPath)}：${(await stat(finalPath)).size} 字节`);
    return { videoFile: finalPath };
  }
}
