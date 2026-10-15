#!/usr/bin/env node
import { Command } from 'commander';
import { loginCommand } from './commands/login.js';
import { whoamiCommand } from './commands/whoami.js';
import { doctorCommand } from './commands/doctor.js';
import { scanCommand } from './commands/scan.js';
import { downloadCommand } from './commands/download.js';
import { log } from '../utils/logger.js';

const program = new Command();

program.name('bili').description('哔哩哔哩收藏夹下载器').version('0.1.0');

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
  .command('doctor')
  .description('环境自检（Node / ffmpeg / 登录态 / 磁盘 / 连通性）')
  .option('--cookie-file <path>', '登录态路径', '.local/cookies.json')
  .action(async (opts) => {
    await doctorCommand(opts);
  });

program.parseAsync(process.argv).catch((err: unknown) => {
  log.error((err as Error).message);
  process.exit(1);
});
