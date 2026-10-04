import { expect,it } from 'vitest';
import { stripColumns } from '../strip';
import { addDays,snapRange,futureSpan } from '../bridgeScale';
it('three-day bins average only real readings and preserve missing dates and workout ids', () => {
  const cells = [10,null,20].map((value,i) => ({date:addDays('2026-10-01',i),value,has:value !== null,unit:value === null ? null : 'min',workout_ids:i === 2 ? ['run'] : []}));
  const [column] = stripColumns(cells,90);
  expect(column.value).toBe(15); expect(column.missing).toBe(1); expect(column.ids).toEqual(['run']);
  expect(stripColumns(cells.map(c=>({...c,value:null,has:false})),90)[0].value).toBeNull();
});
it('keeps true zero distinct from absent data', () => {
  const column = stripColumns([{date:'2026-10-01',has:true,value:0,unit:'load',workout_ids:[]}],7)[0];
  expect(column.value).toBe(0); expect(column.height).toBeGreaterThan(0);
});
it('snaps the range and guarantees at least seven future dates across month boundaries', () => {
  expect(snapRange(29)).toBe(30); expect(snapRange(85)).toBe(90);
  expect(addDays('2026-10-01',-1)).toBe('2026-09-30'); expect(futureSpan('2026-10-01','2026-10-02')).toBe(7);
});
