import { describe, expect, it } from 'vitest';
import type { MetricSeries } from '../../types';
import { sliceByDate, sliceIndexed, sliceSeries, widerRangeWithData, windowStartDate } from '../metricSeries';

const today = new Date(2026, 8, 29, 18, 0);
const long: MetricSeries = {
  metric: 'resting_hr',
  unit: 'bpm',
  source: 'daily_metrics',
  points: [
    { date: '2026-04-02', value: 60 },
    { date: '2026-09-01', value: 55 },
    { date: '2026-09-23', value: 52 },
    { date: '2026-09-28', value: 51 },
  ],
  latest: { date: '2026-09-28', value: 51 },
  average: 54.5,
  minimum: 51,
  maximum: 60,
  days_with_data: 4,
  window_days: 180,
};

describe('sliceSeries', () => {
  it('counts the window the same way the backend does: today and the days before it', () => {
    expect(windowStartDate(7, today)).toBe('2026-09-23');
    expect(windowStartDate(180, today)).toBe('2026-04-03');
  });

  it('recomputes the stats of the tail as if it had been fetched on its own', () => {
    const week = sliceSeries(long, 7, today);
    expect(week.points.map((point) => point.date)).toEqual(['2026-09-23', '2026-09-28']);
    expect(week).toMatchObject({ average: 51.5, minimum: 51, maximum: 52, days_with_data: 2, window_days: 7 });
    expect(week.latest?.date).toBe('2026-09-28');
  });

  it('says nothing rather than inventing a latest reading when the window is empty', () => {
    const quiet = sliceSeries({ ...long, points: [{ date: '2026-04-02', value: 60 }] }, 7, today);
    expect(quiet).toMatchObject({ latest: null, average: null, minimum: null, maximum: null, days_with_data: 0 });
  });

  it('slices dated rows by the same first day', () => {
    expect(sliceByDate([{ date: '2026-09-22' }, { date: '2026-09-23' }], 7, today)).toEqual([{ date: '2026-09-23' }]);
  });
});

describe('a card never sits on a range it cannot draw', () => {
  // 用户 2026-10-04：VO₂max 7 天里没有、6 个月里有，就自动显示 6 个月。
  const sparse: MetricSeries = { ...long, metric: 'vo2max', points: [{ date: '2026-04-10', value: 52 }, { date: '2026-09-10', value: 53 }] };

  it('widens to the shortest range that can draw a line', () => {
    expect(widerRangeWithData(sparse, 7, today)).toBe(180);
    const shown = sliceIndexed({ vo2max: sparse }, 7, today).vo2max!;
    expect(shown).toMatchObject({ window_days: 180, days_with_data: 2 });
  });

  it('keeps the asked range when it already draws, and when nothing longer does better', () => {
    expect(widerRangeWithData(long, 7, today)).toBeNull();
    const single = { ...long, points: [{ date: '2026-09-28', value: 51 }] };
    expect(widerRangeWithData(single, 7, today)).toBeNull();
    expect(widerRangeWithData({ ...long, points: [] }, 7, today)).toBeNull();
  });

  it('falls back to any range with a reading when the asked one is empty', () => {
    const once = { ...long, points: [{ date: '2026-09-10', value: 51 }] };
    expect(widerRangeWithData(once, 7, today)).toBe(30);
  });
});
