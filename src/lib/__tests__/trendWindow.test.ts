import { describe, expect, it } from 'vitest';
import { formatDay, spanDays, validCustomRange } from '../trendWindow';
import { sliceByDate, sliceSeries, windowStartDate } from '../metricSeries';
import { rangeBounds } from '../hourlySteps';
import type { MetricSeries } from '../../types';

const today = new Date(2026, 10, 22); // 2026-11-22

describe('trendWindow', () => {
  it('跨度含首尾', () => {
    expect(spanDays({ from: '2026-11-01', to: '2026-11-07' })).toBe(7);
    expect(spanDays({ from: '2026-11-22', to: '2026-11-22' })).toBe(1);
    // 跨夏令时的天数也不能差一天
    expect(spanDays({ from: '2026-03-28', to: '2026-03-30' })).toBe(3);
  });

  it('校验：起不晚于止、止不晚于今天、起不早于能取到的最早一天、至少两天', () => {
    expect(validCustomRange({ from: '2026-11-01', to: '2026-11-10' }, today)).toBe(true);
    expect(validCustomRange({ from: '2026-11-10', to: '2026-11-01' }, today)).toBe(false);
    expect(validCustomRange({ from: '2026-11-10', to: '2026-11-23' }, today)).toBe(false);
    expect(validCustomRange({ from: '2026-11-22', to: '2026-11-22' }, today)).toBe(false);
    expect(validCustomRange({ from: '2025-11-23', to: '2026-11-22' }, today)).toBe(true);
    expect(validCustomRange({ from: '2025-11-22', to: '2026-11-22' }, today)).toBe(false);
    expect(validCustomRange({ from: 'x', to: '2026-11-22' }, today)).toBe(false);
  });

  it('formatDay 是本地日期', () => {
    expect(formatDay(new Date(2026, 0, 5))).toBe('2026-01-05');
  });
});

describe('以过去某天为终点切序列', () => {
  const end = new Date(2026, 10, 10); // 范围止于 11-10
  const points = Array.from({ length: 30 }, (_, index) => ({ date: formatDay(new Date(2026, 10, 1 + index)), value: index + 1 }));
  const series = { metric: 'steps', unit: 'steps', source: 'daily_metrics', points, days_with_data: 30, window_days: 30 } as MetricSeries;

  it('windowStartDate / rangeBounds 以传入的终点为准', () => {
    expect(windowStartDate(3, end)).toBe('2026-11-08');
    expect(rangeBounds(3, end)).toEqual({ start: '2026-11-08', end: '2026-11-10' });
  });

  it('sliceSeries 只取起止之间的日子，并算前一段的平均', () => {
    const sliced = sliceSeries(series, 5, end); // 11-06 .. 11-10，前一段 11-01 .. 11-05
    expect(sliced.points.map((point) => point.date)).toEqual(['2026-11-06', '2026-11-07', '2026-11-08', '2026-11-09', '2026-11-10']);
    expect(sliced.average).toBe(8);
    expect(sliced.previous_average).toBe(3);
  });

  it('sliceByDate 也不能越过终点', () => {
    const rows = points.map((point) => ({ date: point.date }));
    const kept = sliceByDate(rows, 3, end);
    expect(kept.map((row) => row.date)).toEqual(['2026-11-08', '2026-11-09', '2026-11-10']);
  });
});
