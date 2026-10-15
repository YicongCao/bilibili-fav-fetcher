import path from 'node:path';
import { ensureDir, readJson, writeJsonAtomic } from '../utils/fsx.js';
import { log } from '../utils/logger.js';
import { getConfig, type Config } from '../config.js';
import { isDefaultFolder, listCreatedFolders, listCollectedFolders, listFolderResources } from '../api/favorite.js';
import type { FolderInfo, FolderStat, IndexFile, FavoritesFile, VideoMeta } from '../types/index.js';
import { sanitizeName, dedupeName } from './namer.js';
import { nav } from '../api/nav.js';

export interface ScanOptions {
  folders?: number[];
  includeCollected?: boolean;
  /** true = 忽略已有 index.json，整量重扫 */
  full?: boolean;
}

export interface ScanResult {
  index: IndexFile;
  root: string;
  dirCount: number;
  incremental: boolean;
  added: number;
}

/** 决策视频主目录：优先非默认收藏夹，取收藏时间最新的那个 */
export function pickPrimaryFolder(
  video: { folders: { fid: number; title: string; favTime: number }[] },
  folders: FolderStat[],
  folderPick: Config['download']['folderPick'],
): { fid: number; title: string } | null {
  if (video.folders.length === 0) return null;
  const statOf = (fid: number) => folders.find((f) => f.fid === fid);
  let candidates = video.folders;

  if (folderPick === 'non-default-first') {
    const nonDefault = candidates.filter((f) => !statOf(f.fid)?.isDefault);
    candidates = nonDefault.length ? nonDefault : candidates;
  }
  const sorted = [...candidates].sort((a, b) => b.favTime - a.favTime);
  const chosen = sorted[0] ?? video.folders[0];
  return { fid: chosen.fid, title: chosen.title };
}

