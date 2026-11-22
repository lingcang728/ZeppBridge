import type { Workout } from '../types';
import { workoutDisplayLabel, workoutDisplayType, workoutDurationMinutes } from './workouts';

/**
 * 运动列表的筛选与排序（只在已取回的记录上做，纯函数）。
 * 日期按本地日期的 YYYY-MM-DD 比较（`start_time` 取前 10 位会受时区影响，所以先转成本地日期）。
 */
export type WorkoutSort = 'newest' | 'oldest' | 'distance' | 'duration';

export interface WorkoutFilter {
  /** 运动类型（`workoutDisplayType` 的值）；空 = 全部。 */
  sport: string;
  /** 起止日期（含），空 = 不限。 */
  from: string;
  to: string;
  /** 在运动名称里搜。 */
  text: string;
  sort: WorkoutSort;
}

export const EMPTY_FILTER: WorkoutFilter = { sport: '', from: '', to: '', text: '', sort: 'newest' };

export const isFiltering = (filter: WorkoutFilter): boolean =>
  Boolean(filter.sport || filter.from || filter.to || filter.text.trim()) || filter.sort !== 'newest';

const localDay = (iso: string): string => {
  const when = new Date(iso);
  if (Number.isNaN(when.getTime())) return '';
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${when.getFullYear()}-${pad(when.getMonth() + 1)}-${pad(when.getDate())}`;
};

/** 列表里出现过的运动类型，按出现次数从多到少。 */
export const sportOptions = (workouts: Workout[]): Array<{ value: string; label: string; count: number }> => {
  const counts = new Map<string, { label: string; count: number }>();
  for (const workout of workouts) {
    const key = workoutDisplayType(workout);
    const entry = counts.get(key);
    if (entry) entry.count += 1;
    else counts.set(key, { label: workoutDisplayLabel(workout), count: 1 });
  }
  return [...counts.entries()]
    .sort((a, b) => b[1].count - a[1].count)
    .map(([value, { label, count }]) => ({ value, label, count }));
};

const numeric = (value: number | null | undefined): number => (typeof value === 'number' && Number.isFinite(value) ? value : -1);

export const applyWorkoutFilter = (workouts: Workout[], filter: WorkoutFilter): Workout[] => {
  const text = filter.text.trim().toLowerCase();
  const kept = workouts.filter((workout) => {
    if (filter.sport && workoutDisplayType(workout) !== filter.sport) return false;
    const day = localDay(workout.start_time);
    if (filter.from && (!day || day < filter.from)) return false;
    if (filter.to && (!day || day > filter.to)) return false;
    if (text && !workoutDisplayLabel(workout).toLowerCase().includes(text)) return false;
    return true;
  });
  if (filter.sort === 'newest') return kept;
  const sorted = [...kept];
  if (filter.sort === 'oldest') return sorted.reverse();
  // 没有这项数据的记录排到最后，不当成 0。
  const key = filter.sort === 'distance'
    ? (workout: Workout) => numeric(workout.distance_meters)
    : (workout: Workout) => numeric(workoutDurationMinutes(workout));
  return sorted.sort((a, b) => key(b) - key(a));
};
