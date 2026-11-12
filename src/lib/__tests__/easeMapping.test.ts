import { describe, expect, it } from 'vitest';
import { closeTimeFor, openTimeFor } from '../motion/dialogFlight';
import { BACK_EASE, easeAt, OPEN_EASE, timeAt, turnedEase } from '../motion/timing';

describe('easing maths used to resume an interrupted flight', () => {
  it('evaluates cubic-bezier curves and falls back to linear', () => {
    expect(easeAt(OPEN_EASE, 0)).toBeCloseTo(0, 6);
    expect(easeAt(OPEN_EASE, 1)).toBeCloseTo(1, 6);
    expect(easeAt('cubic-bezier(0, 0, 1, 1)', 0.3)).toBeCloseTo(0.3, 4);
    expect(easeAt('linear', 0.42)).toBe(0.42);
    // 收回曲线到 0.8 还在动：后段不能早早停住（落地的淡入淡出要落在仍在缩的那段上）。
    expect(easeAt(BACK_EASE, 0.8)).toBeLessThan(0.99);
    expect(easeAt(BACK_EASE, 0.5)).toBeGreaterThan(0.7);
  });

  it('timeAt inverts easeAt', () => {
    for (const x of [0.05, 0.2, 0.5, 0.77, 0.95]) {
      expect(timeAt(OPEN_EASE, easeAt(OPEN_EASE, x))).toBeCloseTo(x, 4);
      expect(timeAt(BACK_EASE, easeAt(BACK_EASE, x))).toBeCloseTo(x, 4);
    }
  });

  it('a turned curve is the same path played backwards', () => {
    const turned = turnedEase(OPEN_EASE);
    for (const x of [0.1, 0.4, 0.9]) expect(easeAt(turned, x)).toBeCloseTo(1 - easeAt(OPEN_EASE, 1 - x), 3);
  });

  it('maps a dialog between its open and close timelines without a jump', () => {
    // 两组都按「开」那条时间轴记进度（关是倒着放）：两头对两头，中间按窗口此刻的位置换算。
    expect(closeTimeFor(1)).toBeCloseTo(1, 4);
    expect(closeTimeFor(0)).toBeCloseTo(0, 4);
    const turned = turnedEase(OPEN_EASE);
    for (const p of [0.2, 0.5, 0.8]) expect(easeAt(turned, closeTimeFor(p))).toBeCloseTo(easeAt(OPEN_EASE, p), 3);
    for (const c of [0.1, 0.35, 0.6, 0.9]) expect(closeTimeFor(openTimeFor(c))).toBeCloseTo(c, 3);
  });
});
