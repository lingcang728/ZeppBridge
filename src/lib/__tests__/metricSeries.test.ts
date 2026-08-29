import { describe, expect, it } from 'vitest';
import type { MetricSeries } from '../../types';
import {
  buildSeriesOption,
  coverageLabel,
  formatPaceSeconds,
  indexSeries,
  latestValue,
} from '../metricSeries';

const series = (overrides: Partial<MetricSeries> = {}): MetricSeries =>
  ({
    metric: 'resting_hr',
    unit: 'bpm',
    window_days: 180,
    days_with_data: 12,
    points: [
      { date: '2026-01-01', value: 52 },
      { date: '2026-06-01', value: 55 },
    ],
    latest: { date: '2026-06-01', value: 55 },
    ...overrides,
  }) as MetricSeries;

describe('覆盖度要说出来，而不是被曲线抹平', () => {
  it('说清窗口里有多少天真的有记录', () => {
    // 180 天里穿过 12 个点的一条线，不是 180 天的趋势。
    // 读者有权在读出斜率之前知道这件事。
    expect(coverageLabel(series())).toBe('180 天里有 12 天记录');
  });

  it('一天记录都没有时直说无记录', () => {
    expect(coverageLabel(series({ days_with_data: 0 }))).toBe('近 180 天无记录');
  });

  it('还没同步和没有数据是两句不同的话', () => {
    expect(coverageLabel(null)).toBe('尚未同步');
    expect(coverageLabel(undefined)).toBe('尚未同步');
  });
});

describe('最新值', () => {
  it('没有最新值时返回 null，不返回 0', () => {
    expect(latestValue(series({ latest: undefined }))).toBeNull();
    expect(latestValue(null)).toBeNull();
  });

  it('真实的 0 会被保留', () => {
    expect(latestValue(series({ latest: { date: '2026-06-01', value: 0 } }))).toBe(0);
  });

  it('非有限数不算数值', () => {
    expect(
      latestValue(series({ latest: { date: '2026-06-01', value: Number.NaN } })),
    ).toBeNull();
  });
});

describe('按指标名索引', () => {
  it('把数组转成查表', () => {
    const map = indexSeries([series(), series({ metric: 'vo2max' })]);
    expect(Object.keys(map).sort()).toEqual(['resting_hr', 'vo2max']);
    expect(map.vo2max.metric).toBe('vo2max');
  });
});

describe('配速格式', () => {
  it('秒数补零到两位', () => {
    expect(formatPaceSeconds(305)).toBe('5:05');
    expect(formatPaceSeconds(300)).toBe('5:00');
  });

  it('没有配速时给占位符，不给 0:00', () => {
    expect(formatPaceSeconds(null)).toBe('—');
    expect(formatPaceSeconds(undefined)).toBe('—');
    expect(formatPaceSeconds(0)).toBe('—');
  });
});

describe('图表选项', () => {
  it('数据之间的空档不连线', () => {
    // connectNulls 打开的话，中间空掉的两周会被一条直线接起来，
    // 画出一段从来没有被测量过的趋势。
    const option = buildSeriesOption(series(), { color: '#66d9a0' }) as {
      series: Array<Record<string, unknown>>;
    };
    const line = option.series.find((item) => item.type === 'line');
    expect(line?.connectNulls).toBeFalsy();
  });

  it('每个数据点都进入图表，不做重采样', () => {
    const option = buildSeriesOption(series(), { color: '#66d9a0' }) as {
      series: Array<{ data?: unknown[] }>;
    };
    const line = option.series.find((item) => Array.isArray(item.data));
    expect(line?.data).toHaveLength(2);
  });
});
