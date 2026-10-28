import { describe, expect, it } from 'vitest';
import { columnSweep, sweepDirection } from '../columnSweep';

describe('columnSweep', () => {
  it('年份变大从左往右，变小从右往左', () => {
    expect(sweepDirection(2024, 2025)).toBe(1);
    expect(sweepDirection(2025, 2023)).toBe(-1);
    const right = columnSweep(5, 1), left = columnSweep(5, -1);
    expect(right.delays).toEqual([0, 6, 12, 18, 24]);
    expect(left.delays).toEqual([24, 18, 12, 6, 0]);
  });

  it('一年的 54 列整段不超过 400ms，每列至少 120ms', () => {
    const { duration, delays } = columnSweep(54, 1);
    expect(duration).toBeGreaterThanOrEqual(120);
    expect(Math.max(...delays) + duration).toBeCloseTo(400, 0);
    expect(delays[1]! - delays[0]!).toBeGreaterThan(4);
    expect(delays[1]! - delays[0]!).toBeLessThanOrEqual(6);
  });

  it('列少时按 6ms 间隔，剩下的都给每列的时长', () => {
    expect(columnSweep(10, 1)).toEqual({ duration: 346, delays: [0, 6, 12, 18, 24, 30, 36, 42, 48, 54] });
    expect(columnSweep(1, -1)).toEqual({ duration: 400, delays: [0] });
    expect(columnSweep(0, 1).delays).toEqual([]);
  });

  it('间隔为 0 时所有列一起淡（少动模式）', () => {
    const { duration, delays } = columnSweep(54, 1, { step: 0, total: 240 });
    expect(duration).toBe(240);
    expect(new Set(delays)).toEqual(new Set([0]));
  });
});
