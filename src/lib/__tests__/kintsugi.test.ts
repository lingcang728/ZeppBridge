import { describe, expect, it } from 'vitest';
import { kintsugiYears } from '../kintsugi';

const today = new Date(2026, 9, 21);

describe('kintsugiYears', () => {
  it('本机只有两个月也摆满三年，前面没问过的月份是裂缝、「补上它」从最早一格开始', () => {
    const years = kintsugiYears([
      { month: '2026-09', state: 'local' },
      { month: '2026-10', state: 'local' },
    ], today, '2016-10-23');
    expect(years.map((year) => year.year)).toEqual([2026, 2025, 2024]);
    expect(years[0].cells[10].state).toBe('out');
    expect(years[0].cells[7].state).toBe('unasked');
    expect(years[2].firstGap).toBe('2024-01');
  });

  it('云端说没有的月份不是裂缝，也不给「补上它」', () => {
    const years = kintsugiYears(
      Array.from({ length: 12 }, (_, index) => ({ month: `2024-${String(index + 1).padStart(2, '0')}`, state: 'empty' as const })),
      today,
      '2016-10-23',
    );
    const y2024 = years.find((year) => year.year === 2024)!;
    expect(y2024.firstGap).toBeNull();
    expect(y2024.runs).toEqual([]);
  });

  it('相邻的金线连成一条，裂缝和金线不混在一段里；同一道缝每次画得一样', () => {
    const months = [
      { month: '2025-03', state: 'gold' as const },
      { month: '2025-04', state: 'gold' as const },
      { month: '2025-05', state: 'crack' as const },
      { month: '2025-06', state: 'local' as const },
    ];
    const a = kintsugiYears(months, today, '2016-10-23').find((year) => year.year === 2025)!;
    const b = kintsugiYears(months, today, '2016-10-23').find((year) => year.year === 2025)!;
    const gold = a.runs.find((run) => run.kind === 'gold')!;
    expect([gold.from, gold.to]).toEqual([2, 3]);
    expect(a.runs.find((run) => run.from === 4)?.kind).toBe('gap');
    expect(a.runs).toEqual(b.runs);
  });

  it('补拉下界之前的月份不画（补不到的不算裂缝）', () => {
    const years = kintsugiYears([{ month: '2016-12', state: 'gold' }], today, '2016-10-23');
    const first = years[years.length - 1];
    expect(first.year).toBe(2016);
    expect(first.cells[8].state).toBe('out');
    expect(first.cells[9].state).toBe('unasked');
  });
});
