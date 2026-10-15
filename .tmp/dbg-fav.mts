import { loadCookieFile } from '../src/auth/cookie.js';
import { nav } from '../src/api/nav.js';
import { listCreatedFolders } from '../src/api/favorite.js';
import { getMixinKey, signQuery } from '../src/auth/wbi.js';
import { requestJson } from '../src/utils/http.js';
import { UA } from '../src/api/client.js';

const store = await loadCookieFile('.local/cookies.json');
const me = await nav(store.cookies!);
const folders = await listCreatedFolders(store.cookies!, me.mid);
const fid = folders[0].fid;
console.log('first folder', folders[0]);
const mk = await getMixinKey();
for (const variant of [
  { media_id: fid, pn: 1, ps: 20, keyword: '', order: 'mtime', type: 0, tid: 0, platform: 'web', jsonp: 'jsonp' },
  { media_id: fid, pn: 1, ps: 20, keyword: '', order: 'mtime', type: 2, tid: 0, platform: 'web', jsonp: 'jsonp' },
]) {
  const q = signQuery(variant, mk!);
  const url = `https://api.bilibili.com/x/v3/fav/resource/list?${q}`;
  const { json } = await requestJson<any>(url, { cookies: store.cookies, headers: { 'User-Agent': UA, Referer: 'https://www.bilibili.com/' } });
  console.log(JSON.stringify(variant), '=> code', json.code, 'msg', json.message, 'keys', Object.keys(json.data ?? {}), 'medias', json.data?.medias?.length ?? 0, 'has_more', json.data?.has_more);
}