export async function scan(cookies: Record<string, string>, opts: ScanOptions = {}): Promise<ScanResult> {
  const config = getConfig();
  const root = config.output.root;
  const me = await nav(cookies);

  // 增量扫描：以已有 index.json 为底，遇到已收录的稿件就停止翻页
  const oldIndex = await readJson<IndexFile>(path.join(root, 'index.json'));
  const incremental = !opts.full && (config.scan.incremental ?? true) && Boolean(oldIndex?.videos?.length);
  const known = new Map<string, VideoMeta>();
  if (incremental) {
    for (const v of oldIndex!.videos) known.set(v.bvid, v);
    log.info(`增量扫描：已有 ${known.size} 个稿件，只拉取新增部分（--full 可强制全量）`);
  }

  let folders: FolderInfo[] = await listCreatedFolders(cookies, me.mid);
  if (opts.includeCollected ?? config.scan.includeCollectedFolders) {
    try {
      folders = folders.concat(await listCollectedFolders(cookies, me.mid));
    } catch (err) {
      log.warn(`读取收藏的他人收藏夹失败：${(err as Error).message}`);
    }
  }
  if (opts.folders?.length) {
    const set = new Set(opts.folders);
    folders = folders.filter((f) => set.has(f.fid));
  }
  if (!folders.length) throw new Error('未读取到任何收藏夹，请检查登录态或 --fav 参数');

  log.info(`发现 ${folders.length} 个收藏夹：${folders.map((f) => `${f.title}(${f.mediaCount})`).join('、')}`);

  // 目录名防重名
  const usedDirs = new Set<string>();
  const dirOfFolder = new Map<number, string>();
  for (const f of folders) {
    const base = sanitizeName(f.title || `未命名收藏夹(${f.fid})`);
    dirOfFolder.set(f.fid, dedupeName(usedDirs, base, String(f.fid)));
  }

  const videosByBvid = new Map<string, VideoMeta>();
  const perFolder = new Map<number, VideoMeta[]>();
  let skippedNonVideo = 0;
  let skippedDead = 0;

  for (const folder of folders) {
    const list = perFolder.get(folder.fid) ?? [];
    perFolder.set(folder.fid, list);

    let medias;
    try {
      medias = await listFolderResources(cookies, folder.fid, {
        order: config.scan.resourceOrder,
        ...(incremental ? { stopWhen: (m: { bvid?: string; bv_id?: string }) => known.has(m.bvid ?? m.bv_id ?? '') } : {}),
      });
    } catch (err) {
      log.error(`收藏夹「${folder.title}」拉取失败：${(err as Error).message}`);
      continue;
    }

    for (const m of medias) {
      if (m.type !== 2) {
        skippedNonVideo += 1;
        continue;
      }
      if (m.attr && m.attr !== 0) {
        skippedDead += 1;
        continue;
      }
      const bvid = m.bvid ?? m.bv_id ?? '';
      if (!bvid) continue;

      const favTime = (m.fav_time ?? 0) * 1000 || Date.now();
      // 已收录的稿件复用旧记录（保留 local/pages/downloadedAt 等），只更新收藏归属与时间
      const base = known.get(bvid);
      if (base && !videosByBvid.has(bvid)) {
        base.title = m.title ?? base.title;
        base.cover = m.cover ?? base.cover;
        base.duration = m.duration ?? base.duration;
        base.pubDate = (m.pubtime ?? 0) * 1000 || base.pubDate;
        base.collectedPage = m.page ?? base.collectedPage;
        base.up = { mid: m.upper?.mid ?? base.up.mid, name: m.upper?.name ?? base.up.name };
        videosByBvid.set(bvid, base);
      }
      const meta: VideoMeta = videosByBvid.get(bvid) ?? {
        bvid,
        aid: m.id ?? 0,
        title: m.title ?? '',
        cover: m.cover ?? '',
        up: { mid: m.upper?.mid ?? 0, name: m.upper?.name ?? '' },
        pubDate: (m.pubtime ?? 0) * 1000,
        duration: m.duration ?? 0,
        url: `https://www.bilibili.com/video/${bvid}`,
        collectedPage: m.page ?? 1,
        folders: [],
        local: { status: 'pending' },
      };

      const folderEntry = { fid: folder.fid, title: folder.title, favTime };
      if (!meta.folders.some((f) => f.fid === folder.fid)) meta.folders.push(folderEntry);

      videosByBvid.set(bvid, meta);
      if (!list.some((v) => v.bvid === bvid)) list.push(meta);
    }
    log.info(`收藏夹「${folder.title}」：${list.length} 个视频`);
  }

  // 归属决策：优先非默认收藏夹
  const stats: FolderStat[] = folders.map((f) => ({
    fid: f.fid,
    title: f.title,
    count: perFolder.get(f.fid)?.length ?? 0,
    cover: f.cover,
    isDefault: isDefaultFolder(f.title, config.output.excludedFolders),
    kind: f.kind,
  }));

  const videos = [...videosByBvid.values()];
  const added = incremental ? videos.filter((v) => !known.has(v.bvid)).length : videos.length;
  // 增量模式下，已下载但被取消收藏的稿件保留在库里（不丢失本地成品信息）
  if (incremental) {
    for (const old of oldIndex!.videos) {
      if (videosByBvid.has(old.bvid)) continue;
      const st = old.local?.status;
      if (st === 'done' || st === 'skipped') {
        videos.push(old);
        log.debug(`已下载但已取消收藏，仍保留在库：${old.bvid}`);
      }
    }
  }
  for (const v of videos) {
    const primary = pickPrimaryFolder(v, stats, config.download.folderPick);
    if (!primary) continue;
    v.primaryFolder = { ...primary, dir: dirOfFolder.get(primary.fid) ?? sanitizeName(primary.title) };
  }

  // 落盘：目录 + index.json + favorites.json + 每个收藏夹 metadata.json
  await ensureDir(root);
  const dirs = new Set(videos.map((v) => v.primaryFolder?.dir).filter(Boolean) as string[]);
  for (const d of dirs) await ensureDir(path.join(root, d));
  // 空收藏夹也建目录
  for (const f of folders) await ensureDir(path.join(root, dirOfFolder.get(f.fid)!));

  const index: IndexFile = {
    schema: 'bili-dl/index@1',
    generatedAt: Date.now(),
    user: { mid: me.mid, uname: me.uname },
    folders: stats,
    videos,
    skipped: { nonVideo: skippedNonVideo, dead: skippedDead },
  };
  await writeJsonAtomic(path.join(root, 'index.json'), index);

  const favFile: FavoritesFile = {
    schema: 'bili-dl/favorites@1',
    generatedAt: Date.now(),
    user: { mid: me.mid, uname: me.uname },
    folders: stats,
  };
  await writeJsonAtomic(path.join(root, 'favorites.json'), favFile);

  if (config.output.perFolderMetadata) {
    for (const f of folders) {
      const dir = dirOfFolder.get(f.fid)!;
      await writeJsonAtomic(path.join(root, dir, 'metadata.json'), {
        schema: 'bili-dl/folder@1',
        generatedAt: Date.now(),
        folder: { fid: f.fid, title: f.title, dir },
        videos: perFolder.get(f.fid) ?? [],
      });
    }
  }

  log.info(
    `扫描完成：${videos.length} 个视频，${dirs.size} 个目录（${incremental ? `增量，新增 ${added}` : '全量'}；已跳过 非视频 ${skippedNonVideo} / 失效 ${skippedDead}）`,
  );
  return { index, root, dirCount: dirs.size, incremental, added };
}
