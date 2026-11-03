import { describe, expect, it } from 'vitest';
import {
  ALL_HISTORY_DAYS, HISTORY_LIMIT_DAYS, backfillStartDate, defaultCustomFrom, earliestBackfillDate,
  type BackfillChoice,
} from '../backfillRange';
import { daysInMonth, wheelDateValue } from '../wheel/momentum';

/** 按后端的算法核一遍：起点到「今天（UTC 日）」不超过上限，且起点不晚于今天。 */
const backendAccepts = (from: string, utcToday: string): boolean => {
  const days = (Date.parse(`${utcToday}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000;
  return days >= 0 && days <= HISTORY_LIMIT_DAYS;
};

const iso = (date: Date) => date.toISOString().slice(0, 10);
const shift = (day: string, days: number) => iso(new Date(Date.parse(`${day}T00:00:00Z`) + days * 86_400_000));

describe('补拉起点（#136）', () => {
  const todays = [new Date(2026, 9, 19), new Date(2028, 1, 29), new Date(2026, 0, 1), new Date(2026, 11, 31)];

  it('五种选择都能算出后端认的日期——本地日与 UTC 日差一天也不越界', () => {
    for (const today of todays) {
      const local = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
      const choices: BackfillChoice[] = ['1y', '2y', '3y', 'all', 'custom'];
      for (const choice of choices) {
        const from = backfillStartDate(choice, today, defaultCustomFrom(today));
        expect(from, `${choice} @ ${local}`).toMatch(/^\d{4}-\d{2}-\d{2}$/);
        // 西半球晚上 UTC 已经是明天，东半球清晨 UTC 还是昨天。
        for (const utcToday of [shift(local, -1), local, shift(local, 1)]) {
          expect(backendAccepts(from, utcToday), `${choice} @ ${local} vs UTC ${utcToday}`).toBe(true);
        }
      }
    }
  });

  it('「全部」按天数对齐上限，而不是往回退十个日历年', () => {
    const today = new Date(2026, 9, 19);
    expect(backfillStartDate('all', today, '')).toBe(earliestBackfillDate(today));
    expect(ALL_HISTORY_DAYS).toBeLessThan(HISTORY_LIMIT_DAYS);
    // 往回退十个日历年会是 2016-10-19：3652 天，正是 #136 里被拒的那个。
    expect(backfillStartDate('all', today, '')).not.toBe('2016-10-19');
  });

  it('自定义起点：空值给空串（界面提示先选日期），太早的钳到下界', () => {
    const today = new Date(2026, 9, 19);
    expect(backfillStartDate('custom', today, '')).toBe('');
    expect(backfillStartDate('custom', today, 'not-a-date')).toBe('');
    expect(backfillStartDate('custom', today, '2001-01-01')).toBe(earliestBackfillDate(today));
    expect(backfillStartDate('custom', today, '2024-05-06')).toBe('2024-05-06');
    expect(defaultCustomFrom(today)).toBe('2025-10-19');
  });
});

describe('滚轮日期的初值（#136：自定义起点一片空白）', () => {
  /** 和 WheelDatePicker 同样的拆法：拆不出数字，年列就是 `Array.from({ length: NaN })`。 */
  const columns = (value: string) => {
    const [y, m, d] = value.split('-').map(Number);
    return { years: y! - (y! - 10) + 1, months: 12, days: daysInMonth(y!, m!), d: d! };
  };

  it('空串和乱码都不当作日期，三列都不为空', () => {
    for (const model of ['', null, undefined, 'garbage']) {
      const value = wheelDateValue(model, undefined, '2026-10-19');
      expect(value).toBe('2026-10-19');
      const col = columns(value);
      expect(col.years).toBeGreaterThan(0);
      expect(col.days).toBeGreaterThan(0);
      expect(Number.isFinite(col.d)).toBe(true);
    }
  });

  it('没有值时退到 min；有值照用', () => {
    expect(wheelDateValue('', '2020-01-01', '2026-10-19')).toBe('2020-01-01');
    expect(wheelDateValue('2024-02-29', '2020-01-01', '2026-10-19')).toBe('2024-02-29');
  });
});
