import { describe, expect, it } from 'vitest';
import { SPRINGS, springCurve } from '../spring';

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
});
