import { globalLimiter } from '../utils/rate.js';
import { httpFetch } from '../utils/net.js';
import { parseDanmakuSegment, type DanmakuElem } from '../danmaku/protobuf.js';
import { UA, WEB_REFERER } from './client.js';

const SEGMENT_DURATION_SEC = 6 * 60; // B 站每 6 分钟一个弹幕段

export interface DanmakuItem {
  /** 出现时间（秒） */
  time: number;
  text: string;
  mode: number; // 1 滚动 4 底部 5 顶部
  fontSize: number;
  color: number;
}

function cookieHeader(cookies: Record<string, string>): string {
  return Object.entries(cookies)
    .map(([k, v]) => `${k}=${v}`)
    .join('; ');
}

async function fetchSegment(cid: number, index: number, cookies: Record<string, string>): Promise<DanmakuElem[]> {
  await globalLimiter.wait();
  const url = `https://api.bilibili.com/x/v2/dm/web/seg.so?type=1&oid=${cid}&segment_index=${index}`;
  const res = await httpFetch(url, {
    headers: { 'User-Agent': UA, Referer: WEB_REFERER, Cookie: cookieHeader(cookies) },
  });
  if (!res.ok) throw new Error(`弹幕段 ${index} 请求失败：HTTP ${res.status}`);
  const buf = new Uint8Array(await res.arrayBuffer());
  if (buf.length <= 40) return [];
  return parseDanmakuSegment(buf);
}

/** 拉取全部分段弹幕（去重 + 排序） */
export async function fetchDanmaku(
  cid: number,
  cookies: Record<string, string>,
  opts: { maxSegments?: number; concurrency?: number } = {},
): Promise<DanmakuItem[]> {
  const maxSegments = opts.maxSegments ?? 60;
  const concurrency = opts.concurrency ?? 3;
  const seen = new Set<string>();
  const out: DanmakuItem[] = [];

  for (let batch = 1; batch <= maxSegments; batch += concurrency) {
    const indexes = Array.from({ length: concurrency }, (_, i) => batch + i).filter((i) => i <= maxSegments);
    const results = await Promise.all(indexes.map((i) => fetchSegment(cid, i, cookies).catch(() => [] as DanmakuElem[])));
    const empty = results.every((r) => r.length === 0);
    for (const list of results) {
      for (const e of list) {
        const key = `${e.progress}|${e.content}|${e.id ?? ''}`;
        if (seen.has(key)) continue;
        seen.add(key);
        const text = (e.content ?? '').trim();
        if (!text) continue;
        out.push({
          time: (e.progress ?? 0) / 1000,
          text,
          mode: e.mode ?? 1,
          fontSize: e.fontsize ?? 25,
          color: e.color ?? 0xffffff,
        });
      }
    }
    if (empty) break;
  }

  return out.sort((a, b) => a.time - b.time);
}

export { SEGMENT_DURATION_SEC };
