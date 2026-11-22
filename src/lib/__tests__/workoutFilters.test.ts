import { describe, expect, it } from 'vitest';
import { applyWorkoutFilter, EMPTY_FILTER, isFiltering, sportOptions } from '../workoutFilters';
import type { Workout } from '../../types';

const workout = (id: string, type: string, start: string, meters?: number, minutes = 30): Workout => ({
  workout_id: id, workout_type: type, normalized_type: type, type_source: 'string_field', effective_type: type,
  start_time: start, end_time: new Date(new Date(start).getTime() + minutes * 60_000).toISOString(),
  distance_meters: meters,
} as Workout);

const list = [
  workout('a', 'running', '2026-11-20T08:00:00', 10_000, 55),
  workout('b', 'cycling', '2026-11-18T08:00:00', 40_000, 90),
  workout('c', 'running', '2026-11-10T08:00:00', 5_000, 28),
  workout('d', 'strength', '2026-11-08T08:00:00', undefined, 45),
];

describe('workoutFilters', () => {
  it('不筛选时原样返回', () => {
    expect(applyWorkoutFilter(list, EMPTY_FILTER).map((item) => item.workout_id)).toEqual(['a', 'b', 'c', 'd']);
    expect(isFiltering(EMPTY_FILTER)).toBe(false);
  });

  it('按运动类型筛选', () => {
    expect(applyWorkoutFilter(list, { ...EMPTY_FILTER, sport: 'running' }).map((item) => item.workout_id)).toEqual(['a', 'c']);
  });

  it('按日期范围筛选（含首尾）', () => {
    const result = applyWorkoutFilter(list, { ...EMPTY_FILTER, from: '2026-11-10', to: '2026-11-18' });
    expect(result.map((item) => item.workout_id)).toEqual(['b', 'c']);
  });

  it('按距离排序，没有距离的排最后', () => {
    expect(applyWorkoutFilter(list, { ...EMPTY_FILTER, sort: 'distance' }).map((item) => item.workout_id)).toEqual(['b', 'a', 'c', 'd']);
  });

  it('按时长排序', () => {
    expect(applyWorkoutFilter(list, { ...EMPTY_FILTER, sort: 'duration' }).map((item) => item.workout_id)).toEqual(['b', 'a', 'd', 'c']);
  });

  it('最旧在前', () => {
    expect(applyWorkoutFilter(list, { ...EMPTY_FILTER, sort: 'oldest' }).map((item) => item.workout_id)).toEqual(['d', 'c', 'b', 'a']);
  });

  it('运动类型选项按出现次数排序', () => {
    const options = sportOptions(list);
    expect(options[0]).toMatchObject({ value: 'running', count: 2 });
    expect(options).toHaveLength(3);
  });
});
