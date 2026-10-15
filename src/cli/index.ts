#!/usr/bin/env node
import { Command } from 'commander';
import { loginCommand } from './commands/login.js';
import { whoamiCommand } from './commands/whoami.js';
import { doctorCommand } from './commands/doctor.js';
import { scanCommand } from './commands/scan.js';
import { downloadCommand } from './commands/download.js';
import { statusCommand } from './commands/status.js';
import { repairCommand } from './commands/repair.js';
import { upCommand } from './commands/up.js';
import { webCommand } from './commands/web.js';
import { buildIndexCommand } from './commands/buildIndex.js';
import { serveCommand } from './commands/serve.js';
import { setCliOutputRoot } from '../config.js';
import { log } from '../utils/logger.js';

const OUT_DESC = '指定 outputs 目录（默认 outputs；优先级 --out > BILI_OUT > config.json）';

/** 记录 --out 并原样返回值（commander 的 option 转换函数） */
function outArg(v: string): string {
  setCliOutputRoot(v);
  return v;
}

const program = new Command();

program
  .name('bili')
  .description('哔哩哔哩收藏夹下载器')
  .version('0.1.0')
  .option('--out <dir>', OUT_DESC, outArg);

program
  .command('login')
  .description('获取并保存登录态')
  .option('--qr', '扫码登录（默认）')
  .option('--manual', '手动粘贴 Cookie')
  .option('--import <file>', '从 cookies.txt / Cookie-Editor JSON 导入')
  .option('--cookie-file <path>', '登录态保存路径', '.local/cookies.json')
  .action(async (opts) => {
    await loginCommand(opts);
  });

program
  .command('whoami')
  .description('显示当前登录用户')
  .option('--cookie-file <path>', '登录态路径', '.local/cookies.json')
  .action(async (opts) => {
    await whoamiCommand(opts);
  });

program
  .command('scan')
  .description('扫描收藏夹结构并导出 metadata')
  .option('--fav <ids>', '只扫描指定收藏夹 id（逗号分隔）')
  .option('--include-collected', '同时扫描收藏的他人收藏夹')
  .option('--out <dir>', OUT_DESC, outArg)
  .option('--cookie-file <path>', '登录态路径', '.local/cookies.json')
  .action(async (opts) => {
    await scanCommand(opts);
  });

program
  .command('download')
  .description('按收藏/发布时间倒序下载视频')
  .option('--limit <n>', '只处理前 n 个任务')
  .option('--folder <name>', '只下载某个收藏夹')
  .option('--order <by>', 'favTime | pubDate')
  .option('--pages <rule>', 'all | collected | first')
  .option('--dry-run', '只列出将要下载的任务')
  .option('--force', '忽略已存在产物')
  .option('--out <dir>', OUT_DESC, outArg)
  .option('--cookie-file <path>', '登录态路径', '.local/cookies.json')
  .action(async (opts) => {
    await downloadCommand({
      limit: opts.limit ? Number(opts.limit) : undefined,
      folder: opts.folder,
      order: opts.order,
      pages: opts.pages,
      dryRun: opts.dryRun,
      force: opts.force,
      cookieFile: opts.cookieFile,
    });
  });

program
  .command('up')
  .argument('<target>', 'UP 主 mid / 主页 URL / 昵称')
  .description('按 UP 主从新到旧下载全部投稿')
  .option('--since <date>', '只下载该日期之后发布的投稿（YYYY-MM-DD）')
  .option('--keyword <kw>', '标题关键词过滤')
  .option('--limit <n>', '只处理前 n 个任务')
  .option('--dry-run', '只列出任务')
  .option('--out <dir>', OUT_DESC, outArg)
  .option('--cookie-file <path>', '登录态路径', '.local/cookies.json')
  .action(async (target, opts) => {
    await upCommand(target, {
      since: opts.since,
      keyword: opts.keyword,
      limit: opts.limit ? Number(opts.limit) : undefined,
      dryRun: opts.dryRun,
      cookieFile: opts.cookieFile,
    });
  });

program
  .command('web')
  .description('启动控制端网页（实时看板 + 任务控制 + 配置热更新）')
  .option('--port <n>', '端口', '8765')
  .option('--host <ip>', '监听地址', '127.0.0.1')
  .option('--no-open', '不自动打开浏览器')
  .option('--limit <n>', '只规划前 n 个任务')
  .option('--no-download', '只开看板，不启动下载')
  .option('--out <dir>', OUT_DESC, outArg)
  .option('--cookie-file <path>', '登录态路径', '.local/cookies.json')
  .action(async (opts) => {
    await webCommand({
      port: Number(opts.port),
      host: opts.host,
      noOpen: opts.noOpen,
      limit: opts.limit ? Number(opts.limit) : undefined,
      // commander 把 --no-download 解析为 opts.download === false
      noDownload: opts.download === false,
      cookieFile: opts.cookieFile,
    });
  });

program
  .command('build-index')
  .description('生成媒体库索引页 outputs/index.html + library.js')
  .option('--out <dir>', OUT_DESC, outArg)
  .action(async () => {
    await buildIndexCommand();
  });

program
  .command('serve')
  .description('静态媒体库服务（支持 Range，可拖动进度条）')
  .option('--port <n>', '端口（默认同 control.port）')
  .option('--host <ip>', '监听地址', '127.0.0.1')
  .option('--no-open', '不自动打开浏览器')
  .option('--out <dir>', OUT_DESC, outArg)
  .action(async (opts) => {
    await serveCommand({ port: opts.port ? Number(opts.port) : undefined, host: opts.host, noOpen: opts.open === false });
  });

program
  .command('status')
  .description('查看队列与任务状态')
  .option('--out <dir>', OUT_DESC, outArg)
  .action(async () => {
    await statusCommand();
  });

program
  .command('repair')
  .description('补偿失败 / 未完成任务')
  .option('--failed', '只重跑失败任务')
  .option('--need-mux', '只重跑待封装任务')
  .option('--engine <name>', 'native | ytdlp，强制指定引擎')
  .option('--out <dir>', OUT_DESC, outArg)
  .option('--cookie-file <path>', '登录态路径', '.local/cookies.json')
  .action(async (opts) => {
    await repairCommand(opts);
  });

program
  .command('doctor')
  .description('环境自检（Node / ffmpeg / 登录态 / 磁盘 / 连通性）')
  .option('--out <dir>', OUT_DESC, outArg)
  .option('--cookie-file <path>', '登录态路径', '.local/cookies.json')
  .action(async (opts) => {
    await doctorCommand(opts);
  });

program.parseAsync(process.argv).catch((err: unknown) => {
  log.error((err as Error).message);
  process.exit(1);
});
