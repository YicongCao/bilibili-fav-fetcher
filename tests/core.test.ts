import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, writeFile, mkdir, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { cleanTaskCache, cleanDoneCache, mediaCacheRoot } from '../src/core/cache.js';
import { isDeleted, markDeleted, restoreDeleted, deletedKey } from '../src/core/deleted.js';
import { pickPrimaryFolder } from '../src/core/scanner.js';
import { getConfig } from '../src/config.js';
import { buildAss } from '../src/danmaku/ass.js';
import { layoutDanmaku } from '../src/danmaku/layout.js';
import { safeJoin } from '../src/server/static.js';
import type { TaskRecord } from '../src/types/index.js';

let root: string;

beforeEach(async () => {
  root = await mkdtemp(path.join(tmpdir(), 'bili-test-'));
  await mkdir(path.join(root, '.state'), { recursive: true });
});
afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

function fakeStore(tasks: { id: string; stage: string }[]) {
  return {
    all: () => tasks,
  } as never;
}

describe('分片缓存清理', () => {
  it('cleanTaskCache 删除该任务的两个分片目录（主引擎 + ytdlp）', async () => {
    const id = 'abc123';
    await mkdir(path.join(mediaCacheRoot(root), id), { recursive: true });
    await mkdir(path.join(mediaCacheRoot(root), `${id}-ytdlp`), { recursive: true });
    await writeFile(path.join(mediaCacheRoot(root), id, 'video.m4s'), Buffer.alloc(2048));
    await writeFile(path.join(mediaCacheRoot(root), `${id}-ytdlp`, 'video.m4s'), Buffer.alloc(1024));

    const res = await cleanTaskCache(root, id);
    expect(res.removed).toBe(2);
    expect(res.bytes).toBeGreaterThan(0);
    await expect(stat(path.join(mediaCacheRoot(root), id))).rejects.toThrow();
  });

  it('cleanDoneCache 保留未完成任务的分片', async () => {
    const base = mediaCacheRoot(root);
    await mkdir(path.join(base, 'done-task'), { recursive: true });
    await mkdir(path.join(base, 'live-task'), { recursive: true });
    await writeFile(path.join(base, 'done-task', 'v.m4s'), Buffer.alloc(1024));
    await writeFile(path.join(base, 'live-task', 'v.m4s'), Buffer.alloc(1024));

    const store = fakeStore([{ id: 'live-task', stage: 'downloading' }]);
    const res = await cleanDoneCache(root, store);
    expect(res.removed).toBe(1);
    await expect(stat(path.join(base, 'live-task'))).resolves.toBeTruthy();
    await expect(stat(path.join(base, 'done-task'))).rejects.toThrow();
  });
});

describe('删除标记（避免重复下载）', () => {
  it('markDeleted → isDeleted → restoreDeleted 闭环', async () => {
    expect(await isDeleted(root, 'BV1', 1)).toBe(false);
    await markDeleted(root, [{ bvid: 'BV1', page: 1, title: 't', at: Date.now() }]);
    expect(await isDeleted(root, 'BV1', 1)).toBe(true);
    expect(await isDeleted(root, 'BV1', 2)).toBe(false);
    expect(deletedKey('BV1', 2)).toBe('BV1:2');
    expect(await restoreDeleted(root, ['BV1:1'])).toBe(1);
    expect(await isDeleted(root, 'BV1', 1)).toBe(false);
  });
});

describe('多收藏夹归属决策', () => {
  const folders = [
    { fid: 1, title: '默认收藏夹', count: 3, isDefault: true, kind: 'created' as const },
    { fid: 2, title: '旅行', count: 5, isDefault: false, kind: 'created' as const },
    { fid: 3, title: '科普', count: 7, isDefault: false, kind: 'created' as const },
  ];

  it('non-default-first：跳过默认收藏夹，取收藏时间最新的', () => {
    const video = {
      folders: [
        { fid: 1, title: '默认收藏夹', favTime: 300 },
        { fid: 2, title: '旅行', favTime: 100 },
        { fid: 3, title: '科普', favTime: 200 },
      ],
    };
    expect(pickPrimaryFolder(video, folders, 'non-default-first')).toEqual({ fid: 3, title: '科普' });
  });

  it('只在默认收藏夹里时回退到默认夹', () => {
    const video = { folders: [{ fid: 1, title: '默认收藏夹', favTime: 300 }] };
    expect(pickPrimaryFolder(video, folders, 'non-default-first')).toEqual({ fid: 1, title: '默认收藏夹' });
  });
});

describe('弹幕字号与轨道', () => {
  it('默认 baseFontSize 为 30', () => {
    expect(getConfig().danmaku.baseFontSize).toBe(30);
  });

  // 与 finalize 一致：B 站标准 fontsize=25 按 baseFontSize/25 放大
  const scale = 50 / 25;
  const raw = [
    { time: 0, mode: 1, fontSize: 25, color: 0xffffff, text: '滚动弹幕一' },
    { time: 0, mode: 1, fontSize: 25, color: 0xffffff, text: '滚动弹幕二' },
    { time: 0, mode: 5, fontSize: 25, color: 0xffffff, text: '顶部弹幕' },
  ];
  const placed = layoutDanmaku(
    raw.map((it) => ({ ...it, fontSize: Math.round((it.fontSize ?? 25) * scale) })),
    { width: 1920, height: 1080, baseFontSize: 50 },
  );
  const ass = buildAss(placed, { width: 1920, height: 1080, baseFont: 50 });

  it('标准弹幕放大到 baseFontSize（50）落盘', () => {
    expect(ass).toContain('\\fs50');
    expect(ass).toContain('PlayResX: 1920');
  });

  it('Style 里的字号跟着 baseFont', () => {
    expect(ass).toMatch(/Style: Default,[^,]+,50,/);
  });

  it('轨道高度随字号放大（50 号字 → 轨距 60），避免压字', () => {
    const ys = [...ass.matchAll(/\\move\(-?\d+,(\d+),/g)].map((m) => Number(m[1]));
    expect(ys.length).toBe(2);
    expect(ys[1] - ys[0]).toBe(60);
  });
});

describe('静态路径安全', () => {
  it('不允许跳出 outputs 根目录', () => {
    expect(safeJoin(root, '../../etc/passwd')).toBeNull();
    expect(safeJoin(root, '/sub/video.mp4')).toBe(path.join(root, 'sub/video.mp4'));
  });
});

describe('任务记录字段', () => {
  it('TaskRecord 形状可用（编译期校验 + 基本字段）', () => {
    const task: TaskRecord = {
      id: 'x',
      source: 'favorite',
      bvid: 'BV1',
      aid: 1,
      cid: 2,
      page: 1,
      title: 't',
      up: { mid: 1, name: 'u' },
      orderKey: 1,
      outDir: 'd',
      baseName: 'b',
      container: 'mp4',
      stage: 'queued',
      priority: 0,
      progress: { bytesDone: 0, bytesTotal: 0, speedBps: 0, etaSec: 0 },
      retryCount: 0,
      engine: 'native',
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    expect(task.stage).toBe('queued');
  });
});
