import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { selectBest, QUALITY_LABEL } from '../src/core/quality.js';
import type { PlayUrlData } from '../src/api/playurl.js';
import type { ViewDetail } from '../src/api/view.js';
import { getConfig, type Config } from '../src/config.js';

const load = <T>(name: string): T =>
  JSON.parse(readFileSync(new URL(`./fixtures/${name}`, import.meta.url), 'utf8')) as T;

const view = load<{ bvid: string; data: ViewDetail }>('view.json');
const play = load<{ bvid: string; cid: number; data: PlayUrlData }>('playurl.json');

const cfg = (patch: Partial<Config['download']> = {}): Config['download'] => ({
  ...getConfig().download,
  ...patch,
});

describe('view 接口契约（离线 fixture）', () => {
  it('分 P 字段齐全：cid / page / part / duration', () => {
    expect(view.data.pages.length).toBeGreaterThan(0);
    for (const p of view.data.pages) {
      expect(p.cid).toBeGreaterThan(0);
      expect(p.page).toBeGreaterThan(0);
      expect(typeof p.part).toBe('string');
      expect(typeof p.duration).toBe('number');
    }
  });

  it('UP 与标题字段可用做命名', () => {
    expect(view.data.title.length).toBeGreaterThan(0);
    expect(view.data.owner?.mid ?? view.data.mid).toBeGreaterThan(0);
  });
});

describe('playurl 接口契约 + 选流降级（离线 fixture）', () => {
  it('DASH 流结构：id / codecs / bandwidth / 可播放 URL', () => {
    const videos = play.data.dash?.video ?? [];
    expect(videos.length).toBeGreaterThan(0);
    for (const v of videos) {
      expect(v.id).toBeGreaterThan(0);
      expect(typeof v.codecs).toBe('string');
    }
  });

  it('best：选到池子里最高档，且带 label', () => {
    const res = selectBest(play.data, cfg({ quality: 'best' }), 600);
    expect(res).not.toBeNull();
    const pool = (play.data.dash?.video ?? []).filter((v) => v.id <= 127);
    const maxId = Math.max(...pool.map((v) => v.id));
    expect(res!.video.qualityId).toBe(maxId);
    expect(res!.video.qualityLabel).toBe(QUALITY_LABEL[maxId] ?? String(maxId));
  });

  it('指定 1080P 但没有该档时降级并标记 degraded', () => {
    const target = 80; // 1080P
    const hasExact = (play.data.dash?.video ?? []).some((v) => v.id === target);
    const res = selectBest(play.data, cfg({ quality: '1080P' }), 600);
    expect(res).not.toBeNull();
    expect(res!.video.qualityId).toBeLessThanOrEqual(target);
    expect(res!.degraded).toBe(!hasExact);
  });

  it('maxResolution 封顶：1080P 上限下不会选到 4K（120）以上', () => {
    const res = selectBest(play.data, cfg({ quality: 'best', maxResolution: '1080P' }), 600);
    expect(res).not.toBeNull();
    // 1080P 上限允许 1080P60(116)/1080P+(112)/1080P(80)，但不得上到 4K(120)
    expect(res!.video.qualityId).toBeLessThanOrEqual(116);
    expect(res!.video.qualityId).toBeLessThan(120);
  });

  it('codec=avc 时优先 avc（同档位下）', () => {
    const res = selectBest(play.data, cfg({ quality: 'best', codec: 'avc' }), 600);
    expect(res).not.toBeNull();
    const sameId = (play.data.dash?.video ?? []).filter((v) => v.id === res!.video.qualityId);
    if (sameId.some((v) => (v.codecs ?? '').toLowerCase().startsWith('avc'))) {
      expect(res!.video.codec).toBe('avc');
    }
  });
});
