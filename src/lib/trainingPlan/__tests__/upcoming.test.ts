import { describe, expect, it } from 'vitest';
import { upcomingDays } from '../upcoming';
import type { PlanStepNode, PlanWorkout } from '../../../types/trainingPlan';

const hr = (low: number, high: number) => ({ type: 'heart_rate' as const, low, high });
const step = (intensity: 'warmup' | 'active' | 'interval' | 'recovery' | 'cooldown', seconds: number): PlanStepNode =>
  ({ type: 'step', intensity, length: { type: 'time' as const, seconds }, target: hr(110, 150) });

const easyRun = (date: string): PlanWorkout => ({
  date, sport: 'running', name: '轻松跑', steps: [step('warmup', 600), step('active', 1800), step('cooldown', 600)],
});
const intervals = (date: string): PlanWorkout => ({
  date, sport: 'running', name: '间歇', steps: [step('warmup', 600), step('interval', 480), step('recovery', 240)],
});
const byDistance = (date: string): PlanWorkout => ({
  date, sport: 'running', name: '长距离',
  steps: [{ type: 'step', intensity: 'active', length: { type: 'distance', meters: 8000 }, target: hr(130, 150) }],
});

describe('upcomingDays', () => {
  it('从明天起三天：训练日带名字与取整分钟，没有的画成休息', () => {
    const days = upcomingDays([easyRun('2026-10-15'), intervals('2026-10-17')], '2026-10-14')!;
    expect(days).toHaveLength(3);
    expect(days[0]).toMatchObject({ date: '2026-10-15', rest: false, name: '轻松跑', minutes: 50, interval: false });
    expect(days[1]).toMatchObject({ date: '2026-10-16', rest: true, name: null, minutes: null });
    expect(days[2]).toMatchObject({ date: '2026-10-17', rest: false, name: '间歇', interval: true });
  });

  it('有间歇步才算高强度，整条有氧算轻松', () => {
    const days = upcomingDays([intervals('2026-10-15')], '2026-10-14')!;
    expect(days[0].interval).toBe(true);
    const easy = upcomingDays([easyRun('2026-10-15')], '2026-10-14')!;
    expect(easy[0].interval).toBe(false);
  });

  it('按距离写的步骤时长取决于配速，不给分钟', () => {
    const days = upcomingDays([byDistance('2026-10-15')], '2026-10-14')!;
    expect(days[0].minutes).toBeNull();
    expect(days[0].name).toBe('长距离');
  });

  it('三天里一条都没有时返回 null：分不清「排了休息」和「没排」', () => {
    expect(upcomingDays([], '2026-10-14')).toBeNull();
    expect(upcomingDays([easyRun('2026-10-20')], '2026-10-14')).toBeNull();
  });

  it('窗口外的训练不把行拉出来', () => {
    expect(upcomingDays([easyRun('2026-10-18')], '2026-10-14')).toBeNull();
  });

  it('今天有的不算在「接下来」里', () => {
    expect(upcomingDays([easyRun('2026-10-14')], '2026-10-14')).toBeNull();
  });

  it('同一天排了两条时只取第一条，不拼长串', () => {
    const days = upcomingDays([easyRun('2026-10-15'), intervals('2026-10-15')], '2026-10-14')!;
    expect(days[0].name).toBe('轻松跑');
    expect(days[0].interval).toBe(false);
  });

  it('今天可以直接传 Date', () => {
    const days = upcomingDays([easyRun('2026-10-15')], new Date(2026, 9, 14))!;
    expect(days[0].date).toBe('2026-10-15');
  });
});
