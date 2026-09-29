import { describe, expect, it } from 'vitest';
import type { MetricSeries } from '../../types';
import { sliceByDate, sliceSeries, windowStartDate } from '../metricSeries';

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
