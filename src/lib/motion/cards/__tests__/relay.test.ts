import { describe, expect, it } from 'vitest';
import { relay } from '../reversible';

/** 只够 relay 用的假 Animation：剩多少毫秒、播放速度、playState。 */
const fake = (left: number) => {
  let resolve: () => void = () => undefined;
  const a = {
    playbackRate: 1,
    playState: 'running' as AnimationPlayState,
    pending: false,
    effect: { getComputedTiming: () => ({ endTime: 1000, localTime: 1000 - left }) },
    finished: new Promise<void>((r) => { resolve = r; }),
    updatePlaybackRate(rate: number) { this.playbackRate = rate; },
    done() { this.playState = 'finished'; resolve(); },
  };
  return a;
};

describe('打断接力', () => {
  it('新指令换号，旧编排的号作废', () => {
    const r = relay();
    const first = r.handoff();
    expect(r.live(first)).toBe(true);
    const second = r.handoff();
    expect(r.live(first)).toBe(false);
    expect(r.live(second)).toBe(true);
  });

  it('在飞的动画从此刻在 120ms 里收尾（只加快，不跳）', () => {
    const r = relay();
    const a = fake(600);
    r.track(a as unknown as Animation);
    expect(r.moving).toBe(true);
    r.handoff();
    expect(a.playbackRate).toBeCloseTo(5, 5);
    // 已经快放完的不再加速。
    const b = fake(60);
    r.track(b as unknown as Animation);
    r.handoff();
    expect(b.playbackRate).toBe(1);
  });

  it('放完的动画不再算「在动」', async () => {
    const r = relay();
    const a = fake(300);
    r.track(a as unknown as Animation);
    a.done();
    await a.finished;
    await Promise.resolve();
    expect(r.moving).toBe(false);
  });
});
