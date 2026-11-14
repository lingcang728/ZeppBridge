import { describe, expect, it } from 'vitest';
import { consistentAverage, paceProfile, quantile } from '../paceProfile';

const run = (values: number[]) => values.map((v, i) => ({ t: i * 10_000, v }));

describe('paceProfile', () => {
  it('drops a red-light stop from the slowest pace (user 2026-11-14: slowest 52\'05")', () => {
    const values = Array.from({ length: 60 }, (_, i) => 3.5 + (i % 6) * 0.05);
    values[30] = 52.1;
    values[31] = 40;
    const profile = paceProfile(run(values), [])!;
    expect(profile.slowest.v).toBeLessThan(4);
    expect(profile.fastest.v).toBeGreaterThanOrEqual(3.5);
    expect(profile.dropped).toBe(2);
    expect(profile.hi).toBeLessThan(4);
  });

  it('ignores samples inside pauses', () => {
    const values = Array.from({ length: 30 }, () => 5);
    values[10] = 9; values[11] = 9; values[12] = 9;
    const profile = paceProfile(run(values), [{ start: 100_000, end: 120_000 }])!;
    expect(profile.slowest.v).toBe(5);
  });

  it('keeps a genuine slow stretch that lasts', () => {
    const values = [...Array.from({ length: 30 }, () => 5), ...Array.from({ length: 10 }, () => 9), ...Array.from({ length: 30 }, () => 5)];
    expect(paceProfile(run(values), [])!.slowest.v).toBe(9);
  });

  it('a single GPS glitch is not the fastest pace', () => {
    const values = Array.from({ length: 40 }, () => 6);
    values[20] = 2.6;
    expect(paceProfile(run(values), [])!.fastest.v).toBe(6);
  });

  it('needs two moving points', () => {
    expect(paceProfile(run([5]), [])).toBeNull();
    expect(paceProfile(run([5, 5]), [{ start: 0, end: 20_000 }])).toBeNull();
  });
});

describe('consistentAverage', () => {
  // 一半 4 分、一半 6 分：同样时间里跑的距离按速度算，平均是 4.8 分而不是 5 分。
  const profile = paceProfile(run([...Array(20).fill(4), ...Array(20).fill(6)]), [])!;

  it('averages speed, not pace', () => {
    expect(profile.mean).toBeCloseTo(4.8, 5);
  });

  it('keeps the summary average when it sits between fastest and slowest', () => {
    expect(consistentAverage(profile, 5.1)).toBe(5.1);
  });

  it('never shows an average faster than the fastest (demo ride 2026-11-14: 2:23 vs 3:24)', () => {
    expect(consistentAverage(profile, 2.38)).toBeCloseTo(4.8, 5);
    expect(consistentAverage(profile, null)).toBeCloseTo(4.8, 5);
  });
});

describe('quantile', () => {
  it('interpolates', () => {
    expect(quantile([1, 2, 3, 4], 0.5)).toBe(2.5);
    expect(quantile([1, 2, 3], 0)).toBe(1);
  });
});
