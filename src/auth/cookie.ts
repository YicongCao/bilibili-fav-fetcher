import { chmod600, pathExists, readJson, writeJsonAtomic } from '../utils/fsx.js';

export const COOKIE_SCHEMA = 'bili-dl/cookie@1';
/** 开发/使用期的登录态存放位置（已在 .gitignore 中） */
export const DEFAULT_COOKIE_FILE = '.local/cookies.json';

export interface CookieFile {
  schema: string;
  mid?: number;
  uname?: string;
  cookies: Record<string, string>;
  refreshToken?: string;
  savedAt: number;
  /** SESSDATA 过期时间（ms，取自登录 url 的 Expires 参数，单位秒） */
  expiresAt?: number;
}

export const REQUIRED_COOKIE_KEYS = ['SESSDATA', 'bili_jct', 'DedeUserID'] as const;

export async function loadCookieFile(file: string): Promise<CookieFile | null> {
  if (!(await pathExists(file))) return null;
  return readJson<CookieFile>(file);
}

export async function saveCookieFile(file: string, data: CookieFile): Promise<void> {
  await writeJsonAtomic(file, data);
  await chmod600(file);
}

export function hasRequiredCookies(cookies: Record<string, string>): boolean {
  return REQUIRED_COOKIE_KEYS.every((k) => Boolean(cookies[k]));
}

/** 解析 "a=b; c=d" 形式的整串 cookie */
export function parseCookieString(text: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const part of text.split(';')) {
    const idx = part.indexOf('=');
    if (idx <= 0) continue;
    const k = part.slice(0, idx).trim();
    const v = part.slice(idx + 1).trim();
    if (k) out[k] = v;
  }
  return out;
}

/** 解析 Netscape cookies.txt */
export function parseNetscapeCookies(text: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const raw of text.split('\n')) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const fields = line.split('\t').length >= 7 ? line.split('\t') : line.split(/\s+/);
    if (fields.length < 7) continue;
    const [domain, , , , , name, value] = fields;
    if (!domain.includes('bilibili.com')) continue;
    if (name && value) out[name] = value;
  }
  return out;
}

/** 解析 Cookie-Editor 导出的 JSON 数组 */
export function parseCookieEditorJson(text: string): Record<string, string> {
  const parsed = JSON.parse(text) as Array<{ name?: string; value?: string }>;
  const out: Record<string, string> = {};
  for (const item of parsed) {
    if (item?.name && item?.value) out[item.name] = item.value;
  }
  return out;
}

/** 从响应 Set-Cookie 头中提取键值对 */
export function extractSetCookies(res: Response | { headers: Headers }): Record<string, string> {
  const out: Record<string, string> = {};
  const headers: Headers = res.headers;
  const rawList = typeof headers.getSetCookie === 'function' ? headers.getSetCookie() : [];
  for (const raw of rawList) {
    const [pair] = raw.split(';');
    const idx = pair.indexOf('=');
    if (idx <= 0) continue;
    out[pair.slice(0, idx).trim()] = pair.slice(idx + 1).trim();
  }
  return out;
}

export function expiresInDays(expiresAt?: number): number | null {
  if (!expiresAt) return null;
  return Math.max(0, Math.ceil((expiresAt - Date.now()) / 86_400_000));
}
