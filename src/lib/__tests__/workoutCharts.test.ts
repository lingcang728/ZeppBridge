import { describe, expect, it } from 'vitest';
import { spannedAxis } from '../workoutCharts';

const pts = (...values: number[]) => values.map((v, i) => ({ t: i * 1000, v }));

describe('spannedAxis', () => {
  it('widens a flat altitude trace around its middle', () => {
    const axis = spannedAxis(pts(7, 12, 9), 40);
    expect(axis.max! - axis.min!).toBe(40);
    expect(axis.min).toBeLessThanOrEqual(7);
    expect(axis.max).toBeGreaterThanOrEqual(12);
  });

  it('leaves a hilly trace and other charts to ECharts', () => {
    expect(spannedAxis(pts(100, 180), 40)).toEqual({});
    expect(spannedAxis(pts(130, 140), 0)).toEqual({});
  });
});
