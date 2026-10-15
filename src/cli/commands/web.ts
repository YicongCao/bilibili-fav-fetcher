import { execFile } from 'node:child_process';
import { DEFAULT_COOKIE_FILE, loadCookieFile } from '../../auth/cookie.js';
import { loadConfig } from '../../config.js';
import { readJson } from '../../utils/fsx.js';
import { log } from '../../utils/logger.js';
import { buildTasks } from '../../core/planner.js';
import { TaskStore } from '../../core/taskStore.js';
import { DownloadQueue } from '../../core/queue.js';
import { runQueue } from '../../core/pipeline.js';
import { startServer } from '../../server/http.js';
import { bus, toSummary } from '../../server/events.js';
import { checkEngines } from '../../core/engines/index.js';
import { buildLibrary } from '../../library/scanLibrary.js';
import type { IndexFile, TaskRecord } from '../../types/index.js';

export interface WebOptions {
  port?: number;
  host?: string;
  noOpen?: boolean;
  limit?: number;
  noDownload?: boolean;
  cookieFile?: string;
}

export async function webCommand(options: WebOptions = {}): Promise<void> {
  const config = await loadConfig();
  if (options.port) config.control.port = options.port;
  if (options.host) config.control.host = options.host;

  const cookieFile = options.cookieFile ?? DEFAULT_COOKIE_FILE;
  const store = await loadCookieFile(cookieFile);
  if (!store?.cookies) {
    log.error(`未找到登录态（${cookieFile}）`);
    process.exitCode = 1;
    return;
  }

  const taskStore = await TaskStore.load(config.output.root, config.queue.flushIntervalMs);
  taskStore.startAutoFlush();
  taskStore.recover();
  const queue = await DownloadQueue.load(config.output.root, taskStore);
  queue.resume();

  if (!options.noDownload) {
    const index = await readJson<IndexFile>(`${config.output.root}/index.json`);
    if (index) {
      const tasks = await buildTasks(store.cookies, index.videos, { source: 'favorite', limit: options.limit });
      for (const t of tasks) taskStore.upsert(t);
      queue.enqueue(tasks);
    }
    await checkEngines(store.cookies);
  }

  const { url, close } = await startServer({
    store: taskStore,
    queue,
    root: config.output.root,
    cookies: store.cookies,
    cookieExpiresAt: store.expiresAt ?? null,
  });

  if (config.control.openBrowser && !options.noOpen) {
    execFile('open', [url], () => undefined);
  }

  const statsTimer = setInterval(() => {
    const s = queue.snapshot();
    bus.emit({
      t: 'queue.stats',
      stats: {
        status: s.status,
        order: s.order.length,
        remaining: queue.remaining(),
        inflight: s.inflight.length,
        delayed: s.delayed.length,
        ...s.stats,
      },
    });
  }, 1000);

  let stopping = false;
  const onSignal = () => {
    if (stopping) process.exit(1);
    stopping = true;
    queue.pause();
    log.print('\n正在停止控制端…');
    setTimeout(() => {
      clearInterval(statsTimer);
      queue.stop();
      taskStore.stop();
      close();
      process.exit(0);
    }, config.queue.shutdownGraceMs);
  };
  process.on('SIGINT', onSignal);
  process.on('SIGTERM', onSignal);

  // 媒体库：启动时后台重建一次，之后任务每完成一个防抖重建（几秒内完成，纯 stat 扫描）
  let libTimer: ReturnType<typeof setTimeout> | null = null;
  const scheduleLibraryRebuild = (delayMs = 5000) => {
    if (libTimer) clearTimeout(libTimer);
    libTimer = setTimeout(() => {
      libTimer = null;
      buildLibrary(config.output.root).catch((err) => log.warn(`媒体库重建失败：${(err as Error).message}`));
    }, delayMs);
  };
  scheduleLibraryRebuild(1500);

  const onTaskUpdate = (task: TaskRecord) => {
    bus.emit({ t: 'task.update', task: toSummary(task) });
    if (task.stage === 'done') scheduleLibraryRebuild();
  };

  if (!options.noDownload) {
    log.print(`outputs 目录：${config.output.root}`);
    // 管理端随时可能新增任务（收藏夹 / UP 主），所以取空后再轮询，而不是直接结束
    for (;;) {
      await runQueue({ cookies: store.cookies, store: taskStore, queue }, {
        onTaskUpdate,
        onOverLimit: (usage) => bus.emit({ t: 'disk.warn', freeGB: usage.freeBytes / 1024 ** 3 }),
      });
      if (stopping) break;
      await new Promise((r) => setTimeout(r, 3000));
      if (stopping) break;
    }
  }
}
