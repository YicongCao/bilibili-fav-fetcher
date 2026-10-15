/** 文件名 / 目录名清洗与模板渲染（Windows + macOS 双兼容） */

const ILLEGAL = /[\\/:*?"<>|\r\n\t]/g;
const CONTROL = /[\u0000-\u001f\u007f]/g;

/** 按 UTF-8 字节安全截断，避免截断出半个汉字 */
function truncateBytes(input: string, maxBytes = 120): string {
  const buf = Buffer.from(input, 'utf8');
  if (buf.length <= maxBytes) return input;
  let cut = maxBytes;
  // 回退到 UTF-8 字符边界
  while (cut > 0 && (buf[cut] & 0xc0) === 0x80) cut -= 1;
  return buf.subarray(0, cut).toString('utf8');
}

export function sanitizeName(input: string, maxBytes = 120): string {
  let out = (input ?? '')
    .replace(CONTROL, '')
    .replace(ILLEGAL, '_')
    .replace(/\s+/g, ' ')
    .trim();
  // 去掉首尾空格与点
  out = out.replace(/^\.+/, '').replace(/[. ]+$/, '');
  out = truncateBytes(out, maxBytes);
  if (!out) out = '未命名';
  return out;
}

export interface NameVars {
  title: string;
  bvid: string;
  up: string;
  mid: number;
  p: number;
  ptitle?: string;
  quality?: string;
  qualityId?: number;
  container?: string;
  pubdate?: string;
  favdate?: string;
}

export function renderTemplate(template: string, vars: NameVars): string {
  return template.replace(/\{(\w+)\}/g, (_m, key: string) => {
    const v = (vars as unknown as Record<string, string | number | undefined>)[key];
    return v === undefined ? '' : String(v);
  });
}

/** 是否给文件名加 [P{n}] 后缀 */
export function usePartSuffix(
  rule: 'auto' | 'always' | 'never',
  totalPages: number,
): boolean {
  if (rule === 'always') return true;
  if (rule === 'never') return false;
  return totalPages > 1;
}

/** 生成基础文件名（不含扩展名），已含防重名后缀由调用方处理 */
export function buildBaseName(
  template: string,
  vars: NameVars,
): string {
  return sanitizeName(renderTemplate(template, vars));
}

/** 目录/文件名防重名：追加 (bvid) → -2 → -3 */
export function dedupeName(used: Set<string>, base: string, fallbackTag: string): string {
  const key = base.toLowerCase();
  if (!used.has(key)) {
    used.add(key);
    return base;
  }
  const withTag = `${base} (${fallbackTag})`;
  if (!used.has(withTag.toLowerCase())) {
    used.add(withTag.toLowerCase());
    return withTag;
  }
  let i = 2;
  while (used.has(`${withTag}-${i}`.toLowerCase())) i += 1;
  const final = `${withTag}-${i}`;
  used.add(final.toLowerCase());
  return final;
}
