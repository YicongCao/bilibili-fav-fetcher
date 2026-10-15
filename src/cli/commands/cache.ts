import { loadConfig } from '../../config.js';
import { TaskStore } from '../../core/taskStore.js';
import { cleanAllCache, cleanDoneCache } from '../../core/cache.js';
import { invalidateUsage, outputUsage } from '../../core/disk.js';
import { formatBytes } from '../../utils/fsx.js';
import { log } from '../../utils/logger.js';

export interface CacheOptions {
  done?: boolean;
  all?: boolean;
  dryRun?: boolean;
}

/** 清理中间分片缓存：默认只删已完成/已跳过任务的残留 */
export async function cacheCommand(options: CacheOptions = {}): Promise<void> {
  const config = await loadConfig();
  const root = config.output.root;

  const before = await outputUsage(root);
  log.print(`outputs：${root}`);
  log.print(`分片缓存：${formatBytes(before.cacheBytes)}    目录总占用：${formatBytes(before.usedBytes)}`);

  if (options.dryRun) {
    const store = await TaskStore.load(root, config.queue.flushIntervalMs);
    const keep = store.all().filter((t) => t.stage !== 'done' && t.stage !== 'skipped').length;
    log.print(`dry-run：将清理已完成/已跳过任务的缓存，保留 ${keep} 个未完成任务的续传分片`);
    return;
  }

  if (options.all) {
    const res = await cleanAllCache(root);
    invalidateUsage(root);
    const after = await outputUsage(root);
    log.print(`已清空全部分片缓存，释放 ${formatBytes(res.bytes)}（未完成任务将重新完整下载）`);
    log.print(`目录总占用：${formatBytes(after.usedBytes)}`);
    return;
  }

  const store = await TaskStore.load(root, config.queue.flushIntervalMs);
  const res = await cleanDoneCache(root, store);
  invalidateUsage(root);
  const after = await outputUsage(root);
  log.print(`已清理 ${res.removed} 个任务目录，释放 ${formatBytes(res.bytes)}`);
  log.print(`目录总占用：${formatBytes(after.usedBytes)}    剩余分片缓存：${formatBytes(after.cacheBytes)}`);
}
