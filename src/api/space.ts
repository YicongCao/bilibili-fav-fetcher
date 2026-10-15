import { apiGet } from './client.js';
import { globalLimiter } from '../utils/rate.js';

export interface SpaceInfo {
  mid: number;
  name: string;
  face?: string;
  sign?: string;
}

export interface SpaceVideo {
  bvid: string;
  aid: number;
  title: string;
  pic: string;
  created: number;
  length: string;
  play?: number;
  comment?: number;
  description?: string;
}

interface AccInfoResp {
  mid?: number;
  name?: string;
  face?: string;
  sign?: string;
}

interface ArcSearchResp {
  page?: { pn?: number; ps?: number; count?: number };
  list?: { vlist?: Array<Record<string, unknown>> };
}

export async function accountInfo(cookies: Record<string, string>, mid: number): Promise<SpaceInfo> {
  await globalLimiter.wait();
  const d = await apiGet<AccInfoResp>('/x/space/wbi/acc/info', { mid, platform: 'web', jsonp: 'jsonp' }, { cookies, signed: true });
  return { mid: d.mid ?? mid, name: d.name ?? String(mid), face: d.face, sign: d.sign };
}

/** 按发布时间倒序拉取全部投稿 */
export async function listUploads(
  cookies: Record<string, string>,
  mid: number,
  opts: { maxPages?: number } = {},
): Promise<SpaceVideo[]> {
  const out: SpaceVideo[] = [];
  const pageSize = 50;
  for (let pn = 1; pn <= (opts.maxPages ?? 200); pn += 1) {
    await globalLimiter.wait();
    const d = await apiGet<ArcSearchResp>(
      '/x/space/wbi/arc/search',
      { mid, pn, ps: pageSize, order: 'pubdate', platform: 'web', jsonp: 'jsonp' },
      { cookies, signed: true },
    );
    const vlist = d.list?.vlist ?? [];
    for (const raw of vlist) {
      out.push({
        bvid: String(raw.bvid ?? ''),
        aid: Number(raw.aid ?? 0),
        title: String(raw.title ?? ''),
        pic: String(raw.pic ?? ''),
        created: Number(raw.created ?? 0),
        length: String(raw.length ?? '0:0'),
        play: Number(raw.play ?? 0),
        comment: Number(raw.comment ?? 0),
        description: String(raw.description ?? ''),
      });
    }
    const total = d.page?.count ?? 0;
    if (vlist.length < pageSize || out.length >= total) break;
  }
  return out;
}

interface UserSearchResp {
  result?: Array<{ mid?: number; uname?: string; fans?: number; videos?: number }>;
}

/** 按昵称搜索 UP 主，返回最匹配的一个 */
export async function searchUp(cookies: Record<string, string>, keyword: string): Promise<number | null> {
  await globalLimiter.wait();
  try {
    const d = await apiGet<UserSearchResp>(
      '/x/web-interface/wbi/search/type',
      { search_type: 'bili_user', keyword, page: 1, order: 'fans' },
      { cookies, signed: true },
    );
    const first = (d.result ?? []).find((r) => r.mid);
    return first?.mid ?? null;
  } catch (err) {
    void err;
    return null;
  }
}

/** 解析 UP 主标识：mid / 主页 URL / space.bilibili.com URL */
export function parseUpIdentity(input: string): number | null {
  const trimmed = input.trim();
  if (/^\d+$/.test(trimmed)) return Number(trimmed);
  const match = trimmed.match(/space\.bilibili\.com\/(\d+)/);
  if (match) return Number(match[1]);
  return null;
}
