import type { PlacedDanmaku } from './layout.js';

export interface AssOptions {
  width: number;
  height: number;
  title?: string;
  fontSizeRatio?: number;
  /** 标准弹幕字号（决定轨道高度与缺字号时的兜底值），默认 36 */
  baseFont?: number;
}

function assTime(sec: number): string {
  const clamped = Math.max(0, sec);
  const h = Math.floor(clamped / 3600);
  const m = Math.floor((clamped % 3600) / 60);
  const s = Math.floor(clamped % 60);
  const cs = Math.floor((clamped % 1) * 100);
  return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}.${String(cs).padStart(2, '0')}`;
}

/** ASS 颜色：B 站为 0xRRGGBB，ASS 需要 &HBBGGRR */
function assColor(rgb: number): string {
  const r = (rgb >> 16) & 0xff;
  const g = (rgb >> 8) & 0xff;
  const b = rgb & 0xff;
  const hex = [b, g, r].map((v) => v.toString(16).padStart(2, '0')).join('');
  return `&H${hex.toUpperCase()}&`;
}

export function buildAss(items: PlacedDanmaku[], opts: AssOptions): string {
  const width = opts.width || 1920;
  const height = opts.height || 1080;
  const ratio = opts.fontSizeRatio ?? 1;
  const baseFont = opts.baseFont ?? 36;
  const trackHeight = baseFont * 1.2;

  const header = [
    '[Script Info]',
    `Title: ${opts.title ?? 'bilibili danmaku'}`,
    'ScriptType: v4.00+',
    'WrapStyle: 2',
    'ScaledBorderAndShadow: yes',
    'YCbCr Matrix: None',
    `PlayResX: ${width}`,
    `PlayResY: ${height}`,
    '',
    '[V4+ Styles]',
    'Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding',
    `Style: Default,PingFang SC,${baseFont},&H00FFFFFF,&H00FFFFFF,&H00000000,&H00000000,0,0,0,0,100,100,0,0,1,2,0,2,0,0,0,1`,
    `Style: Top,PingFang SC,${baseFont},&H00FFFFFF,&H00FFFFFF,&H00000000,&H00000000,0,0,0,0,100,100,0,0,1,2,0,8,0,0,0,1`,
    `Style: Bottom,PingFang SC,${baseFont},&H00FFFFFF,&H00FFFFFF,&H00000000,&H00000000,0,0,0,0,100,100,0,0,1,2,0,2,0,0,0,1`,
    '',
    '[Events]',
    'Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text',
  ].join('\n');

  const lines = items.map((d) => {
    const fontSize = Math.round((d.fontSize || baseFont || 25) * ratio);
    const color = assColor(d.color || 0xffffff);
    const end = d.time + d.duration;
    const text = d.text.replace(/\{/g, '(').replace(/\}/g, ')').replace(/\n/g, ' ');

    if (d.mode === 5) {
      // 顶部固定
      const y = Math.round(20 + d.track * trackHeight);
      return `Dialogue: 0,${assTime(d.time)},${assTime(end)},Top,,0,0,0,,{\\an8\\pos(${Math.round(width / 2)},${y})\\fs${fontSize}\\c${color}}${text}`;
    }
    if (d.mode === 4) {
      // 底部固定
      const y = Math.round(height - 20 - d.track * trackHeight);
      return `Dialogue: 0,${assTime(d.time)},${assTime(end)},Bottom,,0,0,0,,{\\an2\\pos(${Math.round(width / 2)},${y})\\fs${fontSize}\\c${color}}${text}`;
    }
    // 滚动：从右侧移动到左侧
    const y = Math.round(20 + d.track * trackHeight + fontSize / 2);
    const x1 = Math.round(width + d.textWidth / 2);
    const x2 = Math.round(-d.textWidth / 2);
    return `Dialogue: 0,${assTime(d.time)},${assTime(end)},Default,,0,0,0,,{\\move(${x1},${y},${x2},${y})\\fs${fontSize}\\c${color}}${text}`;
  });

  // 带 BOM，兼容 Windows 播放器
  return `\uFEFF${header}\n${lines.join('\n')}\n`;
}
