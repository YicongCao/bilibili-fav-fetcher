import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { readFile, rm, stat } from 'node:fs/promises';
import path from 'node:path';
import { renderControlPage } from '../web/controlPage.js';
import { renderLibraryPage } from '../web/libraryPage.js';
import { safeJoin, sendFile } from './static.js';
import { bus, toSummary, type ServerEvent } from './events.js';
import { getConfig, setConfig, type Config } from '../config.js';
import { log } from '../utils/logger.js';
import { formatBytes } from '../utils/fsx.js';
import { nav } from '../api/nav.js';
import { expiresInDays } from '../auth/cookie.js';
import { outputUsage, invalidateUsage } from '../core/disk.js';
import { cleanAllCache, cleanDoneCache } from '../core/cache.js';
import { enqueueFavorites, enqueueUp, listFolders, refreshFavorites, type EnqueueCtx } from '../core/enqueue.js';
import { buildLibrary, scanLibrary } from '../library/scanLibrary.js';
import { markDeleted, restoreDeleted, type DeletedEntry } from '../core/deleted.js';
import { isMuxPaused, setMuxPaused } from '../core/muxGate.js';
import type { TaskStore } from '../core/taskStore.js';
import type { DownloadQueue } from '../core/queue.js';
import type { TaskRecord } from '../types/index.js';

export interface ServerContext {
  store: TaskStore;
  queue: DownloadQueue;
  root: string;
  /** 登录态（用于展示登录/会员状态），缺失时 dashboard 显示未登录 */
  cookies?: Record<string, string>;
  cookieExpiresAt?: number | null;
}

interface AuthSnapshot {
  login: boolean;
  uname?: string;
  mid?: number;
  vip?: string;
  level?: number;
  days?: number | null;
  checkedAt: number;
}

let authCache: AuthSnapshot = { login: false, checkedAt: 0 };

/** 刷新登录态快照（5 分钟内复用，失败保留上次结果） */
async function refreshAuth(ctx: ServerContext): Promise<AuthSnapshot> {
  if (!ctx.cookies || Object.keys(ctx.cookies).length === 0) return { login: false, checkedAt: Date.now() };
  try {
    const info = await nav(ctx.cookies);
    const vip = info.vip?.type === 2 ? '大会员' : info.vip?.type === 1 ? '会员' : '非会员';
    authCache = {
      login: Boolean(info.isLogin),
      uname: info.uname,
      mid: info.mid,
      vip,
      level: info.level_info?.current_level,
      days: expiresInDays(ctx.cookieExpiresAt ?? undefined),
      checkedAt: Date.now(),
    };
  } catch (err) {
    log.debug(`登录态刷新失败：${(err as Error).message}`);
    authCache = { ...authCache, checkedAt: Date.now() };
  }
  return authCache;
}

function json(res: ServerResponse, data: unknown, code = 200): void {
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(data));
}

async function body(req: IncomingMessage): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = [];
  for await (const c of req) chunks.push(c as Buffer);
  if (!chunks.length) return {};
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8')) as Record<string, unknown>;
  } catch {
    return {};
  }
}

