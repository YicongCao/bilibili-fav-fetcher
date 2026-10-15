export interface RequestOptions {
  method?: 'GET' | 'POST';
  headers?: Record<string, string>;
  /** cookie 键值对，自动拼成 Cookie 头 */
  cookies?: Record<string, string>;
  body?: URLSearchParams | string;
  timeoutMs?: number;
  retries?: number;
  referer?: string;
}

export class HttpError extends Error {
  constructor(
    message: string,
    readonly status?: number,
    readonly body?: string,
  ) {
    super(message);
    this.name = 'HttpError';
  }
}

export function cookieHeader(cookies: Record<string, string>): string {
  return Object.entries(cookies)
    .filter(([, v]) => v !== undefined && v !== '')
    .map(([k, v]) => `${k}=${v}`)
    .join('; ');
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * 请求 JSON 接口，带超时与指数退避重试。
 * 只处理传输层错误，业务错误码由调用方（api/client.ts）判定。
 */
export async function requestJson<T = unknown>(
  url: string,
  opts: RequestOptions = {},
): Promise<{ json: T; headers: Headers }> {
  const { method = 'GET', headers = {}, cookies, body, timeoutMs = 10_000, retries = 2 } = opts;

  let lastErr: unknown;
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      const res = await fetch(url, {
        method,
        headers: {
          Accept: 'application/json, text/plain, */*',
          'Accept-Language': 'zh-CN,zh;q=0.9',
          ...(cookies && Object.keys(cookies).length ? { Cookie: cookieHeader(cookies) } : {}),
          ...headers,
        },
        body,
        redirect: 'follow',
        signal: AbortSignal.timeout(timeoutMs),
      });

      if (!res.ok) {
        throw new HttpError(`HTTP ${res.status} ${res.statusText}`, res.status, await res.text());
      }
      const json = (await res.json()) as T;
      return { json, headers: res.headers };
    } catch (err) {
      lastErr = err;
      const isAbort = err instanceof Error && (err.name === 'TimeoutError' || err.name === 'AbortError');
      if (attempt === retries) break;
      await sleep(Math.min(1000 * 2 ** attempt, 8000));
      if (isAbort) continue;
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error(String(lastErr));
}
