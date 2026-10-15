import type { TaskRecord } from '../../types/index.js';

export interface MediaPlanResult {
  kind: 'dash' | 'segments';
  videoFile: string;
  audioFile?: string;
  segments?: string[];
  qualityLabel: string;
  hdr: boolean;
  fps: number;
  codec: string;
  width: number;
  height: number;
  degraded: boolean;
}

export interface RunHooks {
  onProgress?: (bytesDone: number, bytesTotal: number, speedBps: number) => void;
  signal?: AbortSignal;
}

export interface DownloadEngine {
  readonly name: 'native' | 'ytdlp';
  healthcheck(): Promise<{ ok: boolean; version?: string; reason?: string }>;
  plan(task: TaskRecord): Promise<MediaPlanResult & { raw?: unknown }>;
  run(task: TaskRecord, plan: MediaPlanResult & { raw?: unknown }, hooks: RunHooks): Promise<{ videoFile: string; audioFile?: string; segments?: string[] }>;
}
