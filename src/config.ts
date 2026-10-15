import { readJson } from './utils/fsx.js';

export interface Config {
  auth: { cookieFile: string };
  output: {
    root: string;
    filenameTemplate: string;
    partSuffix: 'auto' | 'always' | 'never';
    groupMultiP: boolean;
    perFolderMetadata: boolean;
    sidecarMeta: boolean;
    nfo: boolean;
    writeContainerTags: boolean;
    preferNonDefaultFolder: boolean;
    excludedFolders: string[];
    upDirTemplate: string;
  };
  scan: { includeCollectedFolders: boolean; resourceOrder: 'mtime' | 'view' };
  download: {
    orderBy: 'favTime' | 'pubDate';
    maxParallelTasks: number;
    maxStreamsPerTask: number;
    maxGlobalRequests: number;
    maxSpeed: string | null;
    requestIntervalMs: number;
    retry: number;
    quality: string;
    maxResolution: string;
    preferHdr: boolean;
    preferHighFps: boolean;
    codec: 'auto' | 'avc' | 'hevc' | 'av1';
    audioQuality: string;
    fnval: number;
    pages: 'all' | 'collected' | 'first';
    skipExisting: boolean;
    folderPick: 'non-default-first' | 'newest' | 'first';
    linkMode: 'first' | 'hardlink' | 'copy';
    minFreeDiskGB: number;
  };
  timeout: {
    connectMs: number;
    headersMs: number;
    idleMs: number;
    stallMs: number;
    stallSampleWindowMs: number;
    minSpeedBps: number;
    stallGraceMs: number;
    taskMs: number;
    muxIdleMs: number;
    apiMs: number;
  };
  queue: {
    retryHeadUntil: number;
    backoffBaseMs: number;
    backoffMaxMs: number;
    flushIntervalMs: number;
    heartbeatMs: number;
    shutdownGraceMs: number;
  };
  mux: {
    container: 'mp4' | 'mov';
    maxParallel: number;
    strategy: 'auto' | 'concat-bytes' | 'concat-demuxer' | 'remux';
    forceTranscode: boolean;
    faststart: boolean;
    maxPendingGB: number;
  };
  danmaku: { enabled: boolean; formats: ('ass' | 'srt')[]; maxOverlap: number };
  engines: {
    mode: 'auto' | 'native' | 'ytdlp';
    ytdlp: { enabled: boolean; path: string | null; autoDownload: boolean; autoUpdateCheck: boolean; concurrentFragments: number };
    failover: {
      afterFailures: number;
      errorCodes: string[];
      systemicWindow: number;
      systemicThreshold: number;
      cooldownTasks: number;
      backToPrimaryAfter: number;
    };
  };
  control: { host: string; port: number; openBrowser: boolean; stateFlushMs: number };
}

export const DEFAULT_CONFIG: Config = {
  auth: { cookieFile: '.local/cookies.json' },
  output: {
    root: 'outputs',
    filenameTemplate: '{title} [P{p}] [{bvid}]',
    partSuffix: 'auto',
    groupMultiP: false,
    perFolderMetadata: true,
    sidecarMeta: true,
    nfo: false,
    writeContainerTags: true,
    preferNonDefaultFolder: true,
    excludedFolders: [],
    upDirTemplate: 'up/{up}({mid})',
  },
  scan: { includeCollectedFolders: false, resourceOrder: 'mtime' },
  download: {
    orderBy: 'favTime',
    maxParallelTasks: 3,
    maxStreamsPerTask: 3,
    maxGlobalRequests: 9,
    maxSpeed: null,
    requestIntervalMs: 800,
    retry: 3,
    quality: 'best',
    maxResolution: '8K',
    preferHdr: true,
    preferHighFps: true,
    codec: 'auto',
    audioQuality: 'best',
    fnval: 4048,
    pages: 'all',
    skipExisting: true,
    folderPick: 'non-default-first',
    linkMode: 'first',
    minFreeDiskGB: 5,
  },
  timeout: {
    connectMs: 10_000,
    headersMs: 15_000,
    idleMs: 20_000,
    stallMs: 60_000,
    stallSampleWindowMs: 10_000,
    minSpeedBps: 8192,
    stallGraceMs: 15_000,
    taskMs: 1_800_000,
    muxIdleMs: 300_000,
    apiMs: 10_000,
  },
  queue: {
    retryHeadUntil: 1,
    backoffBaseMs: 30_000,
    backoffMaxMs: 600_000,
    flushIntervalMs: 500,
    heartbeatMs: 5_000,
    shutdownGraceMs: 10_000,
  },
  mux: { container: 'mp4', maxParallel: 3, strategy: 'auto', forceTranscode: false, faststart: true, maxPendingGB: 5 },
  danmaku: { enabled: true, formats: ['ass', 'srt'], maxOverlap: 3 },
  engines: {
    mode: 'auto',
    ytdlp: { enabled: true, path: null, autoDownload: true, autoUpdateCheck: true, concurrentFragments: 3 },
    failover: {
      afterFailures: 2,
      errorCodes: ['PARSE_PLAYURL', 'NO_STREAM', 'HLS_KEY_FAIL', 'JOIN_FAIL', 'RANGE_NOT_SUPPORTED', 'MUX_FAIL', 'HTTP_5XX'],
      systemicWindow: 20,
      systemicThreshold: 3,
      cooldownTasks: 5,
      backToPrimaryAfter: 10,
    },
  },
  control: { host: '127.0.0.1', port: 8765, openBrowser: true, stateFlushMs: 500 },
};

type DeepPartial<T> = { [K in keyof T]?: T[K] extends object ? DeepPartial<T[K]> : T[K] };

function merge<T>(base: T, patch: DeepPartial<T> | null | undefined): T {
  if (!patch) return base;
  const out: Record<string, unknown> = { ...(base as Record<string, unknown>) };
  for (const [k, v] of Object.entries(patch)) {
    if (v && typeof v === 'object' && !Array.isArray(v)) {
      out[k] = merge((base as Record<string, unknown>)[k] ?? {}, v as never);
    } else if (v !== undefined) {
      out[k] = v;
    }
  }
  return out as T;
}

let cached: Config | null = null;

export async function loadConfig(file = 'config.json'): Promise<Config> {
  const fromFile = await readJson<DeepPartial<Config>>(file);
  cached = merge(DEFAULT_CONFIG, fromFile);
  return cached;
}

export function getConfig(): Config {
  if (!cached) {
    cached = DEFAULT_CONFIG;
  }
  return cached;
}

export function setConfig(next: Config): void {
  cached = next;
}
