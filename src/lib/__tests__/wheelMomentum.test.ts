import { describe, expect, it } from 'vitest';
import { clampDate, daysInMonth, GAP_MS, newWheelAccel, wheelSteps } from '../wheel/momentum';

describe('wheelSteps', () => {
  it('慢慢滚：一格一项', () => {
    const s = newWheelAccel();
    expect(wheelSteps(s, 100, 0, 1000)).toBe(1);
    expect(wheelSteps(s, 100, 0, 1000 + GAP_MS + 50)).toBe(1);
    expect(wheelSteps(s, -100, 0, 2000)).toBe(-1);
  });

  it('快速连滚：越久每格走得越多，最多 8', () => {
    const s = newWheelAccel();
    const steps = Array.from({ length: 12 }, (_, i) => wheelSteps(s, 100, 0, 1000 + i * 20));
    expect(steps.slice(0, 2)).toEqual([1, 1]);
    expect(steps[4]).toBeGreaterThan(steps[0]!);
    expect(Math.max(...steps)).toBe(8);
    // 一直是非递减的：越转越快，不会忽快忽慢。
    for (let i = 1; i < steps.length; i += 1) expect(steps[i]!).toBeGreaterThanOrEqual(steps[i - 1]!);
  });

  it('换方向立刻归零，不带着加速往回冲', () => {
    const s = newWheelAccel();
    for (let i = 0; i < 8; i += 1) wheelSteps(s, 100, 0, 1000 + i * 20);
    expect(wheelSteps(s, -100, 0, 1200)).toBe(-1);
  });

  it('触控板：像素累计满一格才走，不加速', () => {
    const s = newWheelAccel();
    expect(wheelSteps(s, 10, 0, 1000)).toBe(0);
    expect(wheelSteps(s, 10, 0, 1010)).toBe(0);
    expect(wheelSteps(s, 10, 0, 1020)).toBe(1);
  });
});

describe('clampDate', () => {
  it('日子不超过当月天数，闰年二月 29 天', () => {
    expect(daysInMonth(2028, 2)).toBe(29);
    expect(clampDate(2026, 2, 31)).toBe('2026-02-28');
  });

  it('不早于 min、不晚于 max', () => {
    expect(clampDate(2026, 9, 1, '2026-09-10')).toBe('2026-09-10');
    expect(clampDate(2026, 12, 31, null, '2026-10-01')).toBe('2026-10-01');
  });
});
