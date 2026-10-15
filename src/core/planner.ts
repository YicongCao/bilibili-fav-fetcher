import { createHash } from 'node:crypto';
import path from 'node:path';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { viewDetail, type ViewDetail } from '../api/view.js';
import { log } from '../utils/logger.js';
import { getConfig } from '../config.js';
import { buildBaseName, usePartSuffix } from './namer.js';
import { deletedKey, loadDeleted } from './deleted.js';
import type { TaskRecord, VideoMeta } from '../types/index.js';

export function taskId(bvid: string, cid: number, quality: string, container: string): string {
  return createHash('sha1').update(`${bvid}|${cid}|${quality}|${container}`).digest('hex').slice(0, 16);
}

/** 稿件详情缓存（避免重复请求，TTL 1 天） */
async function getViewCached(cookies: Record<string, string>, bvid: string, root: string): Promise<ViewDetail> {
  const cacheFile = path.join(root, '.cache', 'view', `${bvid}.json`);
  try {
    const raw = await readFile(cacheFile, 'utf8');
    const parsed = JSON.parse(raw) as { at: number; data: ViewDetail };
    if (Date.now() - parsed.at < 86_400_000 && parsed.data?.pages?.length) return parsed.data;
  } catch {
    /* 无缓存 */
  }
  const data = await viewDetail(cookies, bvid);
  await mkdir(path.dirname(cacheFile), { recursive: true });
  await writeFile(cacheFile, JSON.stringify({ at: Date.now(), data }), 'utf8');
  return data;
}

export interface BuildTasksOptions {
  source: 'favorite' | 'up';
  /** 输出目录（相对 outputs 根），由调用方按收藏夹/UP 决定 */
  outDirOf?: (video: VideoMeta) => string;
  limit?: number;
  orderBy?: 'favTime' | 'pubDate';
  pages?: 'all' | 'collected' | 'first';
}

/** 由 index.json 的视频列表展开为任务（一个分 P 一个任务） */
export async function buildTasks(
  cookies: Record<string, string>,
  videos: VideoMeta[],
  opts: BuildTasksOptions = { source: 'favorite' },
): Promise<TaskRecord[]> {
  const config = getConfig();
  const root = config.output.root;
  const orderBy = opts.orderBy ?? config.download.orderBy;
  const pageRule = opts.pages ?? config.download.pages;
  // 用户手动删除过的分 P 不再规划，避免「删了又下回来」
  const deleted = await loadDeleted(root);

  const sorted = [...videos].sort((a, b) => {
    const ka = orderBy === 'pubDate' ? a.pubDate : Math.max(...a.folders.map((f) => f.favTime), 0);
    const kb = orderBy === 'pubDate' ? b.pubDate : Math.max(...b.folders.map((f) => f.favTime), 0);
    return kb - ka;
  });

  const tasks: TaskRecord[] = [];
  let processed = 0;

  for (const video of sorted) {
    if (opts.limit && tasks.length >= opts.limit) break;
    processed += 1;
    if (processed % 50 === 0) log.info(`规划中… ${processed}/${sorted.length}`);

    let detail: ViewDetail | null = null;
    try {
      detail = await getViewCached(cookies, video.bvid, root);
    } catch (err) {
      log.warn(`获取稿件详情失败 ${video.bvid}：${(err as Error).message}`);
      continue;
    }

    const pages = detail.pages.length
      ? detail.pages
      : [{ page: 1, cid: 0, part: '', duration: video.duration }];
    if (!pages[0]?.cid) {
      log.warn(`稿件 ${video.bvid} 无有效 cid，跳过`);
      continue;
    }

    const targets =
      pageRule === 'all'
        ? pages
        : pageRule === 'first'
          ? pages.slice(0, 1)
          : pages.filter((p) => p.page === video.collectedPage || pages.length === 1);

    const dir =
      opts.outDirOf?.(video) ?? video.primaryFolder?.dir ?? '未分类';
    const multi = usePartSuffix(config.output.partSuffix, pages.length);

    for (const p of targets) {
      if (opts.limit && tasks.length >= opts.limit) break;
      if (deleted.items[deletedKey(video.bvid, p.page)]) continue;
      // 单 P 稿件去掉 [P{p}] 片段，避免出现空的 [P]
      const template = multi
        ? config.output.filenameTemplate
        : config.output.filenameTemplate.replace(/\s*\[P\{p\}[^\]]*\]/, '').trim();
      const baseName = buildBaseName(template, {
        title: detail.title || video.title,
        bvid: video.bvid,
        up: video.up.name,
        mid: video.up.mid,
        p: p.page,
        ptitle: p.part,
      });
      const favTime = Math.max(...video.folders.map((f) => f.favTime), 0);
      tasks.push({
        id: taskId(video.bvid, p.cid, config.download.quality, config.mux.container),
        source: opts.source,
        bvid: video.bvid,
        aid: video.aid || detail.aid,
        cid: p.cid,
        page: p.page,
        partTitle: p.part,
        title: detail.title || video.title,
        up: video.up,
        orderKey: orderBy === 'pubDate' ? video.pubDate : favTime,
        duration: p.duration || video.duration,
        cover: detail.pic || video.cover,
        desc: detail.desc,
        favTime,
        pubDate: video.pubDate || detail.pubdate * 1000,
        totalPages: pages.length,
        folders: video.folders.map((f) => ({ fid: f.fid, title: f.title })),
        outDir: dir,
        baseName,
        container: config.mux.container,
        stage: 'queued',
        priority: 0,
        progress: { bytesDone: 0, bytesTotal: 0, speedBps: 0, etaSec: 0 },
        retryCount: 0,
        engine: 'native',
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
    }
  }

  log.info(`规划出 ${tasks.length} 个任务（来自 ${sorted.length} 个稿件）`);
  return tasks;
}
