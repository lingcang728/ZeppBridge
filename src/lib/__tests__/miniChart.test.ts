import { describe, expect, it } from 'vitest';
import { nearestByX, niceTicks, splitAtGaps, timeTicks } from '../miniChart';

describe('miniChart', () => {
  it('nice ticks cover the data range with round steps', () => {
    const ticks = niceTicks(40, 118);
    expect(ticks[0]).toBeLessThanOrEqual(40);
    expect(ticks[ticks.length - 1]).toBeGreaterThanOrEqual(118);
    const step = ticks[1] - ticks[0];
    expect([10, 20, 25, 50]).toContain(step);
  });

  it('a gap longer than the threshold breaks the line instead of bridging it', () => {
    const points = [0, 60_000, 120_000, 3_600_000, 3_660_000].map((ts) => ({ ts, value: 60 }));
    expect(splitAtGaps(points, 15 * 60_000).map((s) => s.length)).toEqual([3, 2]);
  });

  it('time ticks land on local hours or half hours and keep their spacing', () => {
    const start = new Date(2026, 8, 27, 9, 17).getTime();
    const end = new Date(2026, 8, 27, 14, 17).getTime();
    const ticks = timeTicks(start, end, 600, 56);
    expect(ticks.length).toBeGreaterThan(1);
    for (const tick of ticks) {
      expect(new Date(tick).getMinutes() % 30).toBe(0);
      expect(tick).toBeGreaterThanOrEqual(start);
      expect(tick).toBeLessThanOrEqual(end);
    }
    const px = (ticks[1] - ticks[0]) * (600 / (end - start));
    expect(px).toBeGreaterThanOrEqual(56);
  });

  it('nearestByX picks the closer neighbour', () => {
    const pts = [{ x: 0 }, { x: 10 }, { x: 30 }];
    expect(nearestByX(pts, 4)).toBe(pts[0]);
    expect(nearestByX(pts, 6)).toBe(pts[1]);
    expect(nearestByX(pts, 99)).toBe(pts[2]);
    expect(nearestByX([], 1)).toBeNull();
  });
});
