import { DEFAULT_COOKIE_FILE, loadCookieFile } from '../../auth/cookie.js';
import { loadConfig } from '../../config.js';
import { readJson } from '../../utils/fsx.js';
import { log } from '../../utils/logger.js';
import { buildTasks } from '../../core/planner.js';
import { runPipeline, destPath } from '../../core/pipeline.js';
import { finalizeTask } from '../../core/finalize.js';
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
  if (!store) {
    log.error(`未找到登录态（${cookieFile}），请先执行：npm run bili -- login --qr`);
    process.exitCode = 1;
    return;
  }

  const index = await readJson<IndexFile>(`${config.output.root}/index.json`);
  if (!index) {
    log.error('未找到 outputs/index.json，请先执行：npm run bili -- scan');
    process.exitCode = 1;
    return;
  }

  let videos = index.videos;
  if (options.folder) {
    videos = videos.filter(
      (v) => v.primaryFolder?.title === options.folder || v.folders.some((f) => f.title === options.folder),
    );
  }

  const tasks = await buildTasks(store.cookies!, videos, {
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

  const started = Date.now();
  const result = await runPipeline(store.cookies!, tasks, {
    finalize: async (task, file) => {
      await finalizeTask(store.cookies!, task, file);
    },
  });

  log.print('');
  log.print(`完成 ${result.done} 个，失败 ${result.failed} 个，跳过 ${result.skipped} 个，用时 ${((Date.now() - started) / 1000).toFixed(1)}s`);
  const failedTasks = tasks.filter((t) => t.stage === 'failed');
  for (const t of failedTasks.slice(0, 20)) {
    log.print(`  ✖ ${t.baseName}：${t.error?.message ?? ''}`);
  }
}
