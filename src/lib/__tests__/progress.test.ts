import { describe, expect, it } from 'vitest';
import { dailyStreak, periodStats, personalRecords, weeklyGoalProgress, weeklyTotals, weeklyTotalsFromDays, addDays } from '../progress';
import type { Workout } from '../../types';
import type { SleepNight } from '../sleepTrends';

const day = (offset: number) => addDays('2026-11-22', offset);
const point = (offset: number, value: number) => ({ date: day(offset), value });

describe('dailyStreak', () => {
  const goal = 8000;

  it('今天达成：连续天数含今天', () => {
    const streak = dailyStreak([point(0, 9000), point(-1, 8500), point(-2, 8000), point(-3, 7000)], goal, day(0));
    expect(streak).toMatchObject({ current: 3, todayMet: true });
  });

  it('今天还没达成：从昨天往回数，不算断', () => {
    const streak = dailyStreak([point(0, 3000), point(-1, 9000), point(-2, 9000)], goal, day(0));
    expect(streak).toMatchObject({ current: 2, todayMet: false });
  });

  it('没有记录的日子就是断开，不当成达成', () => {
    const streak = dailyStreak([point(0, 9000), point(-2, 9000), point(-3, 9000)], goal, day(0));
    expect(streak.current).toBe(1);
    expect(streak.best).toBe(2);
  });

  it('历史最长的一段', () => {
    const streak = dailyStreak([point(-10, 9000), point(-9, 9000), point(-8, 9000), point(-7, 9000), point(-6, 100), point(0, 9000)], goal, day(0));
    expect(streak.best).toBe(4);
    expect(streak.current).toBe(1);
  });

  it('最近 30 天的达成率只算有记录的日子', () => {
    const streak = dailyStreak([point(0, 9000), point(-1, 100), point(-2, 9000), point(-40, 9000)], goal, day(0));
    expect(streak.recent).toEqual({ met: 2, days: 3 });
  });

  it('一条记录都没有', () => {
    expect(dailyStreak([], goal, day(0))).toEqual({ current: 0, best: 0, todayMet: false, recent: null });
  });
});

const run = (offset: number, km: number, minutes: number, type = 'running'): Workout => {
  const start = new Date(`${day(offset)}T08:00:00`);
  return {
    workout_id: `${type}${offset}`, workout_type: type, normalized_type: type, type_source: 'string_field', effective_type: type,
    start_time: start.toISOString(), end_time: new Date(start.getTime() + minutes * 60_000).toISOString(),
    distance_meters: km * 1000, moving_seconds: minutes * 60,
  } as Workout;
};

describe('每周目标', () => {
  const today = new Date(2026, 10, 22); // 周日，本周从 11-16 开始

  it('本周累计与连续周数', () => {
    const totals = weeklyTotals([run(-1, 20, 120), run(-2, 15, 90), run(-8, 40, 240), run(-15, 35, 200)], (workout) => workout.distance_meters ?? null);
    const progress = weeklyGoalProgress(totals, 30_000, today);
    expect(progress.thisWeek).toBe(35_000);
    expect(progress.streakWeeks).toBe(3);
  });

  it('本周还没达成：从上一周往回数', () => {
    const totals = weeklyTotals([run(-1, 5, 30), run(-8, 40, 240)], (workout) => workout.distance_meters ?? null);
    expect(weeklyGoalProgress(totals, 30_000, today)).toMatchObject({ thisWeek: 5000, streakWeeks: 1 });
  });
});

describe('weeklyTotalsFromDays', () => {
  it('按周一归周，没有读数的日子不补 0', () => {
    const totals = weeklyTotalsFromDays([point(-1, 5000), point(-2, 3000), point(-8, 7000), { date: day(-9), value: Number.NaN }]);
    expect(totals.get('2026-11-16')).toBe(8000);
    expect(totals.get('2026-11-09')).toBe(7000);
    expect(totals.size).toBe(2);
  });
});

describe('personalRecords', () => {
  const night = (offset: number, minutes: number, deep: number | null): SleepNight => ({
    date: day(offset), minutes, deep, light: null, rem: null, awake: null, bedtime: 1400, wake: 400,
  });

  it('找出每一项的最大值，并标记最近 7 天创下的', () => {
    const records = personalRecords({
      steps: [point(-30, 20000), point(-2, 25000), point(-1, 100)],
      // 全天总距离（米）：-5、-4 两天同属 11-16 那一周，合计 21 公里；-40 那一周只有 10 公里
      distance: [point(-5, 12000), point(-4, 9000), point(-40, 10000)],
      nights: [night(-3, 540, 120), night(-20, 500, 150)],
      workouts: [run(-5, 12, 60), run(-40, 21, 130)],
    }, day(0));
    const get = (id: string) => records.find((record) => record.id === id)!;
    expect(get('steps')).toMatchObject({ value: 25000, date: day(-2), recent: true });
    expect(get('sleep')).toMatchObject({ value: 540, recent: true });
    expect(get('deep')).toMatchObject({ value: 150, recent: false });
    expect(get('longest')).toMatchObject({ value: 21000, recent: false, sport: 'running' });
    expect(get('weekDistance')).toMatchObject({ value: 21000, date: '2026-11-16' });
  });

  it('最快配速只看不短于 5 / 10 公里的跑步', () => {
    const records = personalRecords({
      steps: [], distance: [], nights: [],
      workouts: [run(-3, 5, 25), run(-4, 10, 55), run(-5, 3, 10), run(-6, 20, 40, 'cycling')],
    }, day(0));
    expect(records.find((record) => record.id === 'pace5')!.value).toBe(300);
    expect(records.find((record) => record.id === 'pace10')!.value).toBe(330);
  });

  it('没有数据就没有纪录', () => {
    expect(personalRecords({ steps: [], distance: [], nights: [], workouts: [] }, day(0))).toEqual([]);
  });
});

describe('periodStats', () => {
  it('按起止日期取平均和累计', () => {
    const stats = periodStats({
      steps: [point(-1, 6000), point(-2, 8000), point(-20, 1)],
      hrv: [point(-1, 60), point(-2, 70)],
      restingHr: [point(-1, 50)],
      nights: [{ date: day(-1), minutes: 420, deep: null, light: null, rem: null, awake: null, bedtime: 0, wake: 0 }],
      workouts: [run(-1, 10, 50), run(-30, 10, 50)],
    }, day(-6), day(0));
    expect(stats).toMatchObject({ steps: 7000, hrv: 65, restingHr: 50, sleepMinutes: 420, distanceMeters: 10000, sessions: 1 });
  });

  it('没有读数的是 null，没有运动是 0', () => {
    const stats = periodStats({ steps: [], hrv: [], restingHr: [], nights: [], workouts: [] }, day(-6), day(0));
    expect(stats).toEqual({ steps: null, sleepMinutes: null, distanceMeters: 0, sessions: 0, hrv: null, restingHr: null });
  });
});
