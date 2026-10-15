import { DEFAULT_COOKIE_FILE, loadCookieFile } from '../../auth/cookie.js';
import { loadConfig } from '../../config.js';
import { log } from '../../utils/logger.js';
import { buildUpTasks } from '../../core/upPlan.js';
import { TaskStore } from '../../core/taskStore.js';
import { DownloadQueue } from '../../core/queue.js';
import { runQueue } from '../../core/pipeline.js';
import { checkEngines } from '../../core/engines/index.js';

export interface UpOptions {
  since?: string;
  keyword?: string;
  limit?: number;
  dryRun?: boolean;
  cookieFile?: string;
}

export async function upCommand(target: string, options: UpOptions): Promise<void> {
  const config = await loadConfig();
  const cookieFile = options.cookieFile ?? DEFAULT_COOKIE_FILE;
  const store = await loadCookieFile(cookieFile);
  if (!store?.cookies) {
    log.error(`未找到登录态（${cookieFile}）`);
    process.exitCode = 1;
    return;
  }

  let plan;
  try {
    plan = await buildUpTasks(store.cookies, target, {
      limit: options.limit,
      keyword: options.keyword,
      since: options.since,
    });
  } catch (err) {
    log.error((err as Error).message);
    process.exitCode = 1;
    return;
  }
  const tasks = plan.tasks;

  if (options.dryRun) {
    for (const t of tasks.slice(0, 20)) log.print(`[DRY] ${t.outDir}/${t.baseName}.${t.container}`);
    log.print(`共 ${tasks.length} 个任务（dry-run）`);
    return;
  }

  const taskStore = await TaskStore.load(config.output.root, config.queue.flushIntervalMs);
  taskStore.startAutoFlush();
  taskStore.recover();
  const queue = await DownloadQueue.load(config.output.root, taskStore);
  queue.resume();
  for (const t of tasks) taskStore.upsert(t);
  queue.enqueue(tasks);
  await checkEngines(store.cookies);

  const result = await runQueue({ cookies: store.cookies, store: taskStore, queue });
  queue.stop();
  taskStore.stop();
  log.print(`完成 ${result.done}，失败 ${result.failed}，跳过 ${result.skipped}`);
}
