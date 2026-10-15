import { DEFAULT_COOKIE_FILE, expiresInDays, loadCookieFile } from '../../auth/cookie.js';
import { nav } from '../../api/nav.js';
import { log } from '../../utils/logger.js';

export async function whoamiCommand(options: { cookieFile?: string }): Promise<void> {
  const cookieFile = options.cookieFile ?? DEFAULT_COOKIE_FILE;
  const store = await loadCookieFile(cookieFile);
  if (!store) {
    log.error(`未找到登录态（${cookieFile}），请先执行：npm run bili -- login --qr`);
    process.exitCode = 1;
    return;
  }
  const info = await nav(store.cookies);
  if (!info.isLogin) {
    log.error('登录态已失效，请重新执行：npm run bili -- login --qr');
    process.exitCode = 1;
    return;
  }
  const days = expiresInDays(store.expiresAt);
  const vip = info.vip?.type === 2 ? '大会员' : info.vip?.type === 1 ? '普通会员' : '非会员';
  log.print(`用户：${info.uname}（mid=${info.mid}）`);
  log.print(`等级：Lv${info.level_info?.current_level ?? '-'}    会员：${vip}`);
  log.print(`登录态：有效${days === null ? '' : `，约剩余 ${days} 天`}`);
  log.print(`保存时间：${new Date(store.savedAt).toLocaleString('zh-CN')}`);
}
