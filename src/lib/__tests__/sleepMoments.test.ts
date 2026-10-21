import { describe, expect, it } from 'vitest';
import { longestDeepMidpoint, type TimedSleepSlice } from '../sleepStages';

const h = (hour: number) => Date.UTC(2026, 9, 20, 0) + hour * 3_600_000;

describe('longestDeepMidpoint', () => {
  it('取最长一段连续深睡的中点，不是第一段', () => {
    const slices: TimedSleepSlice[] = [
      { tone: 'light', start: h(0.5), end: h(1) },
      { tone: 'deep', start: h(1), end: h(1.5) },
      { tone: 'light', start: h(1.5), end: h(3) },
      { tone: 'deep', start: h(3), end: h(5) },
      { tone: 'rem', start: h(5), end: h(7) },
    ];
    expect(longestDeepMidpoint(slices)).toBe(h(4));
  });

  it('没有深睡就不标', () => {
    expect(longestDeepMidpoint([{ tone: 'unknown', start: h(0), end: h(2) }, { tone: 'light', start: h(2), end: h(3) }])).toBeNull();
  });
});
