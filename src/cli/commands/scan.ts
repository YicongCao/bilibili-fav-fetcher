import { DEFAULT_COOKIE_FILE, loadCookieFile } from '../../auth/cookie.js';
import { loadConfig } from '../../config.js';
import { scan } from '../../core/scanner.js';
import { log } from '../../utils/logger.js';

export async function scanCommand(
  options: { fav?: string; includeCollected?: boolean; cookieFile?: string; full?: boolean } = {},
): Promise<void> {
  await loadConfig();
  const cookieFile = options.cookieFile ?? DEFAULT_COOKIE_FILE;
  const store = await loadCookieFile(cookieFile);
  if (!store) {
    log.error(`未找到登录态（${cookieFile}），请先执行：npm run bili -- login --qr`);
    process.exitCode = 1;
    return;
  }

  const folderIds = options.fav
    ? options.fav
        .split(',')
        .map((s) => Number(s.trim()))
        .filter((n) => Number.isFinite(n))
    : undefined;

  const result = await scan(store.cookies, {
    folders: folderIds,
    includeCollected: options.includeCollected,
    full: options.full,
  });
  log.print('');
  log.print(`扫描方式：${result.incremental ? `增量（新增 ${result.added}）` : '全量'}`);
  log.print(`收藏夹数：${result.index.folders.length}`);
  log.print(`视频总数：${result.index.videos.length}`);
  log.print(`多 P 稿件：${result.index.videos.filter((v) => (v.pages?.length ?? 0) > 1).length}（分 P 列表在下载规划时展开）`);
  log.print(`已写出：${result.root}/index.json、favorites.json`);
}
