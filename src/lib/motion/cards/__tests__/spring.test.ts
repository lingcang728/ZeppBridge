import { afterEach, describe, expect, it, vi } from 'vitest';
import { springBack } from '../../popoverMorph';
import { resetLinearProbe, SPRINGS, springCurve } from '../spring';

describe('弹簧缓动', () => {
  it('从 0 走到 1，停稳时间合理，可以冲过头一点但不乱跳', () => {
    for (const spring of Object.values(SPRINGS)) {
      const { easing, duration } = springCurve(spring);
      const points = easing.slice('linear('.length, -1).split(',').map(Number);
      expect(points[0]).toBe(0);
      expect(points[points.length - 1]).toBe(1);
      expect(points).toHaveLength(41);
      expect(Math.max(...points)).toBeLessThan(1.15);
      expect(duration).toBeGreaterThan(250);
      expect(duration).toBeLessThan(1600);
    }
  });

  it('同一根弹簧只算一次', () => {
    expect(springCurve(SPRINGS.deal)).toBe(springCurve(SPRINGS.deal));
  });

  describe('引擎不认 linear() 时', () => {
    afterEach(() => {
      vi.unstubAllGlobals();
      resetLinearProbe();
    });

    it('换成三次贝塞尔，时长不变；会冲过头的弹簧用带回弹的那条', () => {
      const linear = springCurve(SPRINGS.pop);
      const settle = springCurve(SPRINGS.settle);
      vi.stubGlobal('CSS', { supports: () => false });
      resetLinearProbe();
      const pop = springCurve(SPRINGS.pop);
      expect(pop.easing).toBe('cubic-bezier(.2, 1.15, .32, 1)');
      expect(pop.duration).toBe(linear.duration);
      expect(springCurve(SPRINGS.settle)).toEqual({ easing: 'cubic-bezier(.4, .6, .2, 1)', duration: settle.duration });
      expect(springBack(SPRINGS.settle, { x: 0, y: 40 }, { x: 0, y: -0.8 }).easing.startsWith('cubic-bezier(')).toBe(true);
    });
  });
});
