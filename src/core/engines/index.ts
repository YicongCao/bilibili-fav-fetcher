import { getConfig } from '../../config.js';
import { log } from '../../utils/logger.js';
import { NativeEngine } from './native.js';
import { YtDlpEngine } from './ytdlp.js';
import type { DownloadEngine } from './types.js';
import type { TaskRecord } from '../../types/index.js';

export type EngineName = 'native' | 'ytdlp';

export function createEngine(name: EngineName, cookies: Record<string, string>): DownloadEngine {
  return name === 'ytdlp' ? new YtDlpEngine(cookies) : new NativeEngine(cookies);
}

export function isFailoverCode(code: string | undefined): boolean {
  if (!code) return false;
  return getConfig().engines.failover.errorCodes.includes(code);
}

/**
 * 引擎决策：
 * - 非 auto 模式固定引擎
 * - 命中故障码 / 失败次数达标 / 停滞 3 次 → 切到副引擎
 * - 副引擎连续成功后回主引擎由调用方统计决定
 */
export function decideEngine(
  task: TaskRecord,
  opts: { errorCode?: string; stallCount?: number } = {},
): EngineName {
  const cfg = getConfig();
  if (cfg.engines.mode !== 'auto') return cfg.engines.mode;
  if (!cfg.engines.ytdlp.enabled) return 'native';

  const current: EngineName = task.engine ?? 'native';
  const other: EngineName = current === 'native' ? 'ytdlp' : 'native';
  // 主引擎优先：只有当前是主引擎且满足切换条件时才切到副引擎
  if (current === 'ytdlp' && other === 'native') return 'ytdlp';

  const byCode = isFailoverCode(opts.errorCode);
  const byRetry = task.retryCount >= cfg.engines.failover.afterFailures;
  const byStall = (opts.stallCount ?? 0) >= 3;
  if (byCode || byRetry || byStall) return 'ytdlp';
  return 'native';
}

/** 引擎健康自检，副引擎不可用时降级 */
export async function checkEngines(cookies: Record<string, string>): Promise<Record<EngineName, boolean>> {
  const result: Record<EngineName, boolean> = { native: true, ytdlp: false };
  const ytdlp = createEngine('ytdlp', cookies);
  const health = await ytdlp.healthcheck();
  result.ytdlp = health.ok;
  if (!health.ok) log.warn(`副引擎 yt-dlp 不可用（${health.reason}），已关闭自动切换`);
  return result;
}

export { NativeEngine, YtDlpEngine };
