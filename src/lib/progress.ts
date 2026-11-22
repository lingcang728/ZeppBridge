import type { Workout } from '../types';
import { formatDay, parseDay } from './trendWindow';
import { workoutDisplayType, workoutDurationMinutes } from './workouts';
import type { SleepNight } from './sleepTrends';
import { mondayOf } from './weeklyVolume';

/**
 * 目标、连续天数、个人纪录和「这一周」摘要的纯计算。
 * 全部只用本机已有的记录：没有记录的日子就是没有达成（连续天数在那里断开），不补 0，也不编数。
 */
export interface DayPoint {
  date: string;
  value: number;
}

export const addDays = (date: string, days: number): string => {
  const base = parseDay(date);
  return formatDay(new Date(base.getFullYear(), base.getMonth(), base.getDate() + days));
};

/* ───────────────────────── 连续天数 ───────────────────────── */

export interface Streak {
  /** 目前连续达成的天数。今天还没达成时从昨天往回数（今天还在进行中，不算断）。 */
  current: number;
  /** 历史上最长的一段连续达成。 */
  best: number;
  /** 今天是否已达成。 */
  todayMet: boolean;
  /** 最近 30 天里有记录的日子：达成几天 / 共几天。没有记录时是 null。 */
  recent: { met: number; days: number } | null;
}

export const dailyStreak = (points: DayPoint[], goal: number, today: string): Streak => {
  const byDate = new Map(points.map((point) => [point.date, point.value]));
  const met = (date: string) => (byDate.get(date) ?? -Infinity) >= goal;
  const todayMet = met(today);

  let current = 0;
  for (let date = todayMet ? today : addDays(today, -1); met(date); date = addDays(date, -1)) current += 1;

  // 历史最长：按日期排序，相邻的天且都达成才连得上。
  let best = 0;
  let run = 0;
  let previous: string | null = null;
  for (const date of [...byDate.keys()].sort()) {
    if (!met(date)) { run = 0; previous = date; continue; }
    run = previous !== null && addDays(previous, 1) === date && run > 0 ? run + 1 : 1;
    best = Math.max(best, run);
    previous = date;
  }

  const since = addDays(today, -29);
  const recentDays = [...byDate.keys()].filter((date) => date >= since && date <= today);
  const recent = recentDays.length ? { met: recentDays.filter(met).length, days: recentDays.length } : null;
  return { current, best, todayMet, recent };
};

/* ───────────────────────── 每周目标 ───────────────────────── */

export interface WeeklyGoalProgress {
  /** 本周（周一到今天）累计。 */
  thisWeek: number;
  /** 连续达成的周数：本周已达成就算上本周，否则从上一周往回数。 */
  streakWeeks: number;
  /** 最近 8 个完整周里达成几周。 */
  recentMet: number;
}

/** 每周累计：key 是周一的日期。 */
export const weeklyTotals = (workouts: Workout[], pick: (workout: Workout) => number | null): Map<string, number> => {
  const totals = new Map<string, number>();
  for (const workout of workouts) {
    const when = new Date(workout.start_time);
    if (Number.isNaN(when.getTime())) continue;
    const value = pick(workout);
    if (value === null || !Number.isFinite(value) || value <= 0) continue;
    const week = mondayOf(when);
    totals.set(week, (totals.get(week) ?? 0) + value);
  }
  return totals;
};

/** 每周累计（按日序列）：key 是周一的日期。没有读数的日子不进累计，也不补 0。 */
export const weeklyTotalsFromDays = (points: DayPoint[]): Map<string, number> => {
  const totals = new Map<string, number>();
  for (const point of points) {
    if (!Number.isFinite(point.value) || point.value <= 0) continue;
    const week = mondayOf(parseDay(point.date));
    totals.set(week, (totals.get(week) ?? 0) + point.value);
  }
  return totals;
};

export const weeklyGoalProgress = (totals: Map<string, number>, goal: number, today: Date): WeeklyGoalProgress => {
  const thisMonday = mondayOf(today);
  const thisWeek = totals.get(thisMonday) ?? 0;
  let streakWeeks = 0;
  for (let week = thisWeek >= goal ? thisMonday : addDays(thisMonday, -7); (totals.get(week) ?? 0) >= goal; week = addDays(week, -7)) streakWeeks += 1;
  let recentMet = 0;
  for (let index = 1; index <= 8; index += 1) if ((totals.get(addDays(thisMonday, -7 * index)) ?? 0) >= goal) recentMet += 1;
  return { thisWeek, streakWeeks, recentMet };
};

/* ───────────────────────── 个人纪录 ───────────────────────── */

export type RecordId = 'steps' | 'sleep' | 'deep' | 'weekDistance' | 'longest' | 'pace5' | 'pace10';

export interface PersonalRecord {
  id: RecordId;
  /** steps：步；sleep / deep：分钟；weekDistance（全天总距离）/ longest（单次运动）：米；pace：秒 / 公里。 */
  value: number;
  /** 创下纪录的那天（周纪录是那一周的周一）。 */
  date: string;
  /** 运动类型（最长一次运动时用）。 */
  sport?: string;
  /** 最近 7 天内创下的。 */
  recent: boolean;
}

