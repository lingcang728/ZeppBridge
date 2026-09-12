import { afterEach, describe, expect, it } from 'vitest';
import { setLocale } from '../../i18n';
import {
  calendarCells,
  calendarMonthTitle,
  calendarWeekdayNames,
  calendarWeekStart,
} from '../calendarLocale';

const CJK = /[一-鿿]/;

afterEach(() => setLocale('zh'));

describe('calendar locale follows the OS region, not the in-app language', () => {
  it('does not change when the UI language is switched', () => {
    setLocale('en');
    const withEnglishUi = calendarMonthTitle(2026, 8);
    setLocale('zh');
    const withChineseUi = calendarMonthTitle(2026, 8);
    expect(withEnglishUi).toBe(withChineseUi);
  });

  it('prints an English month title for en-US', () => {
    const title = calendarMonthTitle(2026, 8, 'en-US');
    expect(title.toLowerCase()).toContain('september');
    expect(title).toContain('2026');
    expect(title).not.toMatch(CJK);
  });

  it('prints a Chinese month title for zh-CN', () => {
    const title = calendarMonthTitle(2026, 8, 'zh-CN');
    expect(title).toMatch(/年/);
    expect(title).toMatch(/9/);
    expect(title).toContain('2026');
  });

  it('prints a German month title for de-DE, which the UI does not offer', () => {
    const title = calendarMonthTitle(2026, 2, 'de-DE');
    expect(title.toLowerCase()).toContain('märz');
    expect(title).not.toMatch(CJK);
  });

  it('keeps en-US weekday names free of CJK', () => {
    const names = calendarWeekdayNames('en-US');
    expect(names).toHaveLength(7);
    expect(names.join(' ')).not.toMatch(CJK);
    expect(names.some((name) => /sun/i.test(name))).toBe(true);
  });

  it('starts the US week on Sunday and the Chinese/German week on Monday', () => {
    expect(calendarWeekStart('en-US')).toBe(0);
    expect(calendarWeekStart('zh-CN')).toBe(1);
    expect(calendarWeekStart('de-DE')).toBe(1);
  });

  it('pads the grid so the first of the month lands on the region week start', () => {
    // 2026-09-01 is a Tuesday (getDay() === 2). Sunday-first → two blanks.
    const english = calendarCells(2026, 8, 'en-US');
    expect(english.slice(0, 2).every((cell) => cell.day === null)).toBe(true);
    expect(english[2]).toEqual({ day: 1, dateStr: '2026-09-01' });

    // Monday-first → one blank.
    const chinese = calendarCells(2026, 8, 'zh-CN');
    expect(chinese[0]?.day).toBeNull();
    expect(chinese[1]).toEqual({ day: 1, dateStr: '2026-09-01' });
  });
});
