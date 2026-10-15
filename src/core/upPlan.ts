import { accountInfo, listUploads, parseUpIdentity, searchUp } from '../api/space.js';
import { getConfig } from '../config.js';
import { buildTasks } from './planner.js';
import { sanitizeName } from './namer.js';
import { log } from '../utils/logger.js';
import type { TaskRecord, VideoMeta } from '../types/index.js';

export interface UpPlanOptions {
  limit?: number;
  keyword?: string;
  since?: string;
}

export interface UpPlan {
  mid: number;
  name: string;
  dir: string;
  total: number;
  tasks: TaskRecord[];
}

function parseDuration(text: string): number {
  const parts = text.split(':').map((p) => Number(p) || 0);
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  return parts[0] ?? 0;
}

/** 解析 UP 主身份（mid / 主页 URL / 昵称）→ 拉取投稿 → 展开为任务（up.ts 与管理端共用） */
export async function buildUpTasks(
  cookies: Record<string, string>,
  target: string,
  options: UpPlanOptions = {},
): Promise<UpPlan> {
  const config = getConfig();

  let mid = parseUpIdentity(target);
  if (mid === null) {
    mid = await searchUp(cookies, target);
    if (mid === null) throw new Error(`无法解析 UP 主：${target}（可用 mid、space.bilibili.com 链接或昵称）`);
  }

  const info = await accountInfo(cookies, mid);
  const uploads = await listUploads(cookies, mid);
  const sinceTs = options.since ? Date.parse(options.since) : 0;

  let list = uploads.filter((v) => v.bvid && (!sinceTs || v.created * 1000 >= sinceTs));
  if (options.keyword) list = list.filter((v) => v.title.includes(options.keyword!));

  const dir = config.output.upDirTemplate.replace('{up}', sanitizeName(info.name)).replace('{mid}', String(mid));
  log.info(`UP 主 ${info.name}（mid=${mid}）：${list.length} 个投稿 → ${config.output.root}/${dir}`);

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

  const tasks = await buildTasks(cookies, videos, {
    source: 'up',
    limit: options.limit,
    orderBy: 'pubDate',
    outDirOf: () => dir,
  });

  return { mid, name: info.name, dir, total: list.length, tasks };
}
