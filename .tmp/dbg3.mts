import { loadCookieFile } from '../src/auth/cookie.js';
import { requestJson } from '../src/utils/http.js';
import { UA } from '../src/api/client.js';

const store = await loadCookieFile('.local/cookies.json');
const fid = 16283573;
const variants: Record<string, string>[] = [
  { media_id: String(fid), pn: '1', ps: '20', keyword: '', order: 'mtime', type: '0', tid: '0', platform: 'web' },
  { media_id: String(fid), pn: '1', ps: '20', keyword: '', order: 'mtime', type: '0', tid: '0' },
  { media_id: String(fid), pn: '1', ps: '20', keyword: '', order: 'mtime' },
  { media_id: String(fid), pn: '1', ps: '20' },
  { fid: String(fid), pn: '1', ps: '20', order: 'mtime' },
];
for (const v of variants) {
  const qs = new URLSearchParams(v).toString();
  const url = `https://api.bilibili.com/x/v3/fav/resource/list?${qs}`;
  const { json } = await requestJson<any>(url, { cookies: store.cookies, headers: { 'User-Agent': UA, Referer: 'https://www.bilibili.com/' } });
  console.log(qs, '=> code', json.code, json.message, '| medias', json.data?.medias?.length ?? 0, '| info', JSON.stringify(json.data?.info ?? {}).slice(0, 160));
}
