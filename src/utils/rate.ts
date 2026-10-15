/** 全局请求节流：最小间隔 + 抖动，用于规避 -412 风控 */
export class RateLimiter {
  private last = 0;

  constructor(
    private readonly intervalMs: number,
    private readonly jitter = 0.3,
  ) {}

  async wait(): Promise<void> {
    const now = Date.now();
    const factor = 1 + (Math.random() * 2 - 1) * this.jitter;
    const need = this.intervalMs * factor;
    const delta = now - this.last;
    if (delta < need) {
      await new Promise((r) => setTimeout(r, need - delta));
    }
    this.last = Date.now();
  }

  /** 风控后临时放大间隔 */
  penalty(times = 3): void {
    this.last = Date.now() + this.intervalMs * (times - 1);
  }
}

export const globalLimiter = new RateLimiter(800);
