import { describe, expect, it } from 'vitest';
import { averageRow, hourRows, rangeBounds } from '../hourlySteps';

const rows = [
  { date: '2026-09-27', hour: 8, steps: 400 },
  { date: '2026-09-29', hour: 8, steps: 200 },
  { date: '2026-09-29', hour: 20, steps: 1000 },
];

describe('hourlySteps', () => {
  it('按天：没回的小时是空，不是 0；整天没数据的一行全空', () => {
    const [today, yesterday] = hourRows(rows, '2026-09-27', '2026-09-29', false);
    expect(today!.start).toBe('2026-09-29');
    expect(today!.cells[8]).toBe(200);
    expect(today!.cells[9]).toBeNull();
    expect(yesterday!.covered).toBe(0);
    expect(yesterday!.cells.every((cell) => cell === null)).toBe(true);
  });

  it('平均只算有记录的天，那天没回的小时按 0 计', () => {
    const avg = averageRow(rows, '2026-09-27', '2026-09-29');
    expect(avg.covered).toBe(2);
    expect(avg.cells[8]).toBe(300);
    expect(avg.cells[20]).toBe(500);
    expect(avg.cells[3]).toBeNull();
  });

  it('按周从最后一天往回切', () => {
    const weeks = hourRows(rows, '2026-09-20', '2026-09-29', true);
    expect(weeks.map((row) => [row.start, row.end])).toEqual([['2026-09-23', '2026-09-29'], ['2026-09-20', '2026-09-22']]);
  });

  it('范围含今天', () => {
    expect(rangeBounds(7, new Date(2026, 8, 29))).toEqual({ start: '2026-09-23', end: '2026-09-29' });
  });
});
