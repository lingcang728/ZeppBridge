import type { Workout } from '../types';
import { localDateString } from './format';
import { workoutDisplayType, workoutDurationMinutes } from './workouts';

/**
 * 每周训练量：一周（周一到周日）一根柱子，按运动类型叠起来。
 * 只数「有类型、有时间」的运动；没有距离的运动在「距离」口径里不计（不写成 0 公里），
 * 但仍然计入「次数」和「时长」。
 */
export type VolumeMetric = 'distance' | 'duration' | 'sessions';

export interface WeekVolume {
  /** 这一周的周一（本地日期）。 */
  start: string;
  total: number;
  bySport: Record<string, number>;
}

export interface WeeklyVolume {
  weeks: WeekVolume[];
  /** 按总量从大到小；超过 `topSports` 的并进 `other`。 */
  sports: string[];
}

export const OTHER_SPORT = 'other';

/** 一个日期（本地）所在周的周一。 */
export const mondayOf = (date: Date): string => {
  const day = (date.getDay() + 6) % 7;
  return localDateString(new Date(date.getFullYear(), date.getMonth(), date.getDate() - day));
};

const addWeeks = (monday: string, weeks: number): string => {
  const [y, m, d] = monday.split('-').map(Number);
  return localDateString(new Date(y!, m! - 1, d! + weeks * 7));
};

const valueOf = (workout: Workout, metric: VolumeMetric): number | null => {
  if (metric === 'sessions') return 1;
  if (metric === 'duration') {
    const moving = typeof workout.moving_seconds === 'number' && workout.moving_seconds > 0 ? workout.moving_seconds / 60 : null;
    return moving ?? workoutDurationMinutes(workout);
  }
  return typeof workout.distance_meters === 'number' && workout.distance_meters > 0 ? workout.distance_meters / 1000 : null;
};

/**
 * 把运动按周累加。`weekCount` 周，最后一周是 `today` 所在的那一周；周内没有运动的周是 0 的空柱
 * （这里 0 是真的「那周没练」，不是缺数据——运动记录本来就是逐条的）。
 */
export const weeklyVolume = (
  workouts: Workout[],
  metric: VolumeMetric,
  weekCount: number,
  today: Date,
  topSports = 4,
): WeeklyVolume => {
  const lastMonday = mondayOf(today);
  const firstMonday = addWeeks(lastMonday, -(Math.max(1, weekCount) - 1));
  const weeks = new Map<string, WeekVolume>();
  for (let index = 0; index < weekCount; index += 1) {
    const start = addWeeks(firstMonday, index);
    weeks.set(start, { start, total: 0, bySport: {} });
  }
  const sportTotals = new Map<string, number>();
  for (const workout of workouts) {
    const when = new Date(workout.start_time);
    if (Number.isNaN(when.getTime())) continue;
    const week = weeks.get(mondayOf(when));
    if (!week) continue;
    const value = valueOf(workout, metric);
    if (value === null || !Number.isFinite(value) || value <= 0) continue;
    const sport = workoutDisplayType(workout);
    week.bySport[sport] = (week.bySport[sport] ?? 0) + value;
    week.total += value;
    sportTotals.set(sport, (sportTotals.get(sport) ?? 0) + value);
  }
  const ranked = [...sportTotals.entries()].sort((a, b) => b[1] - a[1]).map(([sport]) => sport);
  const kept = ranked.slice(0, topSports);
  const dropped = new Set(ranked.slice(topSports));
  if (dropped.size) {
    for (const week of weeks.values()) {
      let rest = 0;
      for (const sport of dropped) {
        rest += week.bySport[sport] ?? 0;
        delete week.bySport[sport];
      }
      if (rest > 0) week.bySport[OTHER_SPORT] = rest;
    }
    kept.push(OTHER_SPORT);
  }
  return { weeks: [...weeks.values()], sports: kept };
};
