import { createInterface } from 'node:readline';
import {
  COOKIE_SCHEMA,
  DEFAULT_COOKIE_FILE,
  type CookieFile,
  hasRequiredCookies,
  loadCookieFile,
  parseCookieEditorJson,
  parseCookieString,
  parseNetscapeCookies,
  saveCookieFile,
} from '../../auth/cookie.js';
import { qrLogin } from '../../auth/qrlogin.js';
import { fetchFingerprint } from '../../auth/fingerprint.js';
import { nav } from '../../api/nav.js';
import { log } from '../../utils/logger.js';
import { readFile } from 'node:fs/promises';

function question(prompt: string): Promise<string> {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => rl.question(prompt, (answer) => {
    rl.close();
    resolve(answer.trim());
  }));
}

async function askManual(): Promise<Record<string, string>> {
  log.print('请从浏览器 DevTools → Application → Cookies → https://www.bilibili.com 中复制：');
  const raw = await question('直接粘贴整串 Cookie（a=b; c=d）或输入 SESSDATA：');
  const cookies = parseCookieString(raw);
  if (!cookies.SESSDATA) throw new Error('未解析到 SESSDATA');
  if (!cookies.bili_jct) cookies.bili_jct = await question('bili_jct（CSRF）：');
  if (!cookies.DedeUserID) cookies.DedeUserID = await question('DedeUserID（用户 mid）：');
  return cookies;
}

async function importFromFile(file: string): Promise<Record<string, string>> {
  const text = await readFile(file, 'utf8');
  if (text.trimStart().startsWith('[') || text.trimStart().startsWith('{')) {
    return parseCookieEditorJson(text);
  }
  const parsed = text.includes('\t') ? parseNetscapeCookies(text) : parseCookieString(text);
  if (!parsed.SESSDATA) throw new Error(`未在 ${file} 中找到 SESSDATA`);
  return parsed;
}

export async function loginCommand(options: { qr?: boolean; manual?: boolean; import?: string; cookieFile?: string }): Promise<void> {
  const cookieFile = options.cookieFile ?? DEFAULT_COOKIE_FILE;
  const existing = await loadCookieFile(cookieFile);
  if (existing && hasRequiredCookies(existing.cookies)) {
    log.info(`已存在登录态（${cookieFile}），将被覆盖`);
  }

  let cookies: Record<string, string>;
  let refreshToken: string | undefined;
  let expiresAt: number | undefined;

  if (options.import) {
    cookies = await importFromFile(options.import);
  } else if (options.manual) {
    cookies = await askManual();
  } else {
    const result = await qrLogin();
    cookies = result.cookies;
    refreshToken = result.refreshToken;
    expiresAt = result.expiresAt;
  }

  // 补齐设备指纹与固定 cookie
  if (!cookies.buvid3) {
    const fp = await fetchFingerprint();
    cookies.buvid3 = fp.buvid3;
    if (fp.buvid4) cookies.buvid4 = fp.buvid4;
  }
  cookies.b_nut = String(Date.now());
  cookies.CURRENT_FNVAL = '4048';

  const info = await nav(cookies);
  if (!info.isLogin) throw new Error('登录态校验失败：B 站返回未登录，请重试');

  const data: CookieFile = {
    schema: COOKIE_SCHEMA,
    mid: info.mid,
    uname: info.uname,
    cookies,
    refreshToken,
    savedAt: Date.now(),
    expiresAt,
  };
  await saveCookieFile(cookieFile, data);

  log.print('');
  log.print(`登录成功：${info.uname}（mid=${info.mid}）`);
  log.print(`登录态已保存到 ${cookieFile}（权限 0600，已 gitignore）`);
  log.print(`WBI 密钥已初始化，后续阶段可直接使用。`);
}
