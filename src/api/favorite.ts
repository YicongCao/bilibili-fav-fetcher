import { apiGet } from './client.js';
import type { FolderInfo } from '../types/index.js';
import { globalLimiter } from '../utils/rate.js';

export interface RawMedia {
  id: number;
  type: number;
  title: string;
  cover: string;
  intro?: string;
  page?: number;
  duration?: number;
  bvid?: string;
  bv_id?: string;
  fav_time?: number;
  pubtime?: number;
  attr?: number;
  link?: string;
  upper?: { mid?: number; name?: string; face?: string };
  cnt_info?: { collect?: number; play?: number; danmaku?: number };
}

interface FolderListResp {
  count?: number;
  list?: Array<{
    id?: number;
    fid?: number;
    mid?: number;
    attr?: number;
    title?: string;
    fav_state?: number;
    media_count?: number;
    cover?: string;
  }>;
  has_more?: boolean;
}

interface ResourceListResp {
  medias?: RawMedia[];
  has_more?: boolean;
  info?: { id?: number; fid?: number; title?: string; cover?: string; media_count?: number; attr?: number };
}

export function isDefaultFolder(title: string, excluded: string[]): boolean {
  return title.trim() === '默认收藏夹' || excluded.includes(title.trim());
}

/** 自建收藏夹（含「默认收藏夹」） */
export async function listCreatedFolders(cookies: Record<string, string>, mid: number): Promise<FolderInfo[]> {
  await globalLimiter.wait();
  const data = await apiGet<FolderListResp>(
    '/x/v3/fav/folder/created/list-all',
    { up_mid: mid, jsonp: 'jsonp', platform: 'web' },
    { cookies, signed: true },
  );
  return (data.list ?? []).map((f) => {
    const title = f.title ?? '未命名收藏夹';
    // 注意：resource/list 的 media_id 必须用 list-all 里的 id（= fid 拼接 mid 后缀），不能用 fid
    return {
      fid: f.id ?? f.fid ?? 0,
      title,
      mediaCount: f.media_count ?? 0,
      cover: f.cover,
      isDefault: isDefaultFolder(title, []),
      kind: 'created' as const,
    };
  });
}

/** 收藏的他人收藏夹（默认不扫描） */
export async function listCollectedFolders(cookies: Record<string, string>, mid: number): Promise<FolderInfo[]> {
  await globalLimiter.wait();
  const data = await apiGet<FolderListResp>(
    '/x/v3/fav/folder/collected/list',
    { up_mid: mid, pn: 1, ps: 100, jsonp: 'jsonp', platform: 'web' },
    { cookies, signed: true },
  );
  return (data.list ?? []).map((f) => {
    const title = f.title ?? '未命名收藏夹';
    return {
      fid: f.id ?? f.fid ?? 0,
      title,
      mediaCount: f.media_count ?? 0,
      cover: f.cover,
      isDefault: false,
      kind: 'collected' as const,
    };
  });
}

/** 分页拉取某个收藏夹内的全部资源 */
export async function listFolderResources(
  cookies: Record<string, string>,
  fid: number,
  opts: { order?: 'mtime' | 'view'; pageSize?: number; maxPages?: number } = {},
): Promise<RawMedia[]> {
  const order = opts.order ?? 'mtime';
  const pageSize = opts.pageSize ?? 20;
  const out: RawMedia[] = [];
  for (let pn = 1; pn <= (opts.maxPages ?? 500); pn += 1) {
    await globalLimiter.wait();
    const data = await apiGet<ResourceListResp>(
      '/x/v3/fav/resource/list',
      {
        media_id: fid,
        pn,
        ps: pageSize,
        keyword: '',
        order,
        type: 0,
        tid: 0,
        platform: 'web',
        jsonp: 'jsonp',
      },
      { cookies, signed: true },
    );
    const list = data.medias ?? [];
    out.push(...list);
    if (!data.has_more || list.length < pageSize) break;
  }
  return out;
}
