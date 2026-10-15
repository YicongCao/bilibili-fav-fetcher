import path from 'node:path';
import { writeFile } from 'node:fs/promises';
import { loadConfig } from '../../config.js';
import { buildLibrary } from '../../library/scanLibrary.js';
import { renderLibraryPage } from '../../web/libraryPage.js';
import { outputUsage } from '../../core/disk.js';
import { formatBytes } from '../../utils/fsx.js';
import { log } from '../../utils/logger.js';

/** 生成 outputs/index.html + library.js（数据内联为 <script src>，file:// 直接双击可用） */
export async function buildIndexCommand(): Promise<void> {
  const config = await loadConfig();
  const root = config.output.root;

  const data = await buildLibrary(root);
  const html = renderLibraryPage();
  const htmlPath = path.join(root, 'index.html');
  await writeFile(htmlPath, html, 'utf8');

  const usage = await outputUsage(root);
  log.print(`索引页：${htmlPath}`);
  log.print(`媒体数据：${path.join(root, 'library.js')}（同时写 library.json）`);
  log.print(`共 ${data.items.length} 个视频，${data.folders.length} 个收藏夹，${data.ups.length} 位 UP`);
  log.print(`占用：${formatBytes(usage.usedBytes)}${usage.limitBytes ? ` / 上限 ${formatBytes(usage.limitBytes)}` : ''}`);
  log.print('提示：双击 index.html 即可离线浏览；需要拖动进度条时执行 npm run bili -- serve');
}
