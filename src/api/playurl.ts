import { apiGet } from './client.js';
import { globalLimiter } from '../utils/rate.js';

export interface RawStream {
  id: number;
  base_url?: string;
  baseUrl?: string;
  backup_url?: string[];
  backupUrl?: string[];
  bandwidth?: number;
  codecid?: number;
  codecs?: string;
  width?: number;
  height?: number;
  frame_rate?: string;
  frameRate?: string;
  mime_type?: string;
  mimeType?: string;
}

export interface RawDurl {
  url: string;
  size?: number;
  length?: number;
  backup_url?: string[];
  order?: number;
}

export interface PlayUrlData {
  quality?: number;
  timelength?: number;
  support_formats?: Array<{ quality?: number; new_description?: string; display_desc?: string }>;
  dash?: {
    duration?: number;
    video?: RawStream[];
    audio?: RawStream[];
    dolby?: { type?: number; audio?: RawStream[] };
    flac?: { display?: boolean; audio?: RawStream };
  };
  durl?: RawDurl[];
}

/** 播放地址：fnval=4048 全开（DASH + HDR + 4K + 杜比 + 8K + AV1） */
export async function playurl(
  cookies: Record<string, string>,
  bvid: string,
  cid: number,
  fnval = 4048,
): Promise<PlayUrlData> {
  await globalLimiter.wait();
  return apiGet<PlayUrlData>(
    '/x/player/wbi/playurl',
    { bvid, cid, fnval, fourk: 1, qn: 0, platform: 'web', otype: 'json', try_look: 0 },
    { cookies, signed: true, timeoutMs: 12_000, referer: `https://www.bilibili.com/video/${bvid}/` },
  );
}
