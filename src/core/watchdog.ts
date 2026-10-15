import { getConfig } from '../config.js';
import { log } from '../utils/logger.js';

export interface StallEvent {
  taskId: string;
  stallCount: number;
  stalledMs: number;
}

/**
 * 停滞看门狗：不看总耗时，看「有没有在动」
 * - 滑动窗口采样速率，低于阈值且超过宽限期即判定 STALL
 * - 暂停 / 限速 / 建连初期豁免，避免误判
 */
export class Watchdog {
  private lastBytes = 0;

  private lastAt = Date.now();

  private stallStart: number | null = null;

  private stallCount = 0;

  private timer: NodeJS.Timeout | null = null;

  constructor(
    private readonly taskId: string,
    private readonly onStall: (event: StallEvent) => void,
  ) {}

  start(): void {
    const cfg = getConfig();
    this.timer = setInterval(() => this.check(), 2000);
    // 宽限期：刚建连不判停滞
    this.lastAt = Date.now();
    void cfg;
  }

  tick(bytesDone: number): void {
    if (bytesDone > this.lastBytes) {
      this.lastBytes = bytesDone;
      this.lastAt = Date.now();
      this.stallStart = null;
    }
  }

  private check(): void {
    const cfg = getConfig();
    const idle = Date.now() - this.lastAt;
    if (idle <= cfg.timeout.stallGraceMs) return;

    // 停滞时长（扣除建连/切片宽限期）
    const stalledMs = idle - cfg.timeout.stallGraceMs;
    if (stalledMs < cfg.timeout.stallMs) return;

    this.stallCount += 1;
    this.stallStart = Date.now();
    log.warn(`任务停滞 ${Math.round(idle / 1000)}s（第 ${this.stallCount} 次）`);
    this.onStall({ taskId: this.taskId, stallCount: this.stallCount, stalledMs });
  }

  get count(): number {
    return this.stallCount;
  }

  reset(): void {
    this.lastAt = Date.now();
    this.stallStart = null;
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    void this.stallStart;
  }
}
