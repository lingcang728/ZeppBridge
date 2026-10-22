import { describe, expect, it } from 'vitest';
import { lighterNext, scaleDuration, sportFamily } from '../lighten';
import type { PlanDocument, PlanWorkoutInput } from '../../../types/trainingPlan';

const note = (original: string | undefined) => `减 10% · ${original ?? ''}`;

const intervals: PlanWorkoutInput = {
  date: '2026-10-16', sport: 'run', name: '6×800m', focus: '速度', description: '间歇',
  steps: [
    { kind: 'warmup', duration: '15min' },
    { repeat: 6, steps: [{ kind: 'interval', duration: '800m', target: 'pace 4:00-4:10' }, { kind: 'recovery', duration: '90s' }] },
    { kind: 'cooldown', duration: '10min' },
  ],
};
const ride: PlanWorkoutInput = { date: '2026-10-15', sport: 'cycling', name: '骑', focus: '有氧', description: '轻松', steps: [{ kind: 'active', duration: '1h' }] };
const tempo: PlanWorkoutInput = { date: '2026-10-20', sport: 'running', name: '节奏跑', focus: '乳酸阈', description: '稳', steps: [{ kind: 'active', duration: '30min', target: 'hr 150-160' }] };

describe('scaleDuration', () => {
  it('按原单位凑整，读不懂的不改', () => {
    expect(scaleDuration('30min', 0.9)).toBe('27min');
    expect(scaleDuration('4min', 0.9)).toBe('215s');
    expect(scaleDuration('1h', 0.9)).toBe('54min');
    expect(scaleDuration('800m', 0.9)).toBe('720m');
    expect(scaleDuration('5km', 0.9)).toBe('4.5km');
    expect(scaleDuration('20分钟', 0.9)).toBeNull();
  });
});

describe('lighterNext', () => {
  const document: PlanDocument = { workouts: [tempo, ride, intervals] };

  it('只缩打分之后最早一条同大类训练的主体，热身、恢复、重复次数和目标不动', () => {
    const result = lighterNext(document, 'running', '2026-10-14', note)!;
    expect(result.workout.name).toBe('6×800m');
    expect(result.workout.steps[0]).toEqual({ kind: 'warmup', duration: '15min' });
    expect(result.workout.steps[1]).toEqual({ repeat: 6, steps: [{ kind: 'interval', duration: '720m', target: 'pace 4:00-4:10' }, { kind: 'recovery', duration: '90s' }] });
    expect(result.workout.description).toBe('减 10% · 间歇');
    expect(result.document.workouts[0]).toBe(tempo);
    expect(result.document.workouts[1]).toBe(ride);
    expect(sportFamily('trail_running')).toBe('running');
  });

  it('没有下一次同类训练、或一步都缩不了，就不改', () => {
    expect(lighterNext(document, 'running', '2026-10-20', note)).toBeNull();
    expect(lighterNext(document, 'pool_swim', '2026-10-01', note)).toBeNull();
    const odd: PlanDocument = { workouts: [{ ...tempo, steps: [{ kind: 'active', duration: '30分钟' }] }] };
    expect(lighterNext(odd, 'running', '2026-10-01', note)).toBeNull();
  });
});
