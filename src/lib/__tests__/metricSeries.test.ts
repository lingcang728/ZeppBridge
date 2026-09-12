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

describe('手动记录的日子不能被画成连续的', () => {
  const logged = series({
    metric: 'intake_calories',
    unit: 'kcal',
    window_days: 30,
    days_with_data: 3,
    // 记了 1 号、2 号，跳过 3 号和 4 号，再记 5 号。
    points: [
      { date: '2026-03-01', value: 2100 },
      { date: '2026-03-02', value: 1980 },
      { date: '2026-03-05', value: 2260 },
    ],
    latest: { date: '2026-03-05', value: 2260 },
  } as Partial<MetricSeries>);

  it('默认那条轴根本没有缺的日子——所以线会直接连过去', () => {
    // 这不是断言「应该这样」，是把现状钉住：默认轴只放有值的日子，
    // 3 号和 4 号不是 null，是压根不存在。体重这种天天称的还好，
    // 手动记录的必须开 calendarAxis。
    const option = buildSeriesOption(logged, { color: '#fff' });
    expect(option.xAxis).toMatchObject({ data: ['2026-03-01', '2026-03-02', '2026-03-05'] });
  });

  it('开了 calendarAxis，没记的日子在轴上留空', () => {
    const option = buildSeriesOption(logged, { color: '#fff', chart: 'bar', calendarAxis: true });
    expect(option.xAxis).toMatchObject({
      data: ['2026-03-01', '2026-03-02', '2026-03-03', '2026-03-04', '2026-03-05'],
    });
    const [bars] = option.series as Array<{ type: string; data: Array<number | null> }>;
    expect(bars.type).toBe('bar');
    // 缺的两天是 null，不是 0：没记不等于没吃。
    expect(bars.data).toEqual([2100, 1980, null, null, 2260]);
  });
});
