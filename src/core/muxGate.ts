/**
 * 全局转码闸门：暂停后，流水线在「下载完成 → 封装」之间等待，已下载的分片不丢。
 * 与下载队列（DownloadQueue）相互独立，可分别暂停/继续。
 */
let paused = false;
const waiters = new Set<() => void>();

export function setMuxPaused(next: boolean): void {
  if (paused === next) return;
  paused = next;
  if (!paused) {
    for (const w of waiters) w();
    waiters.clear();
  }
}

export function isMuxPaused(): boolean {
  return paused;
}

/** 在封装前调用；暂停时挂起直到恢复 */
export async function waitMuxGate(): Promise<void> {
  if (!paused) return;
  await new Promise<void>((resolve) => waiters.add(resolve));
}
