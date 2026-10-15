import { createHash } from 'node:crypto';
import { readJson, writeJsonAtomic } from '../utils/fsx.js';

/** WBI 签名用的固定乱序表（64 位） */
const MIXIN_KEY_ENC_TAB = [
  46, 47, 18, 2, 53, 8, 23, 32, 15, 50, 10, 31, 58, 3, 45, 35, 27, 43, 5, 49, 33, 9, 42, 19, 29, 28, 14, 39, 12, 38,
  41, 13, 37, 48, 7, 16, 24, 55, 40, 61, 26, 17, 0, 1, 60, 51, 30, 4, 22, 25, 54, 21, 56, 59, 6, 63, 57, 62, 11, 36,
  20, 34, 44, 52,
];

const CACHE_FILE = 'state/wbi.json';
const KEY_TTL_MS = 20 * 60 * 60 * 1000; // img_key 每日轮换，这里保守缓存 20h

interface WbiCache {
  imgKey: string;
  subKey: string;
  mixinKey: string;
  fetchedAt: number;
}

function md5(text: string): string {
  return createHash('md5').update(text).digest('hex');
}

function baseName(url: string): string {
  const file = url.split('/').pop() ?? '';
  return file.replace(/\.[a-zA-Z]+$/, '');
}

export function buildMixinKey(imgKey: string, subKey: string): string {
  const raw = `${imgKey}${subKey}`;
  return MIXIN_KEY_ENC_TAB.map((i) => raw[i]).join('').slice(0, 32);
}

let memoryCache: WbiCache | null = null;

export function setWbiKeys(imgUrl: string, subUrl: string): string {
  const imgKey = baseName(imgUrl);
  const subKey = baseName(subUrl);
  const mixinKey = buildMixinKey(imgKey, subKey);
  memoryCache = { imgKey, subKey, mixinKey, fetchedAt: Date.now() };
  void writeJsonAtomic(CACHE_FILE, memoryCache).catch(() => undefined);
  return mixinKey;
}

export async function getMixinKey(): Promise<string | null> {
  if (memoryCache && Date.now() - memoryCache.fetchedAt < KEY_TTL_MS) return memoryCache.mixinKey;
  const cached = await readJson<WbiCache>(CACHE_FILE);
  if (cached && Date.now() - cached.fetchedAt < KEY_TTL_MS) {
    memoryCache = cached;
    return cached.mixinKey;
  }
  return null;
}

/** 过滤需要转义的字符后做 URL 编码（与 B 站一致） */
function encodeValue(value: string): string {
  return encodeURIComponent(value.replace(/[!'()*]/g, ''));
}

/** 给参数加上 wts 与 w_rid，返回可直接拼接的 query 字符串 */
export function signQuery(params: Record<string, string | number>, mixinKey: string): string {
  const signed: Record<string, string | number> = { ...params, wts: Math.floor(Date.now() / 1000) };
  const keys = Object.keys(signed).sort();
  const query = keys.map((k) => `${encodeValue(k)}=${encodeValue(String(signed[k]))}`).join('&');
  const wRid = md5(`${query}${mixinKey}`);
  return `${query}&w_rid=${wRid}`;
}
