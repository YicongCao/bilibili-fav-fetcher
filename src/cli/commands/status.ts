import { loadConfig } from '../../config.js';
import { TaskStore } from '../../core/taskStore.js';
import { DownloadQueue } from '../../core/queue.js';
import { log } from '../../utils/logger.js';
import { formatBytes } from '../../utils/fsx.js';

export async function statusCommand(): Promise<void> {
  const config = await loadConfig();
  const store = await TaskStore.load(config.output.root, config.queue.flushIntervalMs);
  const queue = await DownloadQueue.load(config.output.root, store);
  const snapshot = queue.snapshot();
  const all = store.all();

  const count = (stage: string) => all.filter((t) => t.stage === stage).length;
  log.print('任务状态');
  log.print('--------');
  log.print(`队列状态：${snapshot.status}    队列长度：${snapshot.order.length}    剩余：${queue.remaining()}`);
  log.print(`在途：${snapshot.inflight.length}    延迟中：${snapshot.delayed.length}`);
  log.print(
    `done ${count('done')} | failed ${count('failed')} | skipped ${count('skipped')} | queued ${count('queued')} | paused ${count('paused')}`,
  );
  log.print(`累计下载：${formatBytes(snapshot.stats.bytesDone)}    最近心跳：${new Date(snapshot.heartbeat).toLocaleString('zh-CN')}`);
  log.print('--------');

  const running = all.filter((t) => t.stage === 'downloading' || t.stage === 'muxing');
  for (const t of running.slice(0, 10)) {
    const pct = t.progress.bytesTotal ? Math.round((t.progress.bytesDone / t.progress.bytesTotal) * 100) : 0;
    log.print(`  ${t.stage} ${pct}% ${t.baseName}（${t.engine}）`);
  }
  const failed = all.filter((t) => t.stage === 'failed');
  for (const t of failed.slice(0, 10)) log.print(`  failed ${t.baseName}：${t.error?.message ?? ''}`);

  queue.stop();
}
