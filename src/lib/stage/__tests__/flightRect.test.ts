import { describe, expect, it } from 'vitest';
import { easeOf, lerpBox, sameBox, unionBox } from '../flightRect';

describe('stage flight rects', () => {
  it('keeps every in-between frame inside the two slots, never stretched past either', () => {
    const a = { x: 184, y: 0, w: 300, h: 600 };
    const b = { x: 500, y: 0, w: 700, h: 320 };
    const hull = unionBox([a, b]);
    const ease = easeOf('cubic-bezier(.4, .6, .2, 1)');
    for (let i = 0; i <= 20; i++) {
      const r = lerpBox(a, b, ease(i / 20));
      expect(r.x).toBeGreaterThanOrEqual(hull.x - 1e-6);
      expect(r.y).toBeGreaterThanOrEqual(hull.y - 1e-6);
      expect(r.x + r.w).toBeLessThanOrEqual(hull.x + hull.w + 1e-6);
      expect(r.y + r.h).toBeLessThanOrEqual(hull.y + hull.h + 1e-6);
    }
    expect(sameBox(lerpBox(a, b, 1), b)).toBe(true);
  });

  it('samples css easings the way the browser does at the ends and midpoint', () => {
    const linear = easeOf('cubic-bezier(0, 0, 1, 1)');
    expect(linear(0.3)).toBeCloseTo(0.3, 4);
    const ease = easeOf('cubic-bezier(.25, .1, .25, 1)');
    expect(ease(0)).toBe(0);
    expect(ease(1)).toBe(1);
    expect(ease(0.5)).toBeCloseTo(0.8024, 3);
    // 带过冲的曲线中途会超过 1。
    const settle = easeOf('cubic-bezier(.3, 1.22, .4, 1)');
    expect(Math.max(...Array.from({ length: 50 }, (_, i) => settle(i / 50)))).toBeGreaterThan(1);
  });
});
