import { describe, expect, it } from 'vitest';
import { DEFAULT_GOALS, normalizeGoals } from '../useGoals';

describe('normalizeGoals', () => {
  it('没存过就用默认值', () => {
    expect(normalizeGoals(null)).toEqual(DEFAULT_GOALS);
    expect(normalizeGoals({})).toEqual(DEFAULT_GOALS);
  });

  it('存过的照用', () => {
    expect(normalizeGoals({ stepsPerDay: 10000, sleepHours: 8, weeklyDistanceM: 40000 }))
      .toEqual({ stepsPerDay: 10000, sleepHours: 8, weeklyDistanceM: 40000 });
  });

  it('用户清掉的（null）保持不设，不被默认值顶回来', () => {
    expect(normalizeGoals({ stepsPerDay: null, sleepHours: 7, weeklyDistanceM: null }))
      .toEqual({ stepsPerDay: null, sleepHours: 7, weeklyDistanceM: null });
  });

  it('不合理的值（负数、荒谬的大数、非数字）当作不设', () => {
    expect(normalizeGoals({ stepsPerDay: -5, sleepHours: 40, weeklyDistanceM: 'x' }))
      .toEqual({ stepsPerDay: null, sleepHours: null, weeklyDistanceM: null });
  });
});
