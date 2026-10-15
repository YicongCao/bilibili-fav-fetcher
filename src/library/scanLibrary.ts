import path from 'node:path';
import { readdir, stat } from 'node:fs/promises';
import { readJson, writeJsonAtomic } from '../utils/fsx.js';
import { log } from '../utils/logger.js';
import type { IndexFile } from '../types/index.js';

export interface LibraryItem {
  id: string;
  bvid: string;
  cid?: number;
  page: number;
  partTitle?: string;
  title: string;
  up: { mid: number; name: string };
  duration: number;
  pubDate: number;
  favTime: number;
  folder?: string;
  dir: string;
  video: string;
  poster?: string;
  subtitles: { format: string; file: string }[];
  meta?: string;
  width?: number;
  height?: number;
  size?: number;
  qualityLabel?: string;
  hdr?: boolean;
  downloadedAt?: number;
}

export interface LibraryData {
  schema: 'bili-dl/library@1';
  generatedAt: number;
  folders: string[];
  ups: { mid: number; name: string; count: number }[];
  items: LibraryItem[];
}

/** 由 index.json（优先读每个视频的同名 .meta.json）生成媒体库数据 */
export async function scanLibrary(root: string): Promise<LibraryData> {
  const index = await readJson<IndexFile>(path.join(root, 'index.json'));
  const items: LibraryItem[] = [];
  const folders = new Set<string>();
  const ups = new Map<number, { mid: number; name: string; count: number }>();

  if (!index) {
    log.warn('未找到 index.json，媒体库为空（请先 bili scan）');
    return { schema: 'bili-dl/library@1', generatedAt: Date.now(), folders: [], ups: [], items: [] };
  }

  for (const video of index.videos) {
    const local = video.local;
    if (!local?.video) continue;

    const parts = local.parts?.length
      ? local.parts
      : [{ page: 1, file: local.video, poster: local.poster, subtitles: local.subtitles?.map((s) => s.file) }];

    for (const part of parts) {
      const fileAbs = path.join(root, part.file);
      const size = await stat(fileAbs).then((s) => s.size).catch(() => undefined);
      const folder = local.dir ?? video.primaryFolder?.title ?? '';
      folders.add(folder);

      const up = ups.get(video.up.mid) ?? { mid: video.up.mid, name: video.up.name, count: 0 };
      up.count += 1;
      ups.set(video.up.mid, up);

      items.push({
        id: `${video.bvid}-${part.page}`,
        bvid: video.bvid,
        page: part.page,
        partTitle: video.pages?.find((p) => p.page === part.page)?.part,
        title: video.title,
        up: video.up,
        duration: video.duration,
        pubDate: video.pubDate,
        favTime: Math.max(...video.folders.map((f) => f.favTime), 0),
        folder,
        dir: local.dir ?? '',
        video: part.file.split('/').join('/'),
        poster: part.poster,
        subtitles: (part.subtitles ?? []).map((f) => ({
          format: f.endsWith('.ass') ? 'ass' : 'srt',
          file: f,
        })),
        meta: part.meta,
        width: local.width,
        height: local.height,
        size,
        qualityLabel: local.qualityLabel,
        hdr: local.hdr,
        downloadedAt: local.downloadedAt,
      });
    }
  }

  items.sort((a, b) => b.favTime - a.favTime);
  return {
    schema: 'bili-dl/library@1',
    generatedAt: Date.now(),
    folders: [...folders].filter(Boolean).sort(),
    ups: [...ups.values()].sort((a, b) => b.count - a.count),
    items,
  };
}

export async function buildLibrary(root: string): Promise<LibraryData> {
  const data = await scanLibrary(root);
  await writeJsonAtomic(path.join(root, 'library.js'), `window.__BILI_LIBRARY__ = ${JSON.stringify(data)};\n`);
  await writeJsonAtomic(path.join(root, 'library.json'), data);
  log.info(`媒体库：${data.items.length} 个视频，${data.folders.length} 个分类，${data.ups.length} 位 UP`);
  return data;
}

/** 供 build-index 之后显示目录体积 */
export async function dirSize(dir: string): Promise<number> {
  let total = 0;
  const walk = async (d: string): Promise<void> => {
    const entries = await readdir(d, { withFileTypes: true });
    for (const e of entries) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) await walk(p);
      else total += await stat(p).then((s) => s.size).catch(() => 0);
    }
  };
  await walk(dir);
  return total;
}
