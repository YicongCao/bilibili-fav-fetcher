import type { DanmakuItem } from '../api/danmaku.js';

function srtTime(sec: number): string {
  const clamped = Math.max(0, sec);
  const h = Math.floor(clamped / 3600);
  const m = Math.floor((clamped % 3600) / 60);
  const s = Math.floor(clamped % 60);
  const ms = Math.floor((clamped % 1) * 1000);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')},${String(ms).padStart(3, '0')}`;
}

/** SRT：无样式，兼容简单播放器；显示时长固定 5s，同一时刻最多 3 条避免刷屏 */
export function buildSrt(items: DanmakuItem[], opts: { duration?: number; maxPerTime?: number } = {}): string {
  const duration = opts.duration ?? 5;
  const maxPerTime = opts.maxPerTime ?? 3;

  const buckets = new Map<number, DanmakuItem[]>();
  for (const item of items) {
    const key = Math.floor(item.time);
    const bucket = buckets.get(key) ?? [];
    if (bucket.length >= maxPerTime) continue;
    bucket.push(item);
    buckets.set(key, bucket);
  }

  const keys = [...buckets.keys()].sort((a, b) => a - b);
  const blocks: string[] = [];
  let index = 1;
  for (const key of keys) {
    for (const item of buckets.get(key)!) {
      const text = item.text.replace(/[\r\n]+/g, ' ').trim();
      if (!text) continue;
      blocks.push(`${index}\n${srtTime(item.time)} --> ${srtTime(item.time + duration)}\n${text}\n`);
      index += 1;
    }
  }
  return `\uFEFF${blocks.join('\n')}`;
}
