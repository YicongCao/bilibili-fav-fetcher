import { describe, expect, it } from 'vitest';
import { buildBaseName, dedupeName, sanitizeName, usePartSuffix, renderTemplate } from './namer.js';

describe('sanitizeName', () => {
  it('替换非法字符', () => {
    expect(sanitizeName('a/b\\c:d*e?f"g<h>i|j')).toBe('a_b_c_d_e_f_g_h_i_j');
  });

  it('去控制字符与首尾空白/点', () => {
    expect(sanitizeName('  ..标题..  ')).toBe('标题');
  });

  it('按 UTF-8 字节截断且不产生乱码', () => {
    const long = '标'.repeat(100);
    const out = sanitizeName(long);
    expect(Buffer.from(out, 'utf8').length).toBeLessThanOrEqual(120);
    expect(out).not.toContain('\uFFFD');
  });

  it('空名回退', () => {
    expect(sanitizeName('...')).toBe('未命名');
  });
});

describe('模板与分 P 后缀', () => {
  it('渲染模板变量', () => {
    expect(renderTemplate('{title} [P{p}] [{bvid}]', { title: 'T', bvid: 'BV1', p: 2, up: 'u', mid: 1 })).toBe(
      'T [P2] [BV1]',
    );
  });

  it('auto 规则：多 P 才加后缀', () => {
    expect(usePartSuffix('auto', 1)).toBe(false);
    expect(usePartSuffix('auto', 3)).toBe(true);
    expect(usePartSuffix('always', 1)).toBe(true);
    expect(usePartSuffix('never', 5)).toBe(false);
  });

  it('基础文件名可用默认模板生成', () => {
    const name = buildBaseName('{title} [P{p}] [{bvid}]', { title: '测试/视频', bvid: 'BV1xx', p: 1, up: 'u', mid: 1 });
    expect(name).toBe('测试_视频 [P1] [BV1xx]');
  });
});

describe('dedupeName', () => {
  it('重名依次追加 (tag) 与 -2', () => {
    const used = new Set<string>();
    const a = dedupeName(used, '标题', 'BV1');
    const b = dedupeName(used, '标题', 'BV1');
    const c = dedupeName(used, '标题', 'BV1');
    expect([a, b, c]).toEqual(['标题', '标题 (BV1)', '标题 (BV1)-2']);
  });
});
