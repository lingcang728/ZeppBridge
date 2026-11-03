import { describe, expect, it } from 'vitest';
import {
  addSample, estimateVelocity, GLIDE_TAU_MS, glideStep, resist, RUBBER_C, rubberBand, SPRING_MS, springSettled, springStep,
  STOPPED_MS, unresist, unrubberBand, VELOCITY_WINDOW_MS, type Motion, type Sample,
} from '../journal/timelineDrag';

describe('estimateVelocity', () => {
  it('匀速拖：就是那个速度', () => {
    const samples: Sample[] = [];
    for (let t = 0; t <= 200; t += 8) addSample(samples, t, 100 + t * 1.5);
    expect(estimateVelocity(samples, 200)).toBeCloseTo(1.5, 6);
  });

  it('最后一个事件挪得很少也不会把速度算成 0（旧做法只看最后一段）', () => {
    const samples: Sample[] = [];
    for (let t = 0; t <= 64; t += 8) addSample(samples, t, t * 2);
    addSample(samples, 66, 64 * 2 + 0.2);
    expect(estimateVelocity(samples, 66)).toBeGreaterThan(1.5);
  });

  it('只看最近 80ms：更早的慢动作不拖后腿', () => {
    const samples: Sample[] = [];
    for (let t = 0; t <= 300; t += 10) addSample(samples, t, t < 200 ? t * 0.1 : 20 + (t - 200) * 3);
    expect(estimateVelocity(samples, 300)).toBeCloseTo(3, 6);
  });

  it('手停住一会儿再松开：速度是 0，不会突然滑走', () => {
    const samples: Sample[] = [];
    for (let t = 0; t <= 100; t += 8) addSample(samples, t, t * 2);
    expect(estimateVelocity(samples, 96 + STOPPED_MS + 1)).toBe(0);
  });

  it('移动完马上松手：照最后那段的速度，不因为松手晚到一点就打折', () => {
    const samples: Sample[] = [];
    for (let t = 0; t <= 96; t += 16) addSample(samples, t, t * 0.8);
    expect(estimateVelocity(samples, 96 + 30)).toBeCloseTo(0.8, 6);
  });

  it('不到两个采样、或时间全挤在一点：0', () => {
    expect(estimateVelocity([], 0)).toBe(0);
    expect(estimateVelocity([{ t: 5, x: 3 }], 5)).toBe(0);
    expect(estimateVelocity([{ t: 5, x: 3 }, { t: 5, x: 9 }], 5)).toBe(0);
  });

  it('采样不会无限攒下去', () => {
    const samples: Sample[] = [];
    for (let t = 0; t < 10_000; t += 4) addSample(samples, t, t);
    expect(samples.length).toBeLessThan(VELOCITY_WINDOW_MS);
  });
});

describe('rubberBand / resist', () => {
  const d = 1000;
  it('起步跟手（斜率 c），越拉越沉，永远到不了视口那么宽', () => {
    expect(rubberBand(0, d)).toBe(0);
    expect(rubberBand(1, d)).toBeCloseTo(RUBBER_C, 2);
    let prev = 0;
    for (const x of [50, 100, 300, 1000, 5000, 1e6]) {
      const y = rubberBand(x, d);
      expect(y).toBeGreaterThan(prev);
      expect(y).toBeLessThan(x);
      expect(y).toBeLessThan(d);
      prev = y;
    }
    expect(rubberBand(-300, d)).toBeCloseTo(-rubberBand(300, d), 9);
  });

  it('反函数能还原', () => {
    for (const x of [-800, -10, 0, 3, 120, 640]) expect(unrubberBand(rubberBand(x, d), d)).toBeCloseTo(x, 6);
  });

  it('范围里原样跟手，两头外面才有阻力', () => {
    expect(resist(250, 0, 500, d)).toBe(250);
    expect(resist(-100, 0, 500, d)).toBeCloseTo(-rubberBand(100, d), 9);
    expect(resist(700, 0, 500, d)).toBeCloseTo(500 + rubberBand(200, d), 9);
    for (const raw of [-400, -1, 0, 250, 500, 512, 900]) expect(unresist(resist(raw, 0, 500, d), 0, 500, d)).toBeCloseTo(raw, 6);
  });

  it('没地方拖（max = 0）也有橡皮筋，两头都拉得动', () => {
    expect(resist(80, 0, 0, d)).toBeGreaterThan(0);
    expect(resist(-80, 0, 0, d)).toBeLessThan(0);
  });
});

describe('glideStep', () => {
  const run = (v: number, frame: number) => {
    let m: Motion = { x: 0, v };
    for (let t = 0; t < GLIDE_TAU_MS * 12; t += frame) m = glideStep(m, frame);
    return m;
  };
  it('滑出去「速度 × 时间常数」那么远，越来越慢', () => {
    expect(run(2, 16).x).toBeCloseTo(2 * GLIDE_TAU_MS, 0);
    const a = glideStep({ x: 0, v: 2 }, 16), b = glideStep(a, 16);
    expect(b.v).toBeLessThan(a.v);
    expect(b.x - a.x).toBeLessThan(a.x);
  });
  it('帧长不同，滑到的地方一样', () => {
    expect(run(1.2, 8).x).toBeCloseTo(run(1.2, 32).x, 3);
  });
});

describe('springStep', () => {
  const settle = (start: Motion, target: number, frame = 16) => {
    let m = start, t = 0, peak = start.x;
    while (!springSettled(m, target) && t < 5000) { m = springStep(m, target, frame); t += frame; peak = Math.max(peak, m.x); }
    return { m, t, peak };
  };

  it('静止起步：大约 SPRING_MS 落定，不冲过头', () => {
    const { t, peak, m } = settle({ x: 600, v: 0 }, 500);
    expect(t).toBeLessThanOrEqual(SPRING_MS * 1.3);
    expect(t).toBeGreaterThan(SPRING_MS * 0.5);
    expect(m.x).toBeCloseTo(500, 0);
    // 临界阻尼：从上面落下来，一路不会低于终点。
    let x: Motion = { x: 600, v: 0 };
    for (let i = 0; i < 60; i++) { x = springStep(x, 500, 16); expect(x.x).toBeGreaterThan(500 - 1e-9); }
    expect(peak).toBe(600);
  });

  it('滑行冲过界：带着速度往外冲一小段，再回来', () => {
    const { peak, m } = settle({ x: 500, v: 2 }, 500);
    expect(peak).toBeGreaterThan(510);
    expect(peak).toBeLessThan(200 + 500);
    expect(m.x).toBeCloseTo(500, 0);
  });

  it('帧长不影响走到哪', () => {
    let a: Motion = { x: 0, v: -1 }, b: Motion = { x: 0, v: -1 };
    for (let i = 0; i < 16; i++) a = springStep(a, 120, 8);
    for (let i = 0; i < 4; i++) b = springStep(b, 120, 32);
    expect(a.x).toBeCloseTo(b.x, 6);
    expect(a.v).toBeCloseTo(b.v, 6);
  });
});
