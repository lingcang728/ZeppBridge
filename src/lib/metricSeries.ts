import type { MetricSeries, MetricSeriesPoint } from '../types';
import { paceSecondsPerBigUnit } from './units';
import { defineMessages, intlLocale, messagesOf } from '../i18n';
import { DISPLAY_RANGE_DAYS, rangeOptions } from './rangeOptions';

const messages = defineMessages(
  {
    notSyncedYet: '尚未同步',
    noRecordsInWindow: (days: number) => `近 ${days} 天无记录`,
    coverage: (days: number, withData: number) => `${days} 天里有 ${withData} 天记录`,
    dayRange: (low: string, high: string, unit: string) => `当日区间 ${low} – ${high}${unit}`,
    samples: (count: number) => `${count} 次读数`,
  },
  {
    notSyncedYet: 'Not synced yet',
    noRecordsInWindow: (days: number) => `No records in the last ${days} days`,
    coverage: (days: number, withData: number) => `${withData} of ${days} days have records`,
    dayRange: (low: string, high: string, unit: string) => `That day ranged ${low} – ${high}${unit}`,
    samples: (count: number) => `${count} readings`,
  },
);

const copy = () => messagesOf(messages);

/**
 * The three windows the body and training screens offer.
 *
 * Six months is not decoration: VO₂max and lactate threshold are measured a
 * handful of times a year, so a 30-day window shows an empty chart for metrics
 * the library actually holds a year of.
 */
export const SERIES_RANGE_DAYS = DISPLAY_RANGE_DAYS;

export type SeriesRangeDays = (typeof DISPLAY_RANGE_DAYS)[number];

/** 范围切换按钮的文字。跟着当前语言走，所以是函数而不是常量数组。 */
export const seriesRanges = (): Array<{ days: SeriesRangeDays; label: string }> =>
  rangeOptions(DISPLAY_RANGE_DAYS);

/** Index a `getMetricSeries` response by metric name. */
export const indexSeries = (series: MetricSeries[]): Record<string, MetricSeries> => {
  const map: Record<string, MetricSeries> = {};
  for (const item of series) map[item.metric] = item;
  return map;
};

export const latestValue = (series?: MetricSeries | null): number | null => {
  const value = series?.latest?.value;
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
};

/**
 * How much of the window is actually covered.
 *
 * Stated rather than smoothed over: a line drawn through 12 readings across
 * 180 days is not a 180-day trend, and the reader deserves to know that before
 * reading a slope into it.
 */
export const coverageLabel = (series?: MetricSeries | null): string => {
  const t = copy();
  if (!series) return t.notSyncedYet;
  if (!series.days_with_data) return t.noRecordsInWindow(series.window_days);
  return t.coverage(series.window_days, series.days_with_data);
};

// 刻意不缓存成模块级常量：那样会把语言钉死在模块加载的那一刻，
// 切到英文之后坐标轴上的日期还是中文格式。
const shortDate = (value: string): string => {
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat(intlLocale(), { month: 'numeric', day: 'numeric' }).format(date);
};

/** Seconds per kilometre as `m:ss`, the unit runners actually read. */
/**
 * 每公里秒 → `m:ss`。跟随当前距离单位（英制下是每英里）。
 *
 * 单位后缀不在这里拼：调用点有的把它放进 `<i>` 里、有的放进 tooltip。
 * 它们统一用 `paceUnitLabel()`。
 */
export const formatPaceSeconds = (secondsPerKm?: number | null): string => {
  if (typeof secondsPerKm !== 'number' || !Number.isFinite(secondsPerKm) || secondsPerKm <= 0) {
    return '—';
  }
  const total = Math.round(paceSecondsPerBigUnit(secondsPerKm));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
};

export interface SeriesChartOptions {
  color: string;
  /** Decimal places for tooltips and axis labels. */
  decimals?: number;
  /** Render the day's measured spread as a band behind the line. */
  showSpread?: boolean;
  /** Format a value for the tooltip; defaults to a fixed-decimal number. */
  format?: (value: number) => string;
  unit?: string;
  /** Bars instead of a line. For values that are counted per day, not sampled. */
  chart?: 'line' | 'bar';
  /**
   * Put every calendar day between the first and last reading on the axis,
   * including the ones with no reading.
   *
   * Off by default the axis holds **only the days that carry a value**, so two
   * readings a week apart sit in neighbouring slots and the line runs straight
   * between them — the missing days are not drawn as gaps, they are not drawn
   * at all. For something measured most days that is a small distortion. For
   * something logged by hand it is not: it turns "I logged 51 of these 60 days"
   * into a picture of an unbroken habit.
   */
  calendarAxis?: boolean;
}

