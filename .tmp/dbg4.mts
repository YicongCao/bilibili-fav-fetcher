import { loadCookieFile } from '../src/auth/cookie.js';
import { nav } from '../src/api/nav.js';
import { apiGet } from '../src/api/client.js';

const store = await loadCookieFile('.local/cookies.json');
const me = await nav(store.cookies!);
const data = await apiGet<any>('/x/v3/fav/folder/created/list-all', { up_mid: me.mid, jsonp: 'jsonp', platform: 'web' }, { cookies: store.cookies, signed: true });
console.log('my mid:', me.mid);
for (const f of (data.list ?? []).slice(0, 5)) console.log(JSON.stringify({ id: f.id, fid: f.fid, mid: f.mid, title: f.title, media_count: f.media_count, attr: f.attr }));

// 用 id 试
for (const f of (data.list ?? []).slice(0, 3)) {
  for (const key of ['id', 'fid']) {
    const mid = f[key];
    const r = await apiGet<any>('/x/v3/fav/resource/list', { media_id: mid, pn: 1, ps: 20, order: 'mtime', platform: 'web' }, { cookies: store.cookies, signed: true });
    console.log(`${f.title} media_id=${key}=${mid} => medias ${r.medias?.length ?? 0} | info.title=${r.info?.title} | info.mid=${r.info?.mid}`);
  }
}
