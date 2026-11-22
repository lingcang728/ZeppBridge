import { describe, expect, it } from 'vitest';
import { mondayOf, weeklyVolume, OTHER_SPORT } from '../weeklyVolume';
import type { Workout } from '../../types';

const run = (start: string, km: number, type = 'running'): Workout => ({
  workout_id: `${type}-${start}`, workout_type: type, normalized_type: type, type_source: 'string_field', effective_type: type,
  start_time: start, end_time: start, distance_meters: km * 1000,
} as Workout);

describe('weeklyVolume', () => {
  const today = new Date(2026, 10, 22); // 2026-11-22, domingo

  it('周一为一周的开始，周日仍算本周', () => {
    expect(mondayOf(today)).toBe('2026-11-16');
    expect(mondayOf(new Date(2026, 10, 16))).toBe('2026-11-16');
  });

  it('按周累加距离，没有练的周是 0 而不是缺失', () => {
    const volume = weeklyVolume([run('2026-11-17T08:00:00', 10), run('2026-11-21T08:00:00', 5)], 'distance', 3, today);
    expect(volume.weeks.map((week) => week.start)).toEqual(['2026-11-02', '2026-11-09', '2026-11-16']);
    expect(volume.weeks.map((week) => week.total)).toEqual([0, 0, 15]);
  });

  it('没有距离的运动不计入距离，但计入次数', () => {
    const swim = { ...run('2026-11-18T08:00:00', 0, 'strength'), distance_meters: undefined } as Workout;
    expect(weeklyVolume([swim], 'distance', 1, today).weeks[0]!.total).toBe(0);
    expect(weeklyVolume([swim], 'sessions', 1, today).weeks[0]!.total).toBe(1);
  });

  it('超出前几名的运动并进「其他」', () => {
    const types = ['a', 'b', 'c'];
    const workouts = types.map((type, index) => run('2026-11-18T08:00:00', 10 - index, type));
    const volume = weeklyVolume(workouts, 'distance', 1, today, 2);
    expect(volume.sports).toEqual(['a', 'b', OTHER_SPORT]);
    expect(volume.weeks[0]!.bySport[OTHER_SPORT]).toBe(8);
  });
});
