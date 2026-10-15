import { execFile } from 'node:child_process';
import { createServer } from 'node:http';
import { loadConfig } from '../../config.js';
import { log } from '../../utils/logger.js';
import { renderLibraryPage } from '../../web/libraryPage.js';
import { safeJoin, sendFile } from '../../server/static.js';

export interface ServeOptions {
  port?: number;
  host?: string;
  noOpen?: boolean;
}

/** 静态媒体库服务：支持 Range（可拖动进度条） */
export async function serveCommand(options: ServeOptions = {}): Promise<void> {
  const config = await loadConfig();
  const root = config.output.root;
  const port = options.port ?? config.control.port;
  const host = options.host ?? config.control.host;

  const server = createServer(async (req, res) => {
    const url = new URL(req.url ?? '/', `http://${req.headers.host ?? '127.0.0.1'}`);
    let rel = decodeURIComponent(url.pathname);

    if (rel === '/' || rel === '') {
      const indexFile = safeJoin(root, 'index.html');
      if (indexFile && (await sendFile(req, res, indexFile))) return;
      // 还没生成过索引页时，直接渲染（数据仍需 library.js，故提示先 build-index）
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(renderLibraryPage());
      return;
    }

    const file = safeJoin(root, rel);
    if (!file) {
      res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Forbidden');
      return;
    }
    if (await sendFile(req, res, file)) return;

    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Not Found');
  });

  await new Promise<void>((resolve, reject) => {
    server.on('error', (err: NodeJS.ErrnoException) => {
      if (err.code === 'EADDRINUSE') reject(new Error(`端口 ${port} 已被占用，换一个：--port ${port + 1}`));
      else reject(err);
    });
    server.listen(port, host, resolve);
  }).catch((err: Error) => {
    log.error(err.message);
    process.exitCode = 1;
    return null;
  });
  if (process.exitCode) return;
  const url = `http://${host}:${port}`;
  log.print(`媒体库已启动：${url}`);
  log.print(`根目录：${root}（npm run bili -- build-index 可重建索引页）`);

  const open = config.control.openBrowser && !options.noOpen;
  if (open) execFile('open', [url], () => undefined);

  const stop = () => {
    server.close(() => process.exit(0));
  };
  process.on('SIGINT', stop);
  process.on('SIGTERM', stop);
}
