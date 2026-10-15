import { DEFAULT_COOKIE_FILE, loadCookieFile } from '../../auth/cookie.js';
import { loadConfig } from '../../config.js';
import { readJson } from '../../utils/fsx.js';
import { log } from '../../utils/logger.js';
import { buildTasks } from '../../core/planner.js';
import { TaskStore } from '../../core/taskStore.js';
import { DownloadQueue } from '../../core/queue.js';
import { destPath, runQueue } from '../../core/pipeline.js';
import { checkEngines } from '../../core/engines/index.js';
import type { IndexFile } from '../../types/index.js';

export interface DownloadOptions {
  limit?: number;
  folder?: string;
  order?: 'favTime' | 'pubDate';
  pages?: 'all' | 'collected' | 'first';
  force?: boolean;
  dryRun?: boolean;
  cookieFile?: string;
}

export async function downloadCommand(options: DownloadOptions): Promise<void> {
  const config = await loadConfig();
  if (options.force) config.download.skipExisting = false;

  const cookieFile = options.cookieFile ?? DEFAULT_COOKIE_FILE;
  const store = await loadCookieFile(cookieFile);
  if (!store?.cookies) {
    log.error(`未找到登录态（${cookieFile}），请先执行：npm run bili -- login --qr`);
    process.exitCode = 1;
    return;
  }

  const index = await readJson<IndexFile>(`${config.output.root}/index.json`);
  if (!index) {
    log.error(`未找到 ${config.output.root}/index.json，请先执行：npm run bili -- scan --out "${config.output.root}"`);
    process.exitCode = 1;
    return;
  }

  let videos = index.videos;
  if (options.folder) {
    videos = videos.filter(
      (v) => v.primaryFolder?.title === options.folder || v.folders.some((f) => f.title === options.folder),
    );
  }

  const tasks = await buildTasks(store.cookies, videos, {
    source: 'favorite',
    limit: options.limit,
    orderBy: options.order,
    pages: options.pages,
  });

  if (options.dryRun) {
    for (const t of tasks.slice(0, 20)) {
      log.print(`[DRY] ${destPath(t, config.output.root)}  ← ${t.title} P${t.page}`);
    }
    log.print(`共 ${tasks.length} 个任务（dry-run）`);
    return;
  }

  const taskStore = await TaskStore.load(config.output.root, config.queue.flushIntervalMs);
  taskStore.startAutoFlush();
  const recovered = taskStore.recover();
  if (recovered.resumed) log.info(`恢复 ${recovered.resumed} 个未完成任务`);

  const queue = await DownloadQueue.load(config.output.root, taskStore);
  queue.resume();
  for (const t of tasks) taskStore.upsert(t);
  queue.enqueue(tasks);

  const engines = await checkEngines(store.cookies);
  log.print(`引擎：主 native ✓，副 yt-dlp ${engines.ytdlp ? '✓' : '✗（自动切换已关闭）'}`);

  // 优雅中断：暂停队列并强制落盘
  let stopping = false;
  const onSignal = () => {
    if (stopping) process.exit(1);
    stopping = true;
    queue.pause();
    log.print('\n正在中断（停止取新任务，等待在途任务落盘）…');
    setTimeout(() => {
      void queue.flush(true).then(() => taskStore.flush(true)).finally(() => process.exit(0));
    }, config.queue.shutdownGraceMs);
  };
  process.on('SIGINT', onSignal);
  process.on('SIGTERM', onSignal);

  const started = Date.now();
  const result = await runQueue({ cookies: store.cookies, store: taskStore, queue });

  queue.stop();
  taskStore.stop();

  log.print('');
  log.print(
    `完成 ${result.done} 个，失败 ${result.failed} 个，跳过 ${result.skipped} 个，用时 ${((Date.now() - started) / 1000).toFixed(1)}s`,
  );
  const failed = taskStore.all().filter((t) => t.stage === 'failed');
  for (const t of failed.slice(0, 20)) log.print(`  ✖ ${t.baseName}：${t.error?.message ?? ''}`);
}
