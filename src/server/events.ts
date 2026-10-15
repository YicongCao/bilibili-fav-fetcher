import type { TaskRecord } from '../types/index.js';

export type ServerEvent =
  | { t: 'task.update'; task: TaskSummary }
  | { t: 'queue.stats'; stats: QueueSummary }
  | { t: 'log.append'; level: string; ts: number; msg: string }
  | { t: 'auth.expired' }
  | { t: 'disk.warn'; freeGB: number }
  | { t: 'config.updated'; config: unknown };

export interface TaskSummary {
  id: string;
  title: string;
  baseName: string;
  outDir: string;
  stage: string;
  progress: { bytesDone: number; bytesTotal: number; speedBps: number; etaSec: number };
  quality?: string;
  hdr?: boolean;
  fps?: number;
  engine: string;
  retryCount: number;
  error?: string;
}

export interface QueueSummary {
  status: string;
  order: number;
  remaining: number;
  inflight: number;
  delayed: number;
  done: number;
  failed: number;
  skipped: number;
  bytesDone: number;
}

export function toSummary(task: TaskRecord): TaskSummary {
  return {
    id: task.id,
    title: task.title,
    baseName: task.baseName,
    outDir: task.outDir,
    stage: task.stage,
    progress: task.progress,
    quality: task.quality?.got,
    hdr: task.quality?.hdr,
    fps: task.quality?.fps,
    engine: task.engine ?? 'native',
    retryCount: task.retryCount,
    error: task.error?.message,
  };
}

type Listener = (event: ServerEvent) => void;

export class EventBus {
  private listeners = new Set<Listener>();

  on(fn: Listener): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  emit(event: ServerEvent): void {
    for (const fn of this.listeners) {
      try {
        fn(event);
      } catch {
        /* 单个监听者异常不影响其他 */
      }
    }
  }
}

export const bus = new EventBus();
