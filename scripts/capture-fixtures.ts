/** 抓取真实接口响应样本，存到 tests/fixtures/，供离线契约测试使用（不含任何凭据） */
import { writeFileSync } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { viewDetail } from '../src/api/view.js';
import { playurl } from '../src/api/playurl.js';
import { DEFAULT_COOKIE_FILE, loadCookieFile } from '../src/auth/cookie.js';
import { log } from '../src/utils/logger.js';

const OUT = path.resolve('tests/fixtures');

async function main(): Promise<void> {
  const bvid = process.argv[2] ?? 'BV1v8aS6mEFb';
  const store = await loadCookieFile(DEFAULT_COOKIE_FILE);
  if (!store?.cookies) {
    log.error(`未找到登录态（${DEFAULT_COOKIE_FILE}），先执行 bili login`);
    process.exitCode = 1;
    return;
  }
  await mkdir(OUT, { recursive: true });

  const view = await viewDetail(store.cookies, bvid);
  writeFileSync(path.join(OUT, 'view.json'), `${JSON.stringify({ bvid, data: view }, null, 2)}\n`, 'utf8');

  const cid = view.pages[0]?.cid ?? 0;
  const play = await playurl(store.cookies, bvid, cid);
  // 只保留前若干条流，并把签名 URL 换成占位地址（不落任何可用链接，结构字段完整）
  const STUB = 'https://fixture.invalid/stream.m4s';
  const trimmed = {
    ...play,
    dash: play.dash
      ? {
          duration: play.dash.duration,
          video: (play.dash.video ?? []).slice(0, 12).map((s) => ({ ...s, baseUrl: STUB, base_url: STUB })),
          audio: (play.dash.audio ?? []).slice(0, 4).map((s) => ({ ...s, baseUrl: STUB, base_url: STUB })),
        }
      : undefined,
    durl: play.durl ? play.durl.slice(0, 2).map((d) => ({ ...d, url: STUB, backup_url: [] })) : undefined,
  };
  writeFileSync(path.join(OUT, 'playurl.json'), `${JSON.stringify({ bvid, cid, data: trimmed }, null, 2)}\n`, 'utf8');

  log.print(`已写入 fixtures：view.json（${view.pages.length} 个分 P）、playurl.json（${trimmed.dash?.video.length ?? 0} 条视频流）`);
}

void main();
