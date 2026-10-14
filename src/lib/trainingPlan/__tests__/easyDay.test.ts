import { describe, expect, it } from 'vitest';
import { easyDay, easyMinutes, easyTarget, hasIntervalStep, intervalsOn, lowRecovery } from '../easyDay';
import type { PlanDocument, PlanWorkout, PlanWorkoutInput } from '../../../types/trainingPlan';

const days = (from: string, values: number[]) => values.map((value, i) => {
  const date = new Date(`${from}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + i);
  return { date: date.toISOString().slice(0, 10), value };
});

const words = () => ({ name: '轻松跑', focus: '恢复', description: (name: string) => `原计划「${name}」` });

const intervals: PlanWorkoutInput = {
  date: '2026-10-14', sport: 'running', variant: 'track', name: '4×1km', focus: '速度', description: '间歇',
  steps: [
    { kind: 'warmup', duration: '15min', target: 'hr 120-135' },
    { repeat: 4, steps: [{ kind: 'interval', duration: '4min', target: 'pace 4:00-4:10' }, { kind: 'recovery', duration: '2min' }] },
    { kind: 'cooldown', duration: '10min', target: 'hr 110-125' },
  ],
};

describe('lowRecovery', () => {
  it('今天比自己此前 28 天的中位数低 10 分及以上才算恢复差', () => {
    const before = days('2026-09-30', [70, 66, 64, 68, 72, 65, 67, 69, 66, 70, 71, 63, 68, 66]);
    expect(lowRecovery([...before, { date: '2026-10-14', value: 55 }], '2026-10-14')).toEqual({ today: 55, usual: 68 });
    expect(lowRecovery([...before, { date: '2026-10-14', value: 60 }], '2026-10-14')).toBeNull();
  });

  it('今天没有读数、或此前不到 7 天有数，就不下结论', () => {
    const before = days('2026-10-01', [70, 70, 70, 70, 70, 70, 70, 70, 70, 70, 70, 70, 70]);
    expect(lowRecovery(before, '2026-10-14')).toBeNull();
    const thin = days('2026-10-08', [70, 70, 70, 70, 70, 70]);
    expect(lowRecovery([...thin, { date: '2026-10-14', value: 30 }], '2026-10-14')).toBeNull();
  });

  it('28 天以前的读数不算进平时', () => {
    const old = days('2026-08-01', [95, 95, 95, 95, 95, 95, 95, 95]);
    const recent = days('2026-10-06', [60, 60, 60, 60, 60, 60, 60, 60]);
    expect(lowRecovery([...old, ...recent, { date: '2026-10-14', value: 55 }], '2026-10-14')).toBeNull();
  });
});

describe('easyDay', () => {
  it('只换今天有间歇的那条：同运动、同子类型，时长取原总时长夹在 20–40 分钟，目标沿用热身', () => {
    const easy: PlanWorkoutInput = { date: '2026-10-14', sport: 'running', name: '早上散步跑', focus: '有氧', description: '轻松', steps: [{ kind: 'active', duration: '30min' }] };
    const tomorrow: PlanWorkoutInput = { ...intervals, date: '2026-10-15' };
    const doc: PlanDocument = { from: '2026-10-14', to: '2026-10-15', workouts: [intervals, easy, tomorrow], rest: [{ date: '2026-10-15', note: '早睡' }] };
    const next = easyDay(doc, '2026-10-14', words);
    expect(next.workouts[0]).toEqual({
      date: '2026-10-14', sport: 'running', variant: 'track', name: '轻松跑', focus: '恢复', description: '原计划「4×1km」',
      steps: [{ kind: 'active', duration: '40min', target: 'hr 120-135' }],
    });
    expect(next.workouts[1]).toBe(easy);
    expect(next.workouts[2]).toBe(tomorrow);
    expect(next.rest).toEqual(doc.rest);
    expect(intervalsOn(next, '2026-10-14')).toEqual([]);
    expect(intervalsOn(next, '2026-10-15')).toHaveLength(1);
  });

  it('按距离写的训练算不出时长，用 30 分钟；没有轻松目标就不设目标', () => {
    const byDistance: PlanWorkoutInput = { ...intervals, steps: [{ repeat: 6, steps: [{ kind: 'work', duration: '800m', target: 'pace 3:50-4:00' }, { kind: 'recovery', duration: '400m' }] }] };
    expect(easyMinutes(byDistance)).toBe(30);
    expect(easyTarget(byDistance)).toBeUndefined();
    const short: PlanWorkoutInput = { ...intervals, steps: [{ repeat: 5, steps: [{ kind: 'interval', duration: '90s' }, { kind: 'rest', duration: '30s' }] }] };
    expect(easyMinutes(short)).toBe(20);
  });

  it('账本上的训练：有间歇步才算', () => {
    const hr = { type: 'heart_rate' as const, low: 120, high: 150 };
    const sent: PlanWorkout = { date: '2026-10-14', sport: 'running', name: '间歇', steps: [
      { type: 'repeat', times: 3, steps: [{ intensity: 'interval', length: { type: 'time', seconds: 240 }, target: hr }] },
    ] };
    expect(hasIntervalStep(sent)).toBe(true);
    expect(hasIntervalStep({ ...sent, steps: [{ type: 'step', intensity: 'active', length: { type: 'time', seconds: 1800 }, target: hr }] })).toBe(false);
  });
});