const localDay = (iso: string): string | null => {
  const when = new Date(iso);
  return Number.isNaN(when.getTime()) ? null : formatDay(when);
};

const isRun = (workout: Workout) => workoutDisplayType(workout).includes('run');

export const personalRecords = (
  input: { steps: DayPoint[]; distance: DayPoint[]; nights: SleepNight[]; workouts: Workout[] },
  today: string,
): PersonalRecord[] => {
  const since = addDays(today, -6);
  const out: PersonalRecord[] = [];
  const push = (id: RecordId, value: number, date: string, sport?: string) =>
    out.push({ id, value, date, sport, recent: date >= since && date <= today });

  const topSteps = input.steps.reduce<DayPoint | null>((best, point) => (point.value > 0 && (!best || point.value > best.value) ? point : best), null);
  if (topSteps) push('steps', topSteps.value, topSteps.date);

  const longestNight = input.nights.reduce<SleepNight | null>((best, night) => (!best || night.minutes > best.minutes ? night : best), null);
  if (longestNight) push('sleep', longestNight.minutes, longestNight.date);
  const deepest = input.nights.reduce<SleepNight | null>((best, night) => ((night.deep ?? 0) > 0 && (!best || (night.deep ?? 0) > (best.deep ?? 0)) ? night : best), null);
  if (deepest) push('deep', deepest.deep!, deepest.date);

  const distance = (workout: Workout) => (typeof workout.distance_meters === 'number' && workout.distance_meters > 0 ? workout.distance_meters : null);
  // 距离最长的一周用「全天总距离」（日常活动里的每日距离，走路、通勤都算），不是只数运动记录。
  const weeks = weeklyTotalsFromDays(input.distance);
  const bestWeek = [...weeks.entries()].sort((a, b) => b[1] - a[1])[0];
  if (bestWeek) push('weekDistance', bestWeek[1], bestWeek[0]);

  const longest = input.workouts.reduce<Workout | null>((best, workout) => ((distance(workout) ?? 0) > (distance(best ?? ({} as Workout)) ?? 0) ? workout : best), null);
  if (longest && distance(longest)) {
    const day = localDay(longest.start_time);
    if (day) push('longest', distance(longest)!, day, workoutDisplayType(longest));
  }

  // 最快配速：跑步、距离不少于 5 / 10 公里，按「用时 / 距离」；有净运动时间用它，否则用起止时间。
  const paceOf = (workout: Workout): number | null => {
    const meters = distance(workout);
    if (!meters) return null;
    const seconds = typeof workout.moving_seconds === 'number' && workout.moving_seconds > 0
      ? workout.moving_seconds
      : (workoutDurationMinutes(workout) ?? 0) * 60;
    return seconds > 0 ? seconds / (meters / 1000) : null;
  };
  for (const [id, minMeters] of [['pace5', 5000], ['pace10', 10000]] as const) {
    let best: { pace: number; day: string } | null = null;
    for (const workout of input.workouts) {
      if (!isRun(workout) || (distance(workout) ?? 0) < minMeters) continue;
      const pace = paceOf(workout);
      const day = localDay(workout.start_time);
      // 配速快得离谱（比如 1:30/公里）多半是脏数据，不当纪录。
      if (pace === null || !day || pace < 150) continue;
      if (!best || pace < best.pace) best = { pace, day };
    }
    if (best) push(id, best.pace, best.day);
  }
  return out;
};

/* ───────────────────────── 周 / 月摘要 ───────────────────────── */

export interface PeriodStats {
  steps: number | null;
  sleepMinutes: number | null;
  /** 距离（米）和次数：这一段里没有运动就是 0（运动是逐条记录，0 是真的「没练」）。 */
  distanceMeters: number;
  sessions: number;
  hrv: number | null;
  restingHr: number | null;
}

const mean = (values: number[]): number | null => (values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null);
const within = (date: string, start: string, end: string) => date >= start && date <= end;

export const periodStats = (
  input: { steps: DayPoint[]; hrv: DayPoint[]; restingHr: DayPoint[]; nights: SleepNight[]; workouts: Workout[] },
  start: string,
  end: string,
): PeriodStats => {
  const inRange = (points: DayPoint[]) => points.filter((point) => within(point.date, start, end)).map((point) => point.value);
  const workouts = input.workouts.filter((workout) => {
    const day = localDay(workout.start_time);
    return day !== null && within(day, start, end);
  });
  return {
    steps: mean(inRange(input.steps)),
    sleepMinutes: mean(input.nights.filter((night) => within(night.date, start, end)).map((night) => night.minutes)),
    distanceMeters: workouts.reduce((sum, workout) => sum + (typeof workout.distance_meters === 'number' ? workout.distance_meters : 0), 0),
    sessions: workouts.length,
    hrv: mean(inRange(input.hrv)),
    restingHr: mean(inRange(input.restingHr)),
  };
};