/** Every ISO day from `first` to `last`, inclusive. */
const calendarSpan = (first: string, last: string): string[] => {
  const start = new Date(`${first}T00:00:00Z`);
  const end = new Date(`${last}T00:00:00Z`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end < start) return [];
  const days: string[] = [];
  // 一年半的窗口最多 ~550 天，直接展开即可。
  for (let day = start; day <= end; day = new Date(day.getTime() + 86_400_000)) {
    days.push(day.toISOString().slice(0, 10));
  }
  return days;
};

const hexToRgba = (hex: string, alpha: number): string => {
  const parsed = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!parsed) return hex;
  const int = Number.parseInt(parsed[1], 16);
  return `rgba(${(int >> 16) & 255}, ${(int >> 8) & 255}, ${int & 255}, ${alpha})`;
};

/**
 * A daily line (or bars), drawn only where days actually carry values.
 *
 * `connectNulls` stays off deliberately. A gap in the data is a gap on the
 * chart: joining across a fortnight of silence would draw a trend that was
 * never measured.
 *
 * That promise only holds with `calendarAxis`. Without it the axis is built
 * from the points themselves, so a missing day is not a null — it is simply
 * absent, and the line closes over it as if the days were adjacent. Anything
 * recorded by hand should pass `calendarAxis: true`.
 */
export const buildSeriesOption = (
  series: MetricSeries,
  options: SeriesChartOptions,
): Record<string, unknown> => {
  const decimals = options.decimals ?? 0;
  const format = options.format ?? ((value: number) => value.toFixed(decimals));
  const bar = options.chart === 'bar';

  const byDate = new Map<string, MetricSeriesPoint>(
    series.points.map((point) => [point.date, point]),
  );

  // 有值的日子是数据；轴上多出来的日子是 null，`connectNulls: false` 让线断开、
  // 让柱子缺席。两种画法下「那天没有记录」都不会被画成一个值。
  const dates = options.calendarAxis && series.points.length
    ? calendarSpan(series.points[0].date, series.points[series.points.length - 1].date)
    : series.points.map((point) => point.date);
  const at = (date: string) => byDate.get(date) ?? null;
  const values = dates.map((date) => at(date)?.value ?? null);
  const hasSpread =
    Boolean(options.showSpread)
    && series.points.some((point) => typeof point.min === 'number' && typeof point.max === 'number');

  const spreadBase = dates.map((date) => {
    const point = at(date);
    return typeof point?.min === 'number' ? point.min : null;
  });
  const spreadHeight = dates.map((date) => {
    const point = at(date);
    return typeof point?.min === 'number' && typeof point.max === 'number'
      ? point.max - point.min
      : null;
  });

  return {
    animationDuration: 600,
    grid: { left: 42, right: 14, top: 16, bottom: 26 },
    tooltip: {
      trigger: 'axis',
      formatter: (params: Array<{ axisValue: string }>) => {
        const axisValue = Array.isArray(params) ? params[0]?.axisValue : undefined;
        const point = axisValue ? byDate.get(axisValue) : undefined;
        if (!point) return '';
        const unit = options.unit ? ` ${options.unit}` : '';
        const spread =
          typeof point.min === 'number' && typeof point.max === 'number'
            ? `<br><span style="color:#9AA1A9">${copy().dayRange(format(point.min), format(point.max), unit)}</span>`
            : '';
        const samples = point.samples
          ? `<br><span style="color:#6E757D">${copy().samples(point.samples)}</span>`
          : '';
        return `${point.date}<br><b>${format(point.value)}</b>${unit}${spread}${samples}`;
      },
    },
    xAxis: {
      type: 'category',
      data: dates,
      boundaryGap: bar,
      axisLabel: { formatter: shortDate, hideOverlap: true, fontSize: 10 },
      splitLine: { show: false },
    },
    yAxis: {
      type: 'value',
      scale: true,
      splitNumber: 3,
      axisLabel: { fontSize: 10, formatter: (value: number) => format(value) },
    },
    series: [
      ...(hasSpread
        ? [
            {
              type: 'line',
              data: spreadBase,
              stack: 'spread',
              lineStyle: { opacity: 0 },
              showSymbol: false,
              silent: true,
              tooltip: { show: false },
            },
            {
              type: 'line',
              data: spreadHeight,
              stack: 'spread',
              lineStyle: { opacity: 0 },
              showSymbol: false,
              silent: true,
              tooltip: { show: false },
              areaStyle: { color: hexToRgba(options.color, 0.14) },
            },
          ]
        : []),
      bar
        ? {
            type: 'bar',
            data: values,
            barMaxWidth: 14,
            itemStyle: { color: options.color, borderRadius: [2, 2, 0, 0] },
          }
        : {
            type: 'line',
            data: values,
            smooth: 0.2,
            connectNulls: false,
            showSymbol: series.points.length <= 14,
            symbolSize: 5,
            itemStyle: { color: options.color },
            lineStyle: { width: 2, color: options.color, cap: 'round' },
          },
    ],
  };
};
