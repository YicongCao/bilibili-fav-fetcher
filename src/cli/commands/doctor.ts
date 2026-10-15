import { execFileSync } from 'node:child_process';
import { statfs } from 'node:fs/promises';
import { DEFAULT_COOKIE_FILE, hasRequiredCookies, loadCookieFile } from '../../auth/cookie.js';
import { nav } from '../../api/nav.js';
import { log } from '../../utils/logger.js';
import { formatBytes } from '../../utils/fsx.js';

function detectFfmpeg(): string {
  try {
    const out = execFileSync('ffmpeg', ['-version'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
    return (out.split('\n')[0] ?? 'ffmpeg').trim();
  } catch {
    return '';
  }
}

export async function doctorCommand(options: { cookieFile?: string }): Promise<void> {
  const cookieFile = options.cookieFile ?? DEFAULT_COOKIE_FILE;

  log.print('环境自检');
  log.print('--------');
  log.print(`Node      : ${process.version}（要求 >= 20）`);

  const ffmpeg = detectFfmpeg();
  log.print(`ffmpeg    : ${ffmpeg || '未安装（后续阶段会自动下载 ffmpeg-static，或执行 brew install ffmpeg）'}`);

  const store = await loadCookieFile(cookieFile);
  if (!store || !hasRequiredCookies(store.cookies ?? {})) {
    log.print(`登录态    : 未找到（${cookieFile}），执行 npm run bili -- login --qr`);
  } else {
    try {
      const info = await nav(store.cookies);
      log.print(`登录态    : 有效，${info.uname}（mid=${info.mid}）`);
    } catch (err) {
      log.print(`登录态    : 无效 —— ${(err as Error).message}`);
    }
  }

  try {
    const s = await statfs(process.cwd());
    const free = Number(s.bavail) * Number(s.bsize);
    log.print(`磁盘剩余  : ${formatBytes(free)}`);
  } catch {
    log.print('磁盘剩余  : 读取失败');
  }

  try {
    await nav(store?.cookies ?? {});
    log.print('接口连通  : 正常');
  } catch (err) {
    log.print(`接口连通  : 异常 —— ${(err as Error).message}`);
  }
  log.print('--------');
}
