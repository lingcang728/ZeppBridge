import { describe, expect, it } from 'vitest';
import { workoutTiming } from '../workoutTiming';

const time = (minutes: number) => new Date(Date.UTC(2026, 8, 11, 0, minutes)).toISOString();
const pause = (from: number, to: number) => ({ start_time: time(from), end_time: time(to), kind: 'manual' });

describe('workout timing', () => {
  it('prefers cloud moving time when detailed pause intervals are missing or incomplete', () => {
    expect(workoutTiming(time(0), time(30), 5000, [], 1500)?.movingPace).toBe(5);
    expect(workoutTiming(time(0), time(30), 5000, [pause(10, 11)], 1500)?.pausedMinutes).toBe(5);
    expect(workoutTiming(time(0), time(30), 5000, [pause(10, 15)], 1900)?.movingMinutes).toBe(25);
    expect(workoutTiming(time(0), time(30), 5000, [], 0)?.movingPace).toBeNull();
  });
  it('separates traffic-light pauses from elapsed time and pace', () => {
    expect(workoutTiming(time(0), time(30), 5000, [pause(10, 15)])).toEqual({
      elapsedMinutes: 30, pausedMinutes: 5, movingMinutes: 25, movingPace: 5, elapsedPace: 6,
    });
  });
  it('unions overlapping, duplicate and clipped intervals', () => {
    expect(workoutTiming(time(0), time(30), 5000, [
      pause(10, 15), pause(12, 20), pause(10, 15), pause(-5, 2), pause(28, 35),
      pause(4, 3), pause(40, 45), { start_time: 'invalid', end_time: time(15), kind: 'manual' },
    ])?.pausedMinutes).toBe(14);
  });
  it('does not invent pace without distance or positive moving time', () => {
    expect(workoutTiming(time(0), time(30), null, [])?.movingPace).toBeNull();
    expect(workoutTiming(time(0), time(30), 5000, [pause(-1, 40)])?.movingPace).toBeNull();
    expect(workoutTiming(time(30), time(0), 5000, [])).toBeNull();
    expect(workoutTiming('invalid', time(30), 5000, [])).toBeNull();
  });
});
