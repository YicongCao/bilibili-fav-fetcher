import type { PlayUrlData, RawStream } from '../api/playurl.js';
import type { Config } from '../config.js';

export const QUALITY_LABEL: Record<number, string> = {
  127: '8K',
  126: '杜比视界',
  125: 'HDR 真彩',
  120: '4K',
  116: '1080P60',
  112: '1080P+',
  80: '1080P',
  74: '720P60',
  64: '720P',
  32: '480P',
  16: '360P',
};

/** 清晰度上限 → 允许的最大 qualityId */
const RES_LIMIT: Record<string, number> = {
  '8K': 127,
  '4K': 120,
  '1080P': 116,
  '720P': 74,
  '480P': 32,
  '360P': 16,
};

/** HDR / 杜比视界 档位 */
const HDR_IDS = new Set([125, 126]);

export interface SelectedStream {
  url: string;
  backupUrls: string[];
  qualityId: number;
  qualityLabel: string;
  codec: 'avc' | 'hevc' | 'av01' | 'unknown';
  width: number;
  height: number;
  fps: number;
  hdr: boolean;
  bandwidth: number;
  /** 近似字节数（duration × bandwidth/8） */
  bytes: number;
}

export interface QualityResult {
  video: SelectedStream;
  audio?: SelectedStream;
  degraded: boolean;
  want: string;
}

function urlOf(s: RawStream): string {
  return s.base_url ?? s.baseUrl ?? '';
}

function backupOf(s: RawStream): string[] {
  return s.backup_url ?? s.backupUrl ?? [];
}

function codecOf(s: RawStream): SelectedStream['codec'] {
  const c = (s.codecs ?? '').toLowerCase();
  if (c.startsWith('av01')) return 'av01';
  if (c.startsWith('hev1') || c.startsWith('hvc1') || s.codecid === 12) return 'hevc';
  if (c.startsWith('avc') || s.codecid === 7) return 'avc';
  if (s.codecid === 13) return 'av01';
  return 'unknown';
}

function fpsOf(s: RawStream): number {
  const raw = s.frame_rate ?? s.frameRate ?? '30';
  const n = Number(raw);
  return Number.isFinite(n) ? n : 30;
}

function toSelected(s: RawStream, durationSec: number): SelectedStream {
  const bandwidth = s.bandwidth ?? 0;
  return {
    url: urlOf(s),
    backupUrls: backupOf(s),
    qualityId: s.id,
    qualityLabel: QUALITY_LABEL[s.id] ?? `${s.id}`,
    codec: codecOf(s),
    width: s.width ?? 0,
    height: s.height ?? 0,
    fps: fpsOf(s),
    hdr: HDR_IDS.has(s.id),
    bandwidth,
    bytes: Math.round((bandwidth / 8) * Math.max(durationSec, 1)),
  };
}

/**
 * 选最高可用画质：清晰度 > HDR/杜比 > 帧率 > 编码偏好
 * 缺失目标档位时逐级降级，并标记 degraded
 */
export function selectBest(
  data: PlayUrlData,
  cfg: Config['download'],
  durationSec: number,
): QualityResult | null {
  const videos = (data.dash?.video ?? []).filter((v) => urlOf(v));
  if (!videos.length) return null;

  const limit = RES_LIMIT[cfg.maxResolution] ?? 127;
  let pool = videos.filter((v) => v.id <= limit);
  if (!pool.length) pool = videos;

  const want = cfg.quality === 'best' ? 'best' : cfg.quality;
  let degraded = false;
  if (want !== 'best') {
    const target = Object.entries(QUALITY_LABEL).find(([, label]) => label === want)?.[0];
    if (target) {
      const tid = Number(target);
      const exact = pool.filter((v) => v.id === tid);
      if (exact.length) {
        pool = exact;
      } else {
        pool = pool.filter((v) => v.id < tid);
        degraded = true;
      }
    }
  }

  // 编码偏好
  const codecPref = cfg.codec;
  const byCodec = (list: RawStream[], codec: SelectedStream['codec']) => list.filter((v) => codecOf(v) === codec);
  const codecOrder: SelectedStream['codec'][] =
    codecPref === 'avc'
      ? ['avc', 'hevc', 'av01']
      : codecPref === 'hevc'
        ? ['hevc', 'avc', 'av01']
        : codecPref === 'av1'
          ? ['av01', 'hevc', 'avc']
          : ['hevc', 'avc', 'av01'];

  const bestId = Math.max(...pool.map((v) => v.id));
  let candidates = pool.filter((v) => v.id === bestId);

  // HDR 优先
  if (cfg.preferHdr) {
    const hdr = candidates.filter((v) => HDR_IDS.has(v.id));
    if (hdr.length) candidates = hdr;
  }

  // 编码：在同等条件下按偏好挑选（不因此降级清晰度）
  for (const codec of codecOrder as SelectedStream['codec'][]) {
    const hit = byCodec(candidates, codec);
    if (hit.length) {
      candidates = hit;
      break;
    }
  }

  // 帧率优先（同档取 60fps）
  if (cfg.preferHighFps) {
    const maxFps = Math.max(...candidates.map(fpsOf));
    const fast = candidates.filter((v) => fpsOf(v) === maxFps);
    if (fast.length) candidates = fast;
  }

  const picked = candidates[0] ?? pool[0];
  const video = toSelected(picked, durationSec);

  // 音频：杜比 > FLAC > 320K(30280) > 132K > 64K
  let audio: SelectedStream | undefined;
  const dolbyAudio = data.dash?.dolby?.audio ?? [];
  const flacAudio = data.dash?.flac?.audio;
  const normalAudio = data.dash?.audio ?? [];
  if (cfg.audioQuality === 'best' && dolbyAudio.length) {
    audio = toSelected(dolbyAudio[0], durationSec);
  } else if (cfg.audioQuality === 'best' && flacAudio) {
    audio = toSelected(flacAudio, durationSec);
  } else if (normalAudio.length) {
    const sorted = [...normalAudio].sort((a, b) => b.id - a.id);
    audio = toSelected(sorted[0], durationSec);
  } else if (dolbyAudio.length) {
    audio = toSelected(dolbyAudio[0], durationSec);
  }

  if (video.qualityId !== bestId) degraded = true;
  return { video, audio, degraded, want };
}
