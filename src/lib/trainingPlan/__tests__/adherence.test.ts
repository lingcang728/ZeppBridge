import { expect,it } from 'vitest';
import { adherenceScale,plannedColumns } from '../adherence';
import type { AdherenceDay } from '../../../types/timeBridge';
import { stripColumns } from '../../aiTask/strip';
it('uses one duration scale without making unknown planned durations into zero', () => {
  const columns=stripColumns([{date:'2026-10-04',value:30,has:true,unit:'min',workout_ids:['run']}],7);
  const comparison: AdherenceDay={ date:'2026-10-04', planned:{name:'Run',sport:'running',seconds:3600,hr_low:null,hr_high:null},actual:[],verdict:'missed' };
  const max=adherenceScale(columns,[comparison]); expect(max).toBe(60);
  expect(plannedColumns(columns,[comparison],max)[0].height).toBe(29);
  comparison.planned!.seconds=null; expect(plannedColumns(columns,[comparison],max)).toEqual([]);
});
