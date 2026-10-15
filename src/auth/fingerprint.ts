import { randomUUID } from 'node:crypto';
import { requestJson } from '../utils/http.js';

/** 本地兜底生成 buvid3（UUID + 时间戳 的 B 站格式） */
export function randomBuvid3(): string {
  const uuid = randomUUID().toUpperCase();
  return `${uuid}${Math.floor(Date.now() / 1000).toString(16)}infoc`;
}

/**
 * 向 B 站申请设备指纹 buvid3 / buvid4。
 * 失败时回退到本地随机生成（B 站只在校验严格时要求真实 spi）。
 */
export async function fetchFingerprint(): Promise<{ buvid3: string; buvid4?: string }> {
  try {
    const { json } = await requestJson<{ code: number; data?: { b_3?: string; b_4?: string } }>(
      'https://api.bilibili.com/x/frontend/finger/spi',
      { method: 'POST', timeoutMs: 8000, retries: 1, referer: 'https://www.bilibili.com/' },
    );
    if (json.code === 0 && json.data?.b_3) {
      return { buvid3: json.data.b_3, buvid4: json.data.b_4 };
    }
  } catch {
    /* 忽略，走兜底 */
  }
  return { buvid3: randomBuvid3() };
}