/** 启动控制端：REST + SSE 实时推送 + 静态媒体库 */
export async function startServer(ctx: ServerContext): Promise<{ url: string; close: () => void }> {
  const config = getConfig();
  const sseClients = new Set<ServerResponse>();

  const unsubscribe = bus.on((event: ServerEvent) => {
    const payload = `data: ${JSON.stringify(event)}\n\n`;
    for (const res of sseClients) {
      res.write(payload);
    }
  });

  /** 入队类接口的公共上下文（需要登录态） */
  const enqueueCtx = (): EnqueueCtx => {
    if (!ctx.cookies || Object.keys(ctx.cookies).length === 0) {
      throw new Error('控制端未拿到登录态，请先 bili login 后重启 bili web');
    }
    return { cookies: ctx.cookies, store: ctx.store, queue: ctx.queue, root: ctx.root };
  };

  const server = createServer(async (req, res) => {
    const url = new URL(req.url ?? '/', `http://${req.headers.host ?? '127.0.0.1'}`);
    const route = url.pathname;

    // SSE 事件流
    if (route === '/api/events') {
      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
      });
      res.write('data: {"t":"hello"}\n\n');
      sseClients.add(res);
      req.on('close', () => sseClients.delete(res));
      return;
    }

    if (route === '/' || route === '/control') {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(renderControlPage());
      return;
    }

    if (route === '/api/tasks') {
      const limit = Number(url.searchParams.get('limit') ?? 200);
      const list = ctx.store
        .all()
        .sort((a, b) => rank(a) - rank(b))
        .slice(0, limit)
        .map(toSummary);
      json(res, { tasks: list, total: ctx.store.all().length });
      return;
    }

    if (route === '/api/stats') {
      const snapshot = ctx.queue.snapshot();
      json(res, {
        status: snapshot.status,
        order: snapshot.order.length,
        remaining: ctx.queue.remaining(),
        inflight: snapshot.inflight.length,
        delayed: snapshot.delayed.length,
        ...snapshot.stats,
      });
      return;
    }

    if (route === '/api/dashboard') {
      const all = ctx.store.all();
      const active = all.filter((t) => t.stage === 'downloading' || t.stage === 'muxing' || t.stage === 'finalizing');
      const snapshot = ctx.queue.snapshot();
      const usage = await outputUsage(ctx.root);
      const auth = Date.now() - authCache.checkedAt > 300_000 ? await refreshAuth(ctx) : authCache;
      const speedBps = all
        .filter((t) => t.stage === 'downloading')
        .reduce((sum, t) => sum + (t.progress?.speedBps ?? 0), 0);
      json(res, {
        root: ctx.root,
        tasks: {
          total: all.length,
          running: active.length,
          downloading: all.filter((t) => t.stage === 'downloading').length,
          muxing: all.filter((t) => t.stage === 'muxing').length,
          queued: all.filter((t) => t.stage === 'queued').length,
          done: all.filter((t) => t.stage === 'done').length,
          failed: all.filter((t) => t.stage === 'failed').length,
          remaining: ctx.queue.remaining(),
        },
        videos: {
          downloaded: all.filter((t) => t.stage === 'done' || t.stage === 'skipped').length,
          bytesDone: snapshot.stats.bytesDone,
        },
        speedBps,
        queue: { status: snapshot.status, inflight: snapshot.inflight.length, delayed: snapshot.delayed.length },
        mux: { paused: isMuxPaused() },
        disk: {
          root: usage.root,
          usedBytes: usage.usedBytes,
          cacheBytes: usage.cacheBytes,
          limitBytes: usage.limitBytes,
          ratio: usage.ratio,
          freeBytes: usage.freeBytes,
          totalBytes: usage.totalBytes,
          at: usage.at,
        },
        auth,
      });
      return;
    }

    if (route === '/api/folders') {
      json(res, { folders: await listFolders(enqueueCtx()) });
      return;
    }

    if (route === '/api/scan' && req.method === 'POST') {
      try {
        const result = await refreshFavorites(enqueueCtx());
        bus.emit({ t: 'queue.stats', stats: {} as never });
        json(res, { ok: true, ...result });
      } catch (err) {
        json(res, { ok: false, error: (err as Error).message }, 400);
      }
      return;
    }

    if (route === '/api/enqueue/favorites' && req.method === 'POST') {
      const payload = await body(req);
      try {
        const result = await enqueueFavorites(enqueueCtx(), {
          folder: payload.folder ? String(payload.folder) : undefined,
          limit: payload.limit ? Number(payload.limit) : undefined,
          order: payload.order as 'favTime' | 'pubDate' | undefined,
        });
        bus.emit({ t: 'queue.stats', stats: {} as never });
        json(res, { ok: true, ...result });
      } catch (err) {
        json(res, { ok: false, error: (err as Error).message }, 400);
      }
      return;
    }

    if (route === '/api/enqueue/up' && req.method === 'POST') {
      const payload = await body(req);
      const target = String(payload.target ?? '').trim();
      if (!target) {
        json(res, { ok: false, error: '请填写 UP 主 mid / 主页链接 / 昵称' }, 400);
        return;
      }
      try {
        const result = await enqueueUp(enqueueCtx(), {
          target,
          limit: payload.limit ? Number(payload.limit) : undefined,
          keyword: payload.keyword ? String(payload.keyword) : undefined,
          since: payload.since ? String(payload.since) : undefined,
        });
        bus.emit({ t: 'queue.stats', stats: {} as never });
        json(res, { ok: true, ...result });
      } catch (err) {
        json(res, { ok: false, error: (err as Error).message }, 400);
      }
      return;
    }

    if (route === '/api/cache/clean' && req.method === 'POST') {
      const payload = await body(req);
      const result =
        payload.scope === 'all' ? await cleanAllCache(ctx.root) : await cleanDoneCache(ctx.root, ctx.store);
      invalidateUsage(ctx.root);
      log.warn(`已清理分片缓存，释放 ${formatBytes(result.bytes)}（${result.removed} 个目录）`);
      json(res, { ok: true, ...result });
      return;
    }

    if (route === '/api/library/delete' && req.method === 'POST') {
      const payload = await body(req);
      const ids: string[] = Array.isArray(payload.ids) ? payload.ids.map(String) : [];
      if (!ids.length) {
        json(res, { ok: false, error: '未指定要删除的视频' }, 400);
        return;
      }
      const data = await scanLibrary(ctx.root);
      const entries: DeletedEntry[] = [];
      let bytes = 0;
      for (const id of ids) {
        const item = data.items.find((i) => `${i.bvid}:${i.page}` === id);
        if (!item) continue;
        // 只删视频与其字幕；封面与同名 .meta.json 保留，便于日后找回
        const files = [item.video, ...(item.subtitles ?? []).map((s) => s.file)].filter(Boolean);
        let freed = 0;
        for (const f of files) {
          const abs = path.join(ctx.root, f);
          const size = await stat(abs).then((s) => s.size).catch(() => 0);
          if (!size) continue;
          await rm(abs, { force: true }).catch(() => undefined);
          freed += size;
        }
        bytes += freed;
        entries.push({ bvid: item.bvid, page: item.page, title: item.title, at: Date.now(), bytes: freed });
      }
      if (!entries.length) {
        json(res, { ok: false, error: '没有匹配到可删除的视频' }, 400);
        return;
      }
      await markDeleted(ctx.root, entries);
      await buildLibrary(ctx.root);
      log.warn(`媒体库删除 ${entries.length} 个视频，释放 ${formatBytes(bytes)}（metadata 保留）`);
      json(res, { ok: true, removed: entries.length, bytes });
      return;
    }

    if (route === '/api/library/restore' && req.method === 'POST') {
      const payload = await body(req);
      const ids: string[] = Array.isArray(payload.ids) ? payload.ids.map(String) : [];
      const n = await restoreDeleted(ctx.root, ids);
      await buildLibrary(ctx.root);
      json(res, { ok: true, restored: n });
      return;
    }

    if (route === '/api/library/rebuild' && req.method === 'POST') {
      const data = await buildLibrary(ctx.root);
      json(res, { ok: true, items: data.items.length, folders: data.folders.length, ups: data.ups.length });
      return;
    }

    if (route === '/api/mux/pause' && req.method === 'POST') {
      setMuxPaused(true);
      log.warn('已暂停全局转码（已下载分片保留）');
      json(res, { ok: true, paused: true });
      return;
    }

    if (route === '/api/mux/resume' && req.method === 'POST') {
      setMuxPaused(false);
      log.info('已恢复全局转码');
      json(res, { ok: true, paused: false });
      return;
    }

    if (route === '/api/queue/pause' && req.method === 'POST') {
      ctx.queue.pause();
      bus.emit({ t: 'queue.stats', stats: {} as never });
      json(res, { ok: true });
      return;
    }

    if (route === '/api/queue/resume' && req.method === 'POST') {
      ctx.queue.resume();
      json(res, { ok: true });
      return;
    }

    const taskMatch = route.match(/^\/api\/tasks\/([^/]+)\/(\w+)$/);
    if (taskMatch && req.method === 'POST') {
      const [, id, action] = taskMatch;
      const task = ctx.store.get(id);
      if (!task) {
        json(res, { ok: false, error: '任务不存在' }, 404);
        return;
      }
      if (action === 'cancel') {
        ctx.queue.cancel(id);
        task.stage = 'paused';
      } else if (action === 'retry') {
        task.retryCount = 0;
        task.error = undefined;
        task.stage = 'queued';
        ctx.queue.prioritize(id);
      } else if (action === 'prioritize') {
        task.stage = 'queued';
        ctx.queue.prioritize(id);
      } else if (action === 'pause') {
        task.stage = 'paused';
      } else {
        json(res, { ok: false, error: `不支持的操作 ${action}` }, 400);
        return;
      }
      ctx.store.upsert(task);
      bus.emit({ t: 'task.update', task: toSummary(task) });
      json(res, { ok: true });
      return;
    }

    if (route === '/api/config') {
      if (req.method === 'PATCH') {
        const patch = (await body(req)) as Partial<Config>;
        const merged = { ...getConfig(), ...patch } as Config;
        setConfig(merged);
        bus.emit({ t: 'config.updated', config: merged });
        json(res, { ok: true, config: merged });
        return;
      }
      json(res, getConfig());
      return;
    }

    if (route === '/api/logs/tail') {
      const day = new Date().toISOString().slice(0, 10);
      const file = path.join(ctx.root, '.state', 'logs', `${day}.log`);
      try {
        const text = await readFile(file, 'utf8');
        json(res, { lines: text.split('\n').slice(-200) });
      } catch {
        json(res, { lines: [] });
      }
      return;
    }

    // 媒体库页面（与控制端同进程，静态资源走 outputs 根目录）
    if (route === '/library' || route === '/index.html') {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(renderLibraryPage());
      return;
    }

    // 静态媒体库（图片 / 视频 / 字幕 / 索引数据，支持 Range）
    const filePath = safeJoin(ctx.root, decodeURIComponent(route));
    if (filePath && (await sendFile(req, res, filePath))) return;

    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Not Found');
  });

  void refreshAuth(ctx);

  await new Promise<void>((resolve, reject) => {
    server.on('error', (err: NodeJS.ErrnoException) => {
      if (err.code === 'EADDRINUSE') {
        reject(new Error(`控制端端口 ${config.control.port} 已被占用，换一个：bili web --port ${config.control.port + 1}`));
      } else reject(err);
    });
    server.listen(config.control.port, config.control.host, resolve);
  });
  const url = `http://${config.control.host}:${config.control.port}`;
  log.info(`控制端已启动：${url}`);
  void formatBytes(0);

  return {
    url,
    close: () => {
      unsubscribe();
      for (const res of sseClients) res.end();
      server.close();
    },
  };
}

function rank(task: TaskRecord): number {
  const order: Record<string, number> = { downloading: 0, muxing: 1, finalizing: 2, planning: 3, queued: 4, failed: 5, paused: 6, skipped: 7, done: 8 };
  return order[task.stage] ?? 9;
}
