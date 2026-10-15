/** 提交前自检：阻断凭据与产物误提交（供 git pre-commit 或手动 npm run check:secret 调用） */
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const SECRET_PATTERNS: [string, RegExp][] = [
  ['SESSDATA', /SESSDATA\s*[:=]\s*[\w%.-]{8,}/i],
  ['bili_jct', /bili_jct\s*[:=]\s*[\w-]{8,}/i],
  ['refresh_token', /refresh_token\s*[:=]\s*[\w-]{8,}/i],
  ['DedeUserID', /DedeUserID\s*[:=]\s*\d{3,}/i],
];

const FORBIDDEN_PATHS = [/^\.local\//, /^outputs\//, /^\.state\//, /^bin\//, /cookies?\.json$/i];

function stagedFiles(): string[] {
  try {
    const out = execFileSync('git', ['diff', '--cached', '--name-only', '--diff-filter=ACM'], { encoding: 'utf8' });
    return out.split('\n').map((s) => s.trim()).filter(Boolean);
  } catch {
    return [];
  }
}

function main(): void {
  const files = process.argv[2] ? [process.argv[2]] : stagedFiles();
  const problems: string[] = [];

  for (const file of files) {
    if (FORBIDDEN_PATHS.some((re) => re.test(file))) {
      problems.push(`${file}：凭据或产物目录不该提交（检查 .gitignore）`);
      continue;
    }
    let text = '';
    try {
      text = readFileSync(file, 'utf8');
    } catch {
      continue;
    }
    for (const [name, re] of SECRET_PATTERNS) {
      if (re.test(text)) problems.push(`${file}：疑似包含 ${name}`);
    }
  }

  if (problems.length) {
    console.error('提交前检查未通过：');
    for (const p of problems) console.error('  - ' + p);
    process.exit(1);
  }
  if (files.length) console.log(`提交前检查通过（${files.length} 个文件）`);
}

void main();
