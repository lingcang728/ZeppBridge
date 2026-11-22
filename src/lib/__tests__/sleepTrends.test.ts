import { describe, expect, it } from 'vitest';
import { averageBedtime, bedtimeSpread, clockText, sleepNights } from '../sleepTrends';
import type { SleepSession } from '../../types';

const night = (start: string, end: string, minutes: number): SleepSession => ({
  sleep_id: start, start_time: start, end_time: end, duration_minutes: minutes, source_scope: 'legacy',
} as SleepSession);

describe('sleepTrends', () => {
  it('凌晨入睡算前一晚，23:30 和 00:30 只差一小时', () => {
    const nights = sleepNights([
      night('2026-11-10T23:30:00', '2026-11-11T07:00:00', 450),
      night('2026-11-12T00:30:00', '2026-11-12T08:00:00', 450),
    ], '2026-11-01', '2026-11-30');
    expect(nights.map((item) => item.date)).toEqual(['2026-11-10', '2026-11-11']);
    expect(nights[1]!.bedtime - nights[0]!.bedtime).toBe(60 + 1440 - 1440);
    expect(clockText(averageBedtime(nights)!)).toBe('00:00');
  });

  it('一晚有几段时留最长的一段', () => {
    const nights = sleepNights([
      night('2026-11-10T23:00:00', '2026-11-11T06:00:00', 420),
      night('2026-11-10T22:00:00', '2026-11-10T22:30:00', 30),
    ], '2026-11-01', '2026-11-30');
    expect(nights).toHaveLength(1);
    expect(nights[0]!.minutes).toBe(420);
  });

  it('不足 3 晚不给规律性', () => {
    const two = sleepNights([
      night('2026-11-10T23:00:00', '2026-11-11T06:00:00', 420),
      night('2026-11-11T23:00:00', '2026-11-12T06:00:00', 420),
    ], '2026-11-01', '2026-11-30');
    expect(bedtimeSpread(two)).toBeNull();
  });

  it('入睡时刻一样时偏差为 0', () => {
    const three = [10, 11, 12].map((day) => night(`2026-11-${day}T23:00:00`, `2026-11-${day + 1}T06:00:00`, 420));
    expect(bedtimeSpread(sleepNights(three, '2026-11-01', '2026-11-30'))).toBe(0);
  });
});
