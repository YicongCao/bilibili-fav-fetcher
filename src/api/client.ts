import { getMixinKey, signQuery } from '../auth/wbi.js';
import { requestJson } from '../utils/http.js';

export const API_BASE = 'https://api.bilibili.com';
export const UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';
export const WEB_REFERER = 'https://www.bilibili.com/';

export class BizError extends Error {
  constructor(
    readonly code: number,
    message: string,
  ) {
    super(`B站接口错误 ${code}: ${message}`);
    this.name = 'BizError';
  }
}

export function isAuthError(err: unknown): boolean {
  return err instanceof BizError && err.code === -101;
}

export interface ApiOptions {
  cookies?: Record<string, string>;
  /** 是否需要 WBI 签名（收藏夹/空间/playurl 等接口必须） */
  signed?: boolean;
  timeoutMs?: number;
  retries?: number;
  referer?: string;
  headers?: Record<string, string>;
}

interface BiliResponse<T> {
  code: number;
  message: string;
  data: T;
}

/** 统一 GET：注入 UA/Referer/Cookie，必要时做 WBI 签名，并映射业务错误码 */
export async function apiGet<T>(
  apiPath: string,
  params: Record<string, string | number> = {},
  opts: ApiOptions = {},
): Promise<T> {
  let query = new URLSearchParams(
    Object.entries(params).map(([k, v]): [string, string] => [k, String(v)]),
  ).toString();

  if (opts.signed) {
    const mixinKey = await getMixinKey();
    if (!mixinKey) throw new BizError(-1, 'WBI 密钥未初始化，请先调用 nav()');
    query = signQuery(params, mixinKey);
  }

  const url = `${API_BASE}${apiPath}${query ? `?${query}` : ''}`;
  const { json } = await requestJson<BiliResponse<T>>(url, {
    method: 'GET',
    cookies: opts.cookies,
    timeoutMs: opts.timeoutMs ?? 10_000,
    retries: opts.retries ?? 2,
    headers: {
      'User-Agent': UA,
      Referer: opts.referer ?? WEB_REFERER,
      Origin: 'https://www.bilibili.com',
      ...opts.headers,
    },
  });

  if (json.code !== 0) throw new BizError(json.code, json.message || '未知错误');
  return json.data;
}
