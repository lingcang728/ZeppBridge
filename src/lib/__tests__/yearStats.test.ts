import { describe, expect, it } from 'vitest';
import { coverageShare, kindLegend, monthTotals, streaks, versusLastYear } from '../rings/yearStats';
import type { RingStar, RingYear } from '../../types/rings';

const star = (date: string, kind = 'running', distance_m: number | null = 5000): RingStar =>
  ({ workout_id: `${date}-${kind}`, date, kind, is_run: kind === 'running', distance_m, duration_s: 1800 });
const year = (y: number, stars: RingStar[], extra: Partial<RingYear> = {}): RingYear => ({
  year: y, in_progress: false, data_days: 300, workouts: stars.length, active_days: 0, duration_s: 0,
  distance_m: stars.reduce((s, v) => s + (v.distance_m ?? 0), 0), runs: 0, run_distance_m: 0, weeks: [], busiest_month: null,
  busiest_month_workouts: 0, longest_run: null, longest_workout: null, steps_total: null, steps_days: 0, sleep_avg_minutes: null,
  sleep_nights: 0, personal_records: [], races: [], stars, ...extra,
});

describe('year stats', () => {
  it('compares an unfinished year only with the same stretch of last year', () => {
    const last = year(2025, [star('2025-01-10'), star('2025-02-01'), star('2025-09-01'), star('2025-12-01')]);
    const now = year(2026, [star('2026-01-05'), star('2026-01-20'), star('2026-03-01')], { in_progress: true });
    const versus = versusLastYear(now, last, '2026-03-02');
    expect(versus?.sameSpan).toBe(true);
    // 去年到 3 月 2 日只有两次：3 比 2 是 +50%，不是拿整年的 4 次比成 −25%。
    expect(versus?.workouts).toBeCloseTo(0.5);
  });

  it('has nothing to compare when last year has no workouts', () => {
    expect(versusLastYear(year(2026, [star('2026-01-05')]), undefined, '2026-03-02')).toBeNull();
    expect(versusLastYear(year(2026, [star('2026-01-05', 'yoga', null)]), year(2025, [star('2025-01-05', 'yoga', null)]), '2027-01-01')?.distance).toBeNull();
  });

  it('finds streaks across month ends and keeps imported kinds in the legend', () => {
    const stars = [star('2025-01-30'), star('2025-01-31'), star('2025-02-01'), star('2025-02-01', 'cycling'), star('2025-03-10', 'imported_swim')];
    expect(streaks(stars)[0]).toEqual({ from: '2025-01-30', to: '2025-02-01', days: 3 });
    expect(kindLegend(stars, 2)).toEqual([{ kind: 'running', count: 3 }, { kind: 'cycling', count: 1 }, { kind: null, count: 1 }]);
    expect(monthTotals(stars)[1]).toEqual({ month: 1, count: 2, distance: 10000 });
  });

  it('counts coverage against the days that have passed', () => {
    expect(coverageShare(year(2026, [], { in_progress: true, data_days: 30 }), '2026-01-30', 365)).toBe(1);
    expect(coverageShare(year(2025, [], { data_days: 73 }), '2026-01-30', 365)).toBeCloseTo(0.2);
  });
});
