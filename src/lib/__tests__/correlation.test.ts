import { describe, expect, it } from 'vitest';
import { correlate, strengthOf } from '../correlation';
import type { MetricSeriesPoint } from '../../types';

const day = (offset: number) => `2026-11-${String(offset + 1).padStart(2, '0')}`;
const series = (values: number[]): MetricSeriesPoint[] => values.map((value, index) => ({ date: day(index), value }));

describe('correlate', () => {
  const x = series([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);

  it('完全同向是 1，完全反向是 -1', () => {
    expect(correlate(x, series([2, 4, 6, 8, 10, 12, 14, 16, 18, 20, 22, 24]))!.r).toBeCloseTo(1, 10);
    expect(correlate(x, series([24, 22, 20, 18, 16, 14, 12, 10, 8, 6, 4, 2]))!.r).toBeCloseTo(-1, 10);
  });

  it('滞后一天：前一天的 x 对今天的 y', () => {
    const y = series([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
    const lagged = correlate(x, y, 1)!;
    expect(lagged.r).toBeCloseTo(1, 10);
    expect(lagged.pairs).toBe(12);
  });

  it('配对不够 10 天不给结果', () => {
    expect(correlate(series([1, 2, 3, 4, 5]), series([5, 4, 3, 2, 1]))).toBeNull();
  });

  it('有一边是常数没有相关', () => {
    expect(correlate(x, series(Array(12).fill(5)))).toBeNull();
  });

  it('缺读数的日子不参与配对', () => {
    const sparse = x.filter((_, index) => index % 2 === 0);
    expect(correlate(sparse, x)).toBeNull();
  });

  it('口语分档', () => {
    expect(strengthOf(0.1)).toBe('none');
    expect(strengthOf(-0.3)).toBe('weak');
    expect(strengthOf(0.5)).toBe('moderate');
    expect(strengthOf(-0.9)).toBe('strong');
  });
});
