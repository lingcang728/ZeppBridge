import type { MetricSeries, MetricSeriesPoint } from '../types';
import { intlLocale } from '../i18n';

/**
 * The three windows the body and training screens offer.
 *
 * Six months is not decoration: VO₂max and lactate threshold are measured a
 * handful of times a year, so a 30-day window shows an empty chart for metrics
 * the library actually holds a year of.
 */
export const SERIES_RANGES = [
  { days: 7, label: '7 天' },
  { days: 30, label: '1 个月' },
  { days: 180, label: '6 个月' },
] as const;

export type SeriesRangeDays = (typeof SERIES_RANGES)[number]['days'];

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
  if (!series) return '尚未同步';
  if (!series.days_with_data) return `近 ${series.window_days} 天无记录`;
  return `${series.window_days} 天里有 ${series.days_with_data} 天记录`;
};

// 刻意不缓存成模块级常量：那样会把语言钉死在模块加载的那一刻，
// 切到英文之后坐标轴上的日期还是中文格式。
const shortDate = (value: string): string => {
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat(intlLocale(), { month: 'numeric', day: 'numeric' }).format(date);
};

/** Seconds per kilometre as `m:ss`, the unit runners actually read. */
export const formatPaceSeconds = (seconds?: number | null): string => {
  if (typeof seconds !== 'number' || !Number.isFinite(seconds) || seconds <= 0) return '—';
  const total = Math.round(seconds);
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
}

const hexToRgba = (hex: string, alpha: number): string => {
  const parsed = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!parsed) return hex;
  const int = Number.parseInt(parsed[1], 16);
  return `rgba(${(int >> 16) & 255}, ${(int >> 8) & 255}, ${int & 255}, ${alpha})`;
};

/**
 * A daily line, drawn only where days actually carry values.
 *
 * `connectNulls` stays off deliberately. A gap in the data is a gap on the
 * chart: joining across a fortnight of silence would draw a trend that was
 * never measured.
 */
export const buildSeriesOption = (
  series: MetricSeries,
  options: SeriesChartOptions,
): Record<string, unknown> => {
  const decimals = options.decimals ?? 0;
  const format = options.format ?? ((value: number) => value.toFixed(decimals));
  const dates = series.points.map((point) => point.date);
  const values = series.points.map((point) => point.value);
  const hasSpread =
    Boolean(options.showSpread)
    && series.points.some((point) => typeof point.min === 'number' && typeof point.max === 'number');

  const spreadBase = series.points.map((point) => (typeof point.min === 'number' ? point.min : null));
  const spreadHeight = series.points.map((point) =>
    typeof point.min === 'number' && typeof point.max === 'number' ? point.max - point.min : null);

  const byDate = new Map<string, MetricSeriesPoint>(
    series.points.map((point) => [point.date, point]),
  );

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
            ? `<br><span style="color:#9AA1A9">当日区间 ${format(point.min)} – ${format(point.max)}${unit}</span>`
            : '';
        const samples = point.samples
          ? `<br><span style="color:#6E757D">${point.samples} 次读数</span>`
          : '';
        return `${point.date}<br><b>${format(point.value)}</b>${unit}${spread}${samples}`;
      },
    },
    xAxis: {
      type: 'category',
      data: dates,
      boundaryGap: false,
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
      {
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
