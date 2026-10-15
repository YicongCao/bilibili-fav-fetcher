import qrcode from 'qrcode-terminal';
import { extractSetCookies } from './cookie.js';
import { fetchFingerprint } from './fingerprint.js';
import { requestJson } from '../utils/http.js';
import { UA } from '../api/client.js';

const PASSPORT_BASE = 'https://passport.bilibili.com';

interface QrGenerate {
  code: number;
  data: { url: string; qrcode_key: string };
}

interface QrPoll {
  code: number;
  message: string;
  data?: {
    url?: string;
    refresh_token?: string;
    /** 0 成功 / 86038 已失效 / 86090 已扫码未确认 / 86101 未扫码 */
    code?: number;
  };
}

export interface QrLoginResult {
  cookies: Record<string, string>;
  refreshToken?: string;
  expiresAt?: number;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function generate(): Promise<{ url: string; qrcodeKey: string }> {
  const { json } = await requestJson<QrGenerate>(`${PASSPORT_BASE}/x/passport-login/web/qrcode/generate`, {
    timeoutMs: 10_000,
    headers: { 'User-Agent': UA, Referer: 'https://passport.bilibili.com/' },
  });
  if (json.code !== 0) throw new Error(`获取二维码失败：${json.code}`);
  return { url: json.data.url, qrcodeKey: json.data.qrcode_key };
}

/** 从 crossDomain 跳转链接的 query 中提取登录 cookie */
function cookiesFromLoginUrl(url: string): { cookies: Record<string, string>; expiresAt?: number } {
  const u = new URL(url);
  const cookies: Record<string, string> = {};
  for (const key of ['DedeUserID', 'DedeUserID__ckMd5', 'SESSDATA', 'bili_jct', 'sid']) {
    const v = u.searchParams.get(key);
    if (v) cookies[key] = v;
  }
  const expires = u.searchParams.get('Expires');
  return { cookies, expiresAt: expires ? Number(expires) * 1000 : undefined };
}

export async function qrLogin(opts: { timeoutMs?: number } = {}): Promise<QrLoginResult> {
  const timeoutMs = opts.timeoutMs ?? 180_000;
  const { url, qrcodeKey } = await generate();
  const { buvid3, buvid4 } = await fetchFingerprint();

  process.stdout.write('\n请使用哔哩哔哩手机 App 扫描下方二维码：\n\n');
  qrcode.generate(url, { small: true });
  process.stdout.write('\n');

  const deadline = Date.now() + timeoutMs;
  let lastTip = '';
  while (Date.now() < deadline) {
    const { json, headers } = await requestJson<QrPoll>(
      `${PASSPORT_BASE}/x/passport-login/web/qrcode/poll?qrcode_key=${encodeURIComponent(qrcodeKey)}`,
      {
        timeoutMs: 10_000,
        retries: 1,
        cookies: { buvid3, ...(buvid4 ? { buvid4 } : {}) },
        headers: { 'User-Agent': UA, Referer: 'https://passport.bilibili.com/' },
      },
    );

    const status = json.data?.code ?? json.code;
    if (status === 0 && json.data?.url) {
      const { cookies, expiresAt } = cookiesFromLoginUrl(json.data.url);
      const setCookies = extractSetCookies({ headers });
      const merged: Record<string, string> = { buvid3, ...(buvid4 ? { buvid4 } : {}), ...cookies, ...setCookies };
      Object.keys(merged).forEach((k) => {
        if (!merged[k]) delete merged[k];
      });
      return { cookies: merged, refreshToken: json.data.refresh_token, expiresAt };
    }

    const tip =
      status === 86101 ? '等待扫码…' : status === 86090 ? '已扫码，请在手机上确认…' : `未成功（${status}）`;
    if (tip !== lastTip) {
      process.stdout.write(`${tip}\n`);
      lastTip = tip;
    }
    if (status === 86038) {
      await sleep(300);
      const next = await generate();
      process.stdout.write('\n二维码已刷新，请重新扫描：\n\n');
      qrcode.generate(next.url, { small: true });
      // 更新 qrcodeKey 继续轮询
      return qrLogin({ timeoutMs: deadline - Date.now() });
    }
    await sleep(1500);
  }
  throw new Error('扫码登录超时，请重新执行 bili login --qr');
}
