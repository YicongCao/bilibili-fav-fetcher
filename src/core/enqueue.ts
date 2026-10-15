import path from 'node:path';
import { readJson } from '../utils/fsx.js';
import { log } from '../utils/logger.js';
import { buildTasks } from './planner.js';
import { buildUpTasks } from './upPlan.js';
import { scan } from './scanner.js';
import { invalidateUsage } from './disk.js';
import type { IndexFile, FavoritesFile } from '../types/index.js';
import type { TaskStore } from './taskStore.js';
import type { DownloadQueue } from './queue.js';

export interface EnqueueCtx {
  cookies: Record<string, string>;
  store: TaskStore;
  queue: DownloadQueue;
  root: string;
}

function push(ctx: EnqueueCtx, tasks: Awaited<ReturnType<typeof buildTasks>>): number {
  let added = 0;
  for (const t of tasks) {
    if (ctx.store.get(t.id) && ctx.store.get(t.id)!.stage === 'done') continue;
    ctx.store.upsert(t);
    ctx.queue.enqueue([t]);
    added += 1;
  }
  return added;
}

export interface EnqueueFavOptions {
  folder?: string;
  limit?: number;
  order?: 'favTime' | 'pubDate';
  pages?: 'all' | 'collected' | 'first';
}

/** 按收藏夹入队（不选 folder = 全部收藏夹） */
export async function enqueueFavorites(
  ctx: EnqueueCtx,
  opts: EnqueueFavOptions = {},
): Promise<{ added: number; matched: number }> {
  const index = await readJson<IndexFile>(path.join(ctx.root, 'index.json'));
  if (!index) throw new Error(`未找到 ${ctx.root}/index.json，请先刷新收藏夹`);

  let videos = index.videos;
  if (opts.folder) {
    videos = videos.filter(
      (v) => v.primaryFolder?.title === opts.folder || v.folders.some((f) => f.title === opts.folder),
    );
  }
  const tasks = await buildTasks(ctx.cookies, videos, {
    source: 'favorite',
    limit: opts.limit,
    orderBy: opts.order,
    pages: opts.pages,
  });
  const added = push(ctx, tasks);
  log.info(`收藏夹入队：匹配 ${videos.length} 个稿件，新增 ${added} 个任务`);
  return { added, matched: videos.length };
}

export interface EnqueueUpOptions {
  target: string;
  limit?: number;
  keyword?: string;
  since?: string;
}

/** 按 UP 主入队：mid / 主页 URL / 昵称均可 */
export async function enqueueUp(
  ctx: EnqueueCtx,
  opts: EnqueueUpOptions,
): Promise<{ added: number; up: string; mid: number; total: number; dir: string }> {
  const plan = await buildUpTasks(ctx.cookies, opts.target, {
    limit: opts.limit,
    keyword: opts.keyword,
    since: opts.since,
  });
  const added = push(ctx, plan.tasks);
  log.info(`UP 主入队：${plan.name}（mid=${plan.mid}），新增 ${added} 个任务`);
  return { added, up: plan.name, mid: plan.mid, total: plan.total, dir: plan.dir };
}

/** 重新扫描收藏夹（刷新 index.json） */
export async function refreshFavorites(
  ctx: EnqueueCtx,
  opts: { full?: boolean } = {},
): Promise<{ videos: number; dirs: number; incremental: boolean; added: number }> {
  const result = await scan(ctx.cookies, { full: opts.full });
  invalidateUsage(ctx.root);
  return {
    videos: result.index.videos.length,
    dirs: result.dirCount,
    incremental: result.incremental,
    added: result.added,
  };
}

/** 收藏夹清单（供管理端下拉） */
export async function listFolders(ctx: EnqueueCtx): Promise<{ fid: number; title: string; count: number }[]> {
  const fav = await readJson<FavoritesFile>(path.join(ctx.root, 'favorites.json'));
  if (fav?.folders?.length) {
    return fav.folders.map((f) => ({ fid: f.fid, title: f.title, count: f.count ?? 0 }));
  }
  const index = await readJson<IndexFile>(path.join(ctx.root, 'index.json'));
  const map = new Map<number, { fid: number; title: string; count: number }>();
  for (const v of index?.videos ?? []) {
    for (const f of v.folders) {
      const item = map.get(f.fid) ?? { fid: f.fid, title: f.title, count: 0 };
      item.count += 1;
      map.set(f.fid, item);
    }
  }
  return [...map.values()].sort((a, b) => b.count - a.count);
}
