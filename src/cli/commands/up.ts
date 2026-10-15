import { DEFAULT_COOKIE_FILE, loadCookieFile } from '../../auth/cookie.js';
import { loadConfig } from '../../config.js';
import { log } from '../../utils/logger.js';
import { accountInfo, listUploads, parseUpIdentity, searchUp } from '../../api/space.js';
import { buildTasks } from '../../core/planner.js';
import { TaskStore } from '../../core/taskStore.js';
import { DownloadQueue } from '../../core/queue.js';
import { runQueue } from '../../core/pipeline.js';
import { checkEngines } from '../../core/engines/index.js';
import { sanitizeName } from '../../core/namer.js';
import type { VideoMeta } from '../../types/index.js';

function parseDuration(text: string): number {
  const parts = text.split(':').map((p) => Number(p) || 0);
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  return parts[0] ?? 0;
}

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

  let mid = parseUpIdentity(target);
  if (mid === null) {
    mid = await searchUp(store.cookies, target);
    if (mid === null) {
      log.error(`无法解析 UP 主：${target}（可用 mid、space.bilibili.com 链接或昵称）`);
      process.exitCode = 1;
      return;
    }
  }

  const info = await accountInfo(store.cookies, mid);
  const uploads = await listUploads(store.cookies, mid);
  const sinceTs = options.since ? Date.parse(options.since) : 0;

  const kw = options.keyword;
  let list = uploads.filter((v) => v.bvid && (!sinceTs || v.created * 1000 >= sinceTs));
  if (kw) list = list.filter((v) => v.title.includes(kw));

  const dir = config.output.upDirTemplate
    .replace('{up}', sanitizeName(info.name))
    .replace('{mid}', String(mid));
  log.info(`UP 主 ${info.name}（mid=${mid}）：${list.length} 个投稿 → outputs/${dir}`);

  const videos: VideoMeta[] = list.map((v) => ({
    bvid: v.bvid,
    aid: v.aid,
    title: v.title,
    desc: v.description,
    cover: v.pic,
    up: { mid, name: info.name },
    pubDate: v.created * 1000,
    duration: parseDuration(v.length),
    url: `https://www.bilibili.com/video/${v.bvid}`,
    collectedPage: 1,
    folders: [],
    primaryFolder: { fid: 0, title: `UP:${info.name}`, dir },
    local: { status: 'pending' },
  }));

  const tasks = await buildTasks(store.cookies, videos, {
    source: 'up',
    limit: options.limit,
    orderBy: 'pubDate',
    outDirOf: () => dir,
  });

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
