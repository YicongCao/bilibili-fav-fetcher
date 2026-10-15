import { spawn } from 'node:child_process';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

let cachedPath: string | null = null;

/** 探测系统 ffmpeg（后续可回退 ffmpeg-static 自动下载） */
export async function detectFfmpeg(): Promise<string> {
  if (cachedPath) return cachedPath;
  try {
    const { stdout } = await execFileAsync('ffmpeg', ['-version'], { encoding: 'utf8' });
    cachedPath = 'ffmpeg';
    void stdout;
    return cachedPath;
  } catch {
    throw new Error('未找到 ffmpeg，请先安装：brew install ffmpeg');
  }
}

export interface FfmpegRunOptions {
  onProgress?: (outTimeSec: number, speed: number) => void;
  /** 无进度输出的超时（用于识别转码停滞） */
  idleMs?: number;
  timeoutMs?: number;
}

/** 执行 ffmpeg，解析 -progress 输出；返回 stdout/stderr 尾部用于报错 */
export async function runFfmpeg(args: string[], opts: FfmpegRunOptions = {}): Promise<string> {
  const bin = await detectFfmpeg();
  const fullArgs = ['-hide_banner', '-nostdin', '-progress', 'pipe:1', '-loglevel', 'error', ...args];

  return new Promise<string>((resolve, reject) => {
    const child = spawn(bin, fullArgs, { stdio: ['ignore', 'pipe', 'pipe'] });
    let progressBuf = '';
    let errBuf = '';
    let lastProgressAt = Date.now();
    const idleMs = opts.idleMs ?? 300_000;

    const idleTimer = setInterval(() => {
      if (Date.now() - lastProgressAt > idleMs) {
        child.kill('SIGKILL');
        reject(new Error(`ffmpeg 停滞超过 ${Math.round(idleMs / 1000)}s`));
      }
    }, 2000);

    child.stdout.on('data', (chunk: Buffer) => {
      progressBuf += chunk.toString();
      lastProgressAt = Date.now();
      const lines = progressBuf.split('\n');
      progressBuf = lines.pop() ?? '';
      let outTime: number | null = null;
      let speed = 0;
      for (const line of lines) {
        if (line.startsWith('out_time_us=')) {
          const v = Number(line.split('=')[1]);
          if (Number.isFinite(v)) outTime = v / 1_000_000;
        }
        if (line.startsWith('speed=')) {
          const s = line.split('=')[1]?.replace('x', '');
          speed = Number(s) || 0;
        }
      }
      if (outTime !== null) opts.onProgress?.(outTime, speed);
    });

    child.stderr.on('data', (chunk: Buffer) => {
      errBuf += chunk.toString();
      if (errBuf.length > 4000) errBuf = errBuf.slice(-4000);
    });

    child.on('error', (err) => {
      clearInterval(idleTimer);
      reject(err);
    });
    child.on('close', (code) => {
      clearInterval(idleTimer);
      if (code === 0) resolve(errBuf);
      else reject(new Error(`ffmpeg 退出码 ${code}：${errBuf.slice(-600)}`));
    });
  });
}

export interface ProbeResult {
  duration: number;
  hasVideo: boolean;
  hasAudio: boolean;
  width: number;
  height: number;
}

/** ffprobe 校验产物 */
export async function probeFile(file: string): Promise<ProbeResult> {
  try {
    const { stdout } = await execFileAsync(
      'ffprobe',
      ['-v', 'error', '-show_entries', 'format=duration', '-show_entries', 'stream=codec_type,width,height', '-of', 'json', file],
      { encoding: 'utf8' },
    );
    const parsed = JSON.parse(stdout) as {
      format?: { duration?: string };
      streams?: Array<{ codec_type?: string; width?: number; height?: number }>;
    };
    const streams = parsed.streams ?? [];
    const video = streams.find((s) => s.codec_type === 'video');
    return {
      duration: Number(parsed.format?.duration ?? 0),
      hasVideo: Boolean(video),
      hasAudio: streams.some((s) => s.codec_type === 'audio'),
      width: video?.width ?? 0,
      height: video?.height ?? 0,
    };
  } catch (err) {
    throw new Error(`ffprobe 校验失败：${(err as Error).message}`);
  }
}
