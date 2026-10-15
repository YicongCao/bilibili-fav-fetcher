import { appendFile } from 'node:fs/promises';
import path from 'node:path';
import { ensureDir, resolvePath } from './fsx.js';

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const LEVEL_WEIGHT: Record<LogLevel, number> = { debug: 10, info: 20, warn: 30, error: 40 };

const SENSITIVE_KEYS = ['SESSDATA', 'bili_jct', 'DedeUserID', 'sid', 'refresh_token', 'refresh_csrf'];

/** 日志/输出脱敏：绝不明文打印凭据 */
export function redact(text: string): string {
  let out = text;
  for (const key of SENSITIVE_KEYS) {
    out = out.replace(new RegExp(`${key}=[^;\\s"',}]+`, 'gi'), `${key}=***`);
  }
  return out;
}

class Logger {
  level: LogLevel = (process.env.BILI_LOG_LEVEL as LogLevel) || 'info';

  private logFile: string | null = null;

  setLogDir(dir: string): void {
    const day = new Date().toISOString().slice(0, 10);
    this.logFile = resolvePath(path.join(dir, `${day}.log`));
  }

  private write(level: LogLevel, msg: string): void {
    if (LEVEL_WEIGHT[level] < LEVEL_WEIGHT[this.level]) return;
    const line = `${new Date().toISOString()} [${level.toUpperCase()}] ${redact(msg)}`;
    const stream = level === 'error' ? process.stderr : process.stdout;
    stream.write(`${line}\n`);
    if (this.logFile) {
      void ensureDir(path.dirname(this.logFile))
        .then(() => appendFile(this.logFile!, `${line}\n`, 'utf8'))
        .catch(() => undefined);
    }
  }

  debug(msg: string): void {
    this.write('debug', msg);
  }

  info(msg: string): void {
    this.write('info', msg);
  }

  warn(msg: string): void {
    this.write('warn', msg);
  }

  error(msg: string): void {
    this.write('error', msg);
  }

  /** 用户可见的普通输出（不进日志文件） */
  print(msg = ''): void {
    process.stdout.write(`${redact(msg)}\n`);
  }
}

export const log = new Logger();
log.setLogDir('outputs/.state/logs');
