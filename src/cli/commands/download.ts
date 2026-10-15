import { DEFAULT_COOKIE_FILE, loadCookieFile } from '../../auth/cookie.js';
import { loadConfig } from '../../config.js';
import { readJson } from '../../utils/fsx.js';
import { log } from '../../utils/logger.js';
import { buildTasks } from '../../core/planner.js';
import { downloadMedia, planMedia } from '../../core/engines/native.js';
import type { IndexFile } from '../../types/index.js';
import { formatBytes } from '../../utils/fsx.js';

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
    videos = videos.filter((v) => v.primaryFolder?.title === options.folder || v.folders.some((f) => f.title === options.folder));
  }

  const tasks = await buildTasks(store.cookies!, videos, {
    source: 'favorite',
    limit: options.limit,
    orderBy: options.order,
    pages: options.pages,
  });

  if (options.dryRun) {
    for (const t of tasks.slice(0, 20)) {
      log.print(`[DRY] ${t.outDir}/${t.baseName}.${t.container}  ← ${t.title} P${t.page}`);
    }
    log.print(`共 ${tasks.length} 个任务（dry-run）`);
    return;
  }

  let ok = 0;
  let failed = 0;
  for (const task of tasks) {
    try {
      const plan = await planMedia(store.cookies!, task);
      task.quality = {
        want: plan.quality.want,
        got: `${plan.quality.video.qualityLabel}${plan.quality.video.hdr ? ' HDR' : ''}`,
        hdr: plan.quality.video.hdr,
        fps: plan.quality.video.fps,
        codec: plan.quality.video.codec,
        width: plan.quality.video.width,
        height: plan.quality.video.height,
        degraded: plan.quality.degraded,
      };
      log.print(
        `▶ ${task.baseName}  ${task.quality.got} ${plan.quality.video.width}x${plan.quality.video.height} ${plan.quality.video.fps}fps ${plan.quality.video.codec}${plan.quality.degraded ? ' (已降级)' : ''}`,
      );
      await downloadMedia(store.cookies!, task, plan, {
        onProgress: (done, total, speed) => {
          task.progress = { bytesDone: done, bytesTotal: total, speedBps: speed, etaSec: 0 };
        },
      });
      ok += 1;
    } catch (err) {
      failed += 1;
      const e = err as Error & { cause?: { message?: string; code?: string } };
      log.error(`✖ ${task.baseName}：${e.message}${e.cause ? `（${e.cause.code ?? ''} ${e.cause.message ?? ''}）` : ''}`);
    }
  }

  log.print('');
  log.print(`完成 ${ok} 个，失败 ${failed} 个`);
  void formatBytes(0);
}
