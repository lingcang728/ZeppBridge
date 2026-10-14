import { describe, expect, it } from 'vitest';
import { reactive } from 'vue';
import { moveDay, deleteDay, retypeWorkout, deleteWorkout, insertDay, absorbPlanned } from '../reshape';
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
describe('inserting a day into a gap', () => {
  const week = (): PlanDocument => ({ from: '2026-10-05', to: '2026-10-11', workouts: [
    { date: '2026-10-05', sport: 'running', name: 'A', steps: [] },
    { date: '2026-10-06', sport: 'running', name: 'B', steps: [] },
    { date: '2026-10-08', sport: 'running', name: 'C', steps: [] },
  ], rest: [{ date: '2026-10-07', note: 'rest' }] });
  const byDate = (doc: PlanDocument) => Object.fromEntries(doc.workouts.map(w => [w.name, w.date]));
  it('moving later shifts the days in between one day earlier, rest notes included', () => {
    const next = insertDay(week(), '2026-10-05', '2026-10-07');
    expect(byDate(next)).toEqual({ A: '2026-10-07', B: '2026-10-05', C: '2026-10-08' });
    expect(next.rest?.[0]?.date).toBe('2026-10-06');
  });
  it('moving earlier shifts the days in between one day later', () => {
    const next = insertDay(week(), '2026-10-08', '2026-10-05');
    expect(byDate(next)).toEqual({ A: '2026-10-06', B: '2026-10-07', C: '2026-10-05' });
    expect(next.rest?.[0]?.date).toBe('2026-10-08');
  });
  it('refuses to push a day outside the declared range', () => {
    expect(insertDay(week(), '2026-10-05', '2026-10-12')).toEqual(week());
  });
});
describe('editing a day the draft does not cover', () => {
  // 10-14 用户的真实情形：草稿只写了 16 号（已被删空），周视图里 18、20 号是已发到手表的计划。
  const draft = (): PlanDocument => ({ from: '2026-10-16', to: '2026-10-16', workouts: [] });
  const planned = [
    { date: '2026-10-13', sport: 'running' as const, name: 'Past', steps: [] },
    { date: '2026-10-16', sport: 'running' as const, name: 'Covered', steps: [] },
    { date: '2026-10-18', sport: 'cycling' as const, name: 'Ride', steps: [] },
    { date: '2026-10-20', sport: 'running' as const, name: 'Run', steps: [] },
  ];
  it('pulls the sent workouts into the draft so deleting the day actually removes it', () => {
    const widened = absorbPlanned(draft(), planned, ['2026-10-18'], '2026-10-14');
    expect(widened.from).toBe('2026-10-16');
    expect(widened.to).toBe('2026-10-18');
    expect(widened.workouts.map(w => w.name)).toEqual(['Ride']);
    expect(deleteDay(widened, '2026-10-18').workouts).toEqual([]);
  });
  it('swapping with a day outside the range works instead of silently refusing', () => {
    const widened = absorbPlanned(draft(), planned, ['2026-10-20', '2026-10-17'], '2026-10-14');
    const swapped = moveDay(widened, '2026-10-20', '2026-10-17');
    expect(swapped.workouts.map(w => [w.name, w.date])).toEqual([['Ride', '2026-10-18'], ['Run', '2026-10-17']]);
  });
  it('leaves a draft alone when the day is already inside it, and never pulls in past days', () => {
    const inside = absorbPlanned(draft(), planned, ['2026-10-16'], '2026-10-14');
    expect(inside).toEqual(draft());
    expect(absorbPlanned(draft(), planned, ['2026-10-13'], '2026-10-14')).toEqual(draft());
  });
});
