#!/usr/bin/env node
import { Command } from 'commander';
import { loginCommand } from './commands/login.js';
import { whoamiCommand } from './commands/whoami.js';
import { doctorCommand } from './commands/doctor.js';
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
