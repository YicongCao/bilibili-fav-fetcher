import { DEFAULT_COOKIE_FILE, loadCookieFile } from '../../auth/cookie.js';
import { loadConfig } from '../../config.js';
import { log } from '../../utils/logger.js';
import { TaskStore } from '../../core/taskStore.js';
import { DownloadQueue } from '../../core/queue.js';
import { runQueue } from '../../core/pipeline.js';

export async function repairCommand(options: { failed?: boolean; needMux?: boolean; engine?: string; cookieFile?: string }): Promise<void> {
  const config = await loadConfig();
  if (options.engine === 'native' || options.engine === 'ytdlp') config.engines.mode = options.engine;

  const cookieFile = options.cookieFile ?? DEFAULT_COOKIE_FILE;
  const store = await loadCookieFile(cookieFile);
  if (!store?.cookies) {
    log.error(`未找到登录态（${cookieFile}）`);
    process.exitCode = 1;
    return;
  }

  const taskStore = await TaskStore.load(config.output.root, config.queue.flushIntervalMs);
  taskStore.startAutoFlush();
  const queue = await DownloadQueue.load(config.output.root, taskStore);
  queue.resume();

  const targets = taskStore.all().filter((t) => {
    if (t.stage === 'done' || t.stage === 'skipped') return false;
    if (options.failed) return t.stage === 'failed';
    if (options.needMux) return t.stage === 'muxing' || t.error?.code === 'MUX_FAIL';
    return true;
  });

  for (const t of targets) {
    t.retryCount = 0;
    t.error = undefined;
    t.stage = 'queued';
    taskStore.upsert(t);
    queue.prioritize(t.id);
  }
  log.info(`补偿 ${targets.length} 个任务`);

  const result = await runQueue({ cookies: store.cookies, store: taskStore, queue });
  queue.stop();
  taskStore.stop();
  log.print(`完成 ${result.done}，失败 ${result.failed}，跳过 ${result.skipped}`);
}
