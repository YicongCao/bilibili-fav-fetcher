import type { DanmakuItem } from '../api/danmaku.js';

export interface PlacedDanmaku extends DanmakuItem {
  /** 轨道序号（0 起） */
  track: number;
  /** 显示时长（秒） */
  duration: number;
  /** 估算文本宽度（像素） */
  textWidth: number;
}

export interface LayoutOptions {
  width: number;
  height: number;
  /** 滚动速度（px/s） */
  speed?: number;
  /** 顶部/底部弹幕停留时长（秒） */
  staticDuration?: number;
  /** 允许的最大重叠层数（轨道不够时复用最早结束的轨道） */
  maxOverlap?: number;
  /** 标准弹幕字号（决定轨道高度），默认 36 */
  baseFontSize?: number;
}

export function estimateWidth(text: string, fontSize: number): number {
  let w = 0;
  for (const ch of text) {
    w += /[\u3000-\u9fff\uff00-\uffef]/.test(ch) ? fontSize : fontSize * 0.55;
  }
  return w;
}

/** 轨道分配与防重叠 */
export function layoutDanmaku(items: DanmakuItem[], opts: LayoutOptions): PlacedDanmaku[] {
  const width = opts.width || 1920;
  const height = opts.height || 1080;
  const speed = opts.speed ?? 144;
  const staticDuration = opts.staticDuration ?? 5;
  const maxOverlap = Math.max(1, opts.maxOverlap ?? 0);

  const baseFont = opts.baseFontSize ?? 36;
  const trackHeight = baseFont * 1.2;
  const maxTracks = Math.max(4, Math.floor((height * 0.9) / trackHeight));

  // 按模式分组：滚动 / 顶部 / 底部 各自独立排轨
  const groups: Record<number, DanmakuItem[]> = { 1: [], 4: [], 5: [] };
  for (const item of items) {
    const key = item.mode === 5 ? 5 : item.mode === 4 ? 4 : 1;
    groups[key].push(item);
  }

  const placed: PlacedDanmaku[] = [];
  for (const mode of [1, 5, 4]) {
    const list = groups[mode];
    const trackEnd: number[] = new Array(maxTracks).fill(-Infinity);
    const overlapCount = new Array(maxTracks).fill(0);

    for (const item of list) {
      const fontSize = item.fontSize || 25;
      const textWidth = estimateWidth(item.text, fontSize);
      const duration =
        mode === 1 ? (width + textWidth) / speed : staticDuration;

      let track = trackEnd.findIndex((end) => end <= item.time);
      if (track === -1) {
        // 轨道全忙：选结束最早的，重叠数不超过上限时复用
        let min = 0;
        for (let i = 1; i < trackEnd.length; i += 1) if (trackEnd[i] < trackEnd[min]) min = i;
        if (overlapCount[min] >= maxOverlap) {
          // 丢弃（或强制叠加），这里选择强制叠加，保证不丢弹幕
          track = min;
        } else {
          track = min;
          overlapCount[track] += 1;
        }
      }
      trackEnd[track] = item.time + (mode === 1 ? Math.min(duration, 12) : duration);
      placed.push({ ...item, track, duration, textWidth });
    }
  }

  return placed.sort((a, b) => a.time - b.time || a.track - b.track);
}
