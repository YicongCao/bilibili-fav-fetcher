import path from 'node:path';
import { stat } from 'node:fs/promises';
import { readJson, writeJsonAtomic } from '../utils/fsx.js';
import { log } from '../utils/logger.js';
import { getConfig } from '../config.js';
import type { IndexFile, TaskRecord } from '../types/index.js';

export interface SidecarFiles {
  poster?: string;
  subtitles: { format: 'ass' | 'srt'; file: string }[];
  meta?: string;
  nfo?: string;
}

/** 与视频同名的 metadata 侧车（.meta.json），可选 .nfo */
export async function writeSidecarMeta(
  task: TaskRecord,
  videoFile: string,
  files: { poster?: string | null; subtitles?: string[] },
): Promise<string | null> {
  const config = getConfig();
  if (!config.output.sidecarMeta) return null;

  const base = videoFile.slice(0, videoFile.lastIndexOf('.'));
  const metaFile = `${base}.meta.json`;
  let size = 0;
  try {
    size = (await stat(videoFile)).size;
  } catch {
    /* ignore */
  }

  const payload = {
    schema: 'bili-dl/meta@1',
    bvid: task.bvid,
    aid: task.aid,
    cid: task.cid,
    page: task.page,
    partTitle: task.partTitle ?? '',
    title: task.title,
    desc: task.desc ?? '',
    up: task.up,
    pubDate: task.pubDate,
    favTime: task.favTime,
    duration: task.duration,
    cover: task.cover,
    url: `https://www.bilibili.com/video/${task.bvid}${task.totalPages > 1 ? `/?p=${task.page}` : ''}`,
    folders: task.folders ?? [],
    files: {
      video: path.basename(videoFile),
      subtitles: files.subtitles?.map((f) => path.basename(f)) ?? [],
      poster: files.poster ? path.basename(files.poster) : undefined,
      meta: path.basename(metaFile),
    },
    media: {
      container: task.container,
      size,
      qualityId: task.streams?.video?.qualityId,
      qualityLabel: task.quality?.got,
      hdr: task.quality?.hdr ?? false,
      fps: task.quality?.fps,
      codec: task.quality?.codec,
      width: task.quality?.width,
      height: task.quality?.height,
    },
    downloadedAt: Date.now(),
    toolVersion: '0.1.0',
  };

  await writeJsonAtomic(metaFile, payload);

  if (config.output.nfo) {
    const nfoFile = `${base}.nfo`;
    const nfo = [
      '<?xml version="1.0" encoding="UTF-8" standalone="yes" ?>',
      '<episodedetails>',
      `  <title>${escapeXml(task.partTitle || task.title)}</title>`,
      `  <showtitle>${escapeXml(task.title)}</showtitle>`,
      `  <season>${task.totalPages > 1 ? 1 : ''}</season>`,
      `  <episode>${task.page}</episode>`,
      `  <plot>${escapeXml((task.desc ?? '').slice(0, 1000))}</plot>`,
      `  <aired>${new Date(task.pubDate).toISOString().slice(0, 10)}</aired>`,
      `  <studio>${escapeXml(task.up.name)}</studio>`,
      `  <uniqueid type="bilibili">${task.bvid}</uniqueid>`,
      '</episodedetails>',
      '',
    ].join('\n');
    const { writeFile } = await import('node:fs/promises');
    await writeFile(nfoFile, nfo, 'utf8');
  }

  return metaFile;
}

function escapeXml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** 任务完成后回写 outputs/index.json 的 local 字段 */
export async function updateIndexLocal(
  root: string,
  task: TaskRecord,
  videoFile: string,
  files: { poster?: string | null; subtitles?: string[]; meta?: string | null },
): Promise<void> {
  const indexPath = path.join(root, 'index.json');
  const index = await readJson<IndexFile>(indexPath);
  if (!index) return;

  const video = index.videos.find((v) => v.bvid === task.bvid);
  if (!video) return;

  const rel = (p: string) => path.relative(root, p).split(path.sep).join('/');
  const entry = {
    page: task.page,
    file: rel(videoFile),
    poster: files.poster ? rel(files.poster) : undefined,
    subtitles: files.subtitles?.map(rel),
    meta: files.meta ? rel(files.meta) : undefined,
  };

  const parts = (video.local?.parts ?? []).filter((p) => p.page !== task.page);
  parts.push(entry);
  parts.sort((a, b) => a.page - b.page);

  video.local = {
    status: 'done',
    dir: task.outDir,
    video: rel(videoFile),
    poster: files.poster ? rel(files.poster) : undefined,
    subtitles: (files.subtitles ?? []).map((f) => ({
      format: f.endsWith('.ass') ? ('ass' as const) : ('srt' as const),
      file: rel(f),
    })),
    meta: files.meta ? rel(files.meta) : undefined,
    size: video.local?.size,
    qualityId: task.streams?.video?.qualityId,
    qualityLabel: task.quality?.got,
    hdr: task.quality?.hdr,
    fps: task.quality?.fps,
    codec: task.quality?.codec,
    width: task.quality?.width,
    height: task.quality?.height,
    container: task.container,
    parts,
    downloadedAt: Date.now(),
  };

  await writeJsonAtomic(indexPath, index);
  log.debug(`已回写 index.json：${task.bvid} P${task.page}`);
}
