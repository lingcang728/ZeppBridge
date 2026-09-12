import { afterEach, describe, expect, it } from 'vitest';
import { displayDateTimeFormatter, parseDisplayDate, setDateOrder, setTimeFormat } from '../dateTime';
import { formatTime } from '../format';

afterEach(() => { setDateOrder('regional'); setTimeFormat('regional'); });
describe('local display policy', () => {
  it('keeps a calendar date at local midnight and rejects impossible dates', () => {
    const date = parseDisplayDate('2026-09-12');
    expect([date.getFullYear(), date.getMonth(), date.getDate(), date.getHours()]).toEqual([2026, 8, 12, 0]);
    expect(parseDisplayDate('2026-02-30').getTime()).toBeNaN();
  });
  it('uses the same hour cycle for clocks and date/time displays', () => {
    setTimeFormat('24h');
    expect(formatTime(new Date(2026, 8, 12, 0, 15).toISOString())).toBe('00:15');
    setTimeFormat('12h');
    const parts = displayDateTimeFormatter({ hour: '2-digit', minute: '2-digit', hour12: false }).formatToParts(new Date(2026, 8, 12, 13, 15));
    expect(parts.find(p => p.type === 'hour')?.value).toBe('01');
    expect(parts.some(p => p.type === 'dayPeriod')).toBe(true);
  });
  it('respects explicit date order without moving the date', () => {
    setDateOrder('ymd');
    expect(displayDateTimeFormatter({ year: 'numeric', month: 'short', day: 'numeric' }).format(parseDisplayDate('2026-09-12'))).toBe('2026-09-12');
  });
  it.each([
    ['Europe/London', '2026-03-29T00:30:00Z', '00:30'],
    ['Europe/London', '2026-03-29T01:30:00Z', '02:30'],
    ['Europe/London', '2026-10-25T01:30:00Z', '01:30'],
    ['America/New_York', '2026-03-08T06:30:00Z', '01:30'],
    ['America/New_York', '2026-03-08T07:30:00Z', '03:30'],
    ['Asia/Shanghai', '2026-03-29T01:30:00Z', '09:30'],
  ])('renders absolute timestamps in %s at %s', (timeZone, input, expected) => {
    setTimeFormat('24h');
    expect(displayDateTimeFormatter({ timeZone, hour: '2-digit', minute: '2-digit' }).format(parseDisplayDate(input))).toBe(expected);
  });
});
