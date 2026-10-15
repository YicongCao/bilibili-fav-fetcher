import { setWbiKeys } from '../auth/wbi.js';
import { apiGet } from './client.js';

export interface NavData {
  isLogin: boolean;
  mid: number;
  uname: string;
  face: string;
  level_info?: { current_level: number };
  vip?: { type: number; status: number; label?: { text?: string } };
  wbi_img?: { img_url: string; sub_url: string };
  money?: number;
}

/** 会话校验 + 拉取 WBI 密钥（任何需要登录/WBI 的流程都先调它） */
export async function nav(cookies: Record<string, string>): Promise<NavData> {
  const data = await apiGet<NavData>('/x/web-interface/nav', {}, { cookies, timeoutMs: 12_000 });
  if (data.wbi_img?.img_url && data.wbi_img?.sub_url) {
    setWbiKeys(data.wbi_img.img_url, data.wbi_img.sub_url);
  }
  return data;
}

export async function requireLogin(cookies: Record<string, string>): Promise<NavData> {
  const data = await nav(cookies);
  if (!data.isLogin) throw new Error('登录态无效或已过期（-101），请重新执行 bili login');
  return data;
}
