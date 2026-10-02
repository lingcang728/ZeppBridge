import { describe, expect, it } from 'vitest';
import { APPROX_SECONDS_PER_KM, heartRateDomain, profileMinutes, workoutProfile } from '../profile';
import type { PlanStep, PlanWorkout } from '../../../types/trainingPlan';

const time = (intensity: PlanStep['intensity'], seconds: number, low?: number, high?: number): PlanStep => ({
  intensity,
  length: { type: 'time', seconds },
  target: low === undefined ? { type: 'open' } : { type: 'heart_rate', low, high: high! },
});

const intervals: PlanWorkout = {
  date: '2026-10-07',
  sport: 'running',
  name: 'x',
  steps: [
    { type: 'step', ...time('warmup', 720, 110, 130) },
    { type: 'repeat', times: 5, steps: [time('interval', 180, 160, 172), time('recovery', 120, 120, 140)] },
    { type: 'step', ...time('cooldown', 480, 100, 125) },
  ],
};

describe('workoutProfile', () => {
  it('重复组展开成逐轮的色块，总时长 = 各步相加；步骤清单保留「重复 N 次」分组', () => {
    const profile = workoutProfile(intervals);
    expect(profile.segments).toHaveLength(1 + 5 * 2 + 1);
    expect(profile.seconds).toBe(720 + 5 * (180 + 120) + 480);
    expect(profileMinutes(profile)).toBe(45);
    expect(profile.approx).toBe(false);
    expect(profile.hasHeartRate).toBe(true);
    expect(profile.groups.map((group) => group.kind)).toEqual(['step', 'repeat', 'step']);
    const repeat = profile.groups[1];
    expect(repeat.kind === 'repeat' && repeat.times).toBe(5);
    expect(repeat.kind === 'repeat' && repeat.rows).toHaveLength(2);
    // 每个重复色块记着自己是第几轮。
    expect(profile.segments[1].round).toBe(0);
    expect(profile.segments[9].round).toBe(4);
    expect(profile.segments[0].round).toBeNull();
  });

  it('按距离写的步骤：宽度按假设配速摆并标 approx，不假装是真时长', () => {
    const run: PlanWorkout = {
      date: '2026-10-08', sport: 'running', name: 'y',
      steps: [{ type: 'step', intensity: 'active', length: { type: 'distance', meters: 5000 }, target: { type: 'heart_rate', low: 130, high: 150 } }],
    };
    const profile = workoutProfile(run);
    expect(profile.segments[0].approx).toBe(true);
    expect(profile.segments[0].seconds).toBe(5 * APPROX_SECONDS_PER_KM);
    expect(profile.approx).toBe(true);
  });

  it('没有心率目标的步骤没有心率范围，也不让整条训练被当成有心率目标', () => {
    const pace: PlanWorkout = {
      date: '2026-10-08', sport: 'running', name: 'z',
      steps: [{ type: 'step', intensity: 'active', length: { type: 'time', seconds: 600 }, target: { type: 'pace', fast: 330, slow: 350 } }],
    };
    const profile = workoutProfile(pace);
    expect(profile.segments[0].low).toBeNull();
    expect(profile.segments[0].target).toBe('pace');
    expect(profile.hasHeartRate).toBe(false);
    expect(heartRateDomain(profile)).toEqual({ min: 90, max: 180 });
  });
});

describe('heartRateDomain', () => {
  it('框住所有目标并向外取整十：100–172 → 90 到 180', () => {
    expect(heartRateDomain(workoutProfile(intervals))).toEqual({ min: 90, max: 180 });
  });

  it('下限不低于 40，上下至少隔 40', () => {
    const calm: PlanWorkout = {
      date: '2026-10-08', sport: 'cycling', name: 'q',
      steps: [{ type: 'step', ...time('active', 600, 60, 62) }],
    };
    const domain = heartRateDomain(workoutProfile(calm));
    expect(domain.min).toBeGreaterThanOrEqual(40);
    expect(domain.max - domain.min).toBeGreaterThanOrEqual(40);
  });
});
