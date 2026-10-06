import { describe, expect, it } from 'vitest';
import { reactive } from 'vue';
import { moveDay, deleteDay, retypeWorkout, deleteWorkout } from '../reshape';
import type { PlanDocument } from '../../../types/trainingPlan';
const document = (): PlanDocument => ({ from:'2026-10-04',to:'2026-10-10',summary:'A week',workouts:[{date:'2026-10-05',name:'Run',sport:'running',steps:[{kind:'active',duration:'30min',target:'hr 120-140'}]}],rest:[{date:'2026-10-04',bedtime:'22:30',sleepTarget:'8h30m',note:'Recover'}] });
describe('whole-day reshaping', () => {
  it('swaps a workout and a rest day without mutating a reactive document', () => {
    const source = reactive(document());
    const swapped = moveDay(source,'2026-10-05','2026-10-04');
    expect(swapped.workouts[0].date).toBe('2026-10-04');
    expect(swapped.rest?.[0]).toEqual({...source.rest![0],date:'2026-10-05'});
    expect(source.workouts[0].date).toBe('2026-10-05');
    swapped.workouts[0].steps.length = 0;
    expect(source.workouts[0].steps).toHaveLength(1);
  });
  it('deletes both local notes and workouts, retaining the declared clearing range', () => {
    const source = document(); source.rest!.push({date:'2026-10-05',note:'Early night'});
    const next = deleteDay(source,'2026-10-05');
    expect(next.workouts).toEqual([]); expect(next.rest).toHaveLength(1); expect(next.to).toBe(source.to);
  });
  it('does not move a day beyond the plan range', () => { expect(moveDay(document(),'2026-10-05','2026-10-03')).toEqual(document()); });
});
describe('fixing a workout the watch cannot take', () => {
  const walk = (): PlanDocument => ({ workouts: [
    { date: '2026-10-05', sport: 'walking', name: 'Long walk', focus: 'Recovery', description: 'Easy', steps: [{ kind: 'active', duration: '60min' }] },
    { date: '2026-10-05', sport: 'running', variant: 'treadmill', name: 'Strides', focus: 'Speed', description: 'Short', steps: [{ kind: 'active', duration: '10min' }] },
  ] });
  it('changes only that workout to a deliverable family and drops a sub type that does not fit', () => {
    const source = walk();
    const next = retypeWorkout(source, 0, 'cycling', 'indoor');
    expect(next.workouts[0]).toMatchObject({ sport: 'cycling', variant: 'indoor', name: 'Long walk' });
    expect(source.workouts[0].sport).toBe('walking');
    expect(retypeWorkout(source, 1, 'cycling').workouts[1].variant).toBeUndefined();
    expect(retypeWorkout(source, 1, 'running').workouts[1].variant).toBe('treadmill');
  });
  it('removes one workout without touching the other on the same day', () => {
    const next = deleteWorkout(walk(), 0);
    expect(next.workouts).toHaveLength(1);
    expect(next.workouts[0].name).toBe('Strides');
  });
});
