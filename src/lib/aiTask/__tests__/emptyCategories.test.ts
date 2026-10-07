import { describe, expect, it } from 'vitest';
import { emptyCategories } from '../emptyCategories';
import type { DayStripRow } from '../../../types/timeBridge';

const cell = (date: string, has: boolean, value: number | null = null) => ({ date, has, value, unit: null, workout_ids: [] });
const row = (category: DayStripRow['category'], cells: ReturnType<typeof cell>[]): DayStripRow => ({ category, metric: null, cells } as DayStripRow);

describe('一天记录都没有的类别', () => {
  it('整行没有记录也没有读数才算空；有一天有记录就不算', () => {
    const rows = [
      row('body', [cell('2026-10-01', false), cell('2026-10-02', false)]),
      row('sleep', [cell('2026-10-01', false), cell('2026-10-02', true, 420)]),
      row('workout', [cell('2026-10-01', true)]),
    ];
    expect([...emptyCategories(rows)]).toEqual(['body']);
  });

  it('还没取到条带（没有格子）不当成空：不能因为没加载就把类别默认取消', () => {
    expect(emptyCategories([row('body', [])]).size).toBe(0);
  });
});
