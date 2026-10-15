import { Agent, fetch as undiciFetch, type Dispatcher, type RequestInit as UndiciRequestInit } from 'undici';

/**
 * 统一的网络出口：
 * - connect timeout 20s（B 站部分 CDN 节点建连较慢，默认 10s 会误判）
 * - headers timeout 15s；body 无总超时（由调用方的空闲停滞检测负责）
 */
export const httpAgent = new Agent({
  connect: { timeout: 20_000 },
  headersTimeout: 15_000,
  bodyTimeout: 0,
});

export function httpFetch(url: string, init: UndiciRequestInit = {}): Promise<Response> {
  const dispatcher = (init as { dispatcher?: Dispatcher }).dispatcher ?? httpAgent;
  return undiciFetch(url, { ...init, dispatcher }) as unknown as Promise<Response>;
}
