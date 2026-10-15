import { existsSync, statSync } from 'node:fs';
import { loadConfig } from '../../config.js';
import { log } from '../../utils/logger.js';
import { TaskStore } from '../../core/taskStore.js';
import { DownloadQueue } from '../../core/queue.js';
import { destPath } from '../../core/pipeline.js';
import { formatBytes } from '../../utils/fsx.js';

export interface ReconcileOptions {
  dryRun?: boolean;
}

/**
 * 任务库对账：成品文件已在盘上、但任务还停在 queued/downloading/muxing 的，
 * 补记为 done 并移出队列（常见于状态被重规划冲掉或异常退出后）。
 */
export async function reconcileCommand(options: ReconcileOptions = {}): Promise<void> {
  const config = await loadConfig();
  const root = config.output.root;

  const taskStore = await TaskStore.load(root, config.queue.flushIntervalMs);
  taskStore.startAutoFlush();
  const queue = await DownloadQueue.load(root, taskStore);

  let fixed = 0;
  let bytes = 0;
  for (const task of taskStore.all()) {
    if (!['queued', 'downloading', 'muxing', 'planning', 'finalizing'].includes(task.stage)) continue;
    const dest = destPath(task, root);
    if (!existsSync(dest)) continue;
    const size = statSync(dest).size;
    if (!size) continue;
    fixed += 1;
    bytes += size;
    if (options.dryRun) {
      log.print(`[DRY] ${task.stage} → done：${task.baseName}.${task.container}`);
      continue;
    }
    task.stage = 'done';
    task.progress = { ...task.progress, bytesDone: size, bytesTotal: size };
    task.updatedAt = Date.now();
    taskStore.upsert(task);
    queue.cancel(task.id);
  }

  await queue.flush(true);
  await taskStore.flush(true);
  taskStore.stop();
  queue.stop();

  log.print(
    options.dryRun
      ? `对账预览：${fixed} 个任务可以补记为已完成（${formatBytes(bytes)}）`
      : `对账完成：${fixed} 个任务补记为已完成（${formatBytes(bytes)}），已移出队列`,
  );
}
