import { apiGet } from './client.js';
import { globalLimiter } from '../utils/rate.js';
import type { PageMeta } from '../types/index.js';

export interface ViewDetail {
  aid: number;
  bvid: string;
  title: string;
  desc?: string;
  pic: string;
  owner: { mid: number; name: string };
  pubdate: number;
  duration: number;
  tid?: number;
  tname?: string;
  stat?: { view?: number; danmaku?: number; like?: number; favorite?: number };
  pages: PageMeta[];
}

interface ViewResp {
  aid?: number;
  bvid?: string;
  title?: string;
  desc?: string;
  pic?: string;
  owner?: { mid?: number; name?: string };
  pubdate?: number;
  duration?: number;
  tid?: number;
  tname?: string;
  stat?: { view?: number; danmaku?: number; like?: number; favorite?: number };
  pages?: Array<{ cid?: number; page?: number; part?: string; duration?: number }>;
}

/** 稿件详情：分 P 列表 / 封面 / 简介 / 统计 */
export async function viewDetail(cookies: Record<string, string>, bvid: string): Promise<ViewDetail> {
  await globalLimiter.wait();
  const d = await apiGet<ViewResp>('/x/web-interface/view', { bvid }, { cookies, timeoutMs: 12_000 });
  return {
    aid: d.aid ?? 0,
    bvid: d.bvid ?? bvid,
    title: d.title ?? '',
    desc: d.desc,
    pic: d.pic ?? '',
    owner: { mid: d.owner?.mid ?? 0, name: d.owner?.name ?? '' },
    pubdate: d.pubdate ?? 0,
    duration: d.duration ?? 0,
    tid: d.tid,
    tname: d.tname,
    stat: d.stat,
    pages: (d.pages ?? []).map((p) => ({
      page: p.page ?? 1,
      cid: p.cid ?? 0,
      part: p.part ?? '',
      duration: p.duration ?? 0,
    })),
  };
}
