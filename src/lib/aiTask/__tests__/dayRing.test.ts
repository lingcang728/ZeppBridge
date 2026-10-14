import { describe, expect, it } from 'vitest';
import { dayRing } from '../dayRing';

const row = (patch: Partial<Parameters<typeof dayRing>[0]> = {}) => ({
  start_date: '2026-09-18',
  end_date: '2026-10-02',
  days_in_range: 15,
  covered_dates: ['2026-09-18', '2026-09-19', '2026-09-21', '2026-10-02'],
  ...patch,
});

describe('dayRing', () => {
  it('一天一格：有数据的是 1，缺的是 0，顺序从窗口第一天到最后一天', () => {
    const ring = dayRing(row());
    expect(ring?.perCell).toBe(1);
    expect(ring?.cells).toHaveLength(15);
    expect(ring?.cells.slice(0, 4)).toEqual([1, 1, 0, 1]);
    expect(ring?.cells[14]).toBe(1);
    expect(ring?.cells.filter((cell) => cell === 1)).toHaveLength(4);
  });

  it('没有 covered_dates（旧载荷）不猜，给 null', () => {
    expect(dayRing(row({ covered_dates: undefined }))).toBeNull();
  });

  it('窗口是几段不相连的并集（天数小于跨度）也不猜', () => {
    expect(dayRing(row({ days_in_range: 9 }))).toBeNull();
  });

  it('日期格式不对或终点早于起点，给 null', () => {
    expect(dayRing(row({ start_date: '2026/09/18' }))).toBeNull();
    expect(dayRing(row({ start_date: '2026-10-05' }))).toBeNull();
  });

  it('落在窗口之外的日期不算', () => {
    const ring = dayRing(row({ covered_dates: ['2026-09-01', '2026-10-30'] }));
    expect(ring?.cells.every((cell) => cell === 0)).toBe(true);
  });

  it('窗口超过 30 天：几天并成一格，用比例表示这一格里有数据的占比', () => {
    const covered = Array.from({ length: 30 }, (_, i) => `2026-07-${String(i + 1).padStart(2, '0')}`);
    const ring = dayRing({ start_date: '2026-07-04', end_date: '2026-10-01', days_in_range: 90, covered_dates: covered });
    expect(ring?.perCell).toBe(3);
    expect(ring?.cells).toHaveLength(30);
    // 7 月 4 日起的前 27 天（4–30 日）都有数据 → 前 9 格满格。
    expect(ring?.cells.slice(0, 9).every((cell) => cell === 1)).toBe(true);
    expect(ring?.cells[9]).toBe(0);
  });

  it('跨月、跨年也按真实日历数天', () => {
    const ring = dayRing({ start_date: '2025-12-30', end_date: '2026-01-02', days_in_range: 4, covered_dates: ['2025-12-31', '2026-01-01'] });
    expect(ring?.cells).toEqual([0, 1, 1, 0]);
  });
});
