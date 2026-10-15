import { loadCookieFile } from '../src/auth/cookie.js';
import { nav } from '../src/api/nav.js';
import { listCreatedFolders, listFolderResources } from '../src/api/favorite.js';

const store = await loadCookieFile('.local/cookies.json');
const me = await nav(store.cookies!);
const folders = await listCreatedFolders(store.cookies!, me.mid);
for (const f of folders.slice(0, 4)) {
  const medias = await listFolderResources(store.cookies!, f.fid, { order: 'mtime' });
  console.log(`${f.title}(${f.fid}) media_count=${f.mediaCount} fetched=${medias.length}`);
  if (medias.length) console.log('  sample keys:', Object.keys(medias[0]).join(','), '| title:', medias[0].title, '| type:', medias[0].type, '| bvid:', medias[0].bvid ?? medias[0].bv_id);
}
