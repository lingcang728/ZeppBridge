import { displayDateTimeFormatter, parseDisplayDate } from './dateTime';
import type { MetricSeries, MetricSeriesPoint } from '../types';
import { paceSecondsPerBigUnit } from './units';
import { defineMessages, messagesOf } from '../i18n';
import { DISPLAY_RANGE_DAYS, rangeOptions } from './rangeOptions';
import { resolvedTheme } from '../composables/useTheme';
import { chartPalettes } from './echartsTheme';

const messages = defineMessages(
  {
    noRecordsToShow: '没有可显示的记录',
    noRecordsInWindow: (days: number) => `近 ${days} 天无记录`,
    coverage: (days: number, withData: number) => `${days} 天里有 ${withData} 天记录`,
    dayRange: (low: string, high: string, unit: string) => `当日区间 ${low} – ${high}${unit}`,
    samples: (count: number) => `${count} 次读数`,
  },
  {
    noRecordsToShow: 'No records to show',
    noRecordsInWindow: (days: number) => `No records in the last ${days} days`,
    coverage: (days: number, withData: number) => `${withData} of ${days} days have records`,
    dayRange: (low: string, high: string, unit: string) => `That day ranged ${low} – ${high}${unit}`,
    samples: (count: number) => `${count} readings`,
  },
  {
    noRecordsToShow: 'Sin registros que mostrar',
    noRecordsInWindow: (days: number) => `Sin registros en los últimos ${days} días`,
    coverage: (days: number, withData: number) => `${withData} de ${days} días tienen registros`,
    dayRange: (low: string, high: string, unit: string) => `Ese día varió entre ${low} y ${high}${unit}`,
    samples: (count: number) => `${count} lecturas`,
  },
  'lib/metricSeries',
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

/** 页面一次取多长：三档里最长的那档。短的两档从它尾部切出来（sliceSeries）。 */
export const SERIES_FETCH_DAYS = Math.max(...DISPLAY_RANGE_DAYS);

const shiftDate = (date: string, days: number): string => {
  const [y, m, d] = date.split('-').map(Number);
  const next = new Date(y!, m! - 1, d! + days);
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${next.getFullYear()}-${pad(next.getMonth() + 1)}-${pad(next.getDate())}`;
};

/** 范围第一天：今天往回数 `days` 天（含今天），本地日。和后端 `end - (days - 1)` 同一个算法。 */
export const windowStartDate = (days: number, today = new Date()): string => {
  const pad = (value: number) => String(value).padStart(2, '0');
  const end = `${today.getFullYear()}-${pad(today.getMonth() + 1)}-${pad(today.getDate())}`;
  return shiftDate(end, -(Math.max(1, Math.round(days)) - 1));
};

/** 和后端 storage/util.rs 的 round1 一致（值都是非负的健康读数，四舍五入方向不影响）。 */
const round1 = (value: number) => Math.round(value * 10) / 10;

/**
 * 从一份长窗口序列的尾部切出最近 `days` 天，重算这一段的最新 / 平均 / 最低 / 最高 / 覆盖。
 *
 * 后端每个点只取决于那一天本身（按天聚合），和请求的窗口长短无关，所以「取 180 天再切
 * 出 7 天」和「直接取 7 天」逐字段相同（`get_metric_series` 的算法见 storage/metrics.rs）。
 * 切范围因此不用再走一趟 IPC + SQLite：点下去同一帧图表就开始换。
 */
export const sliceSeries = (series: MetricSeries, days: number, today = new Date()): MetricSeries => {
  const start = windowStartDate(days, today);
  const end = windowStartDate(1, today);
  const points = series.points.filter((point) => point.date >= start && point.date <= end);
  const values = points.map((point) => point.value).filter((value) => Number.isFinite(value));
  return {
    ...series,
    points,
    latest: points[points.length - 1] ?? null,
    average: values.length ? round1(values.reduce((sum, value) => sum + value, 0) / values.length) : null,
    minimum: values.length ? Math.min(...values) : null,
    maximum: values.length ? Math.max(...values) : null,
    days_with_data: points.length,
    window_days: Math.max(1, Math.round(days)),
  };
};

/** `sliceSeries` 作用到一整份按名字索引的序列上。 */
export const sliceIndexed = (
  series: Record<string, MetricSeries>,
  days: number,
  today = new Date(),
): Record<string, MetricSeries> => {
  const out: Record<string, MetricSeries> = {};
  for (const [name, item] of Object.entries(series)) out[name] = sliceSeries(item, days, today);
  return out;
};

/** 按日期的数组（训练负荷平衡、日最高心率）同样从尾部切。 */
export const sliceByDate = <T extends { date: string }>(rows: T[], days: number, today = new Date()): T[] => {
  const start = windowStartDate(days, today);
  return rows.filter((row) => row.date >= start);
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
  // 调用方没给 series ≠ 尚未同步。那是同步状态，这里只谈能不能画出记录。
  if (!series) return t.noRecordsToShow;
  if (!series.days_with_data) return t.noRecordsInWindow(series.window_days);
  return t.coverage(series.window_days, series.days_with_data);
};

// 刻意不缓存成模块级常量：那样会把语言钉死在模块加载的那一刻，
// 切到英文之后坐标轴上的日期还是中文格式。
const shortDate = (value: string): string => {
  // 纯日历日期按本地年月日解析：本地构造会把 2026-02-30 滚成 3 月 2 日，
  // parseDisplayDate 对不上就返回 Invalid Date，这里原样返回，不画假日子。
  const date = parseDisplayDate(value);
  if (Number.isNaN(date.getTime())) return value;
  return displayDateTimeFormatter({ month: 'numeric', day: 'numeric' }).format(date);
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
/**
 * 趋势图换数据（切范围、同步来了新数据）时的更新方式：整张换，新线从左往右重新画一遍。
 *
 * 以前是合并更新，让 ECharts 把旧线形「变」成新线形。可 7 天、1 个月、6 个月的点数
 * 不一样，ECharts 按下标对点：多出来的点从两头长出来、少掉的点缩回去，变的那半秒里
 * 线的左右两端各缺一截，看着像画坏了。重画一遍反而干净，而且每张图是排队一帧一张
 * 换的（useQueuedOption），整页像一道波扫过去。
 */
export const SMOOTH_CHART_UPDATE = { notMerge: true };

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
    // 首次出现不扫入（省下整张画布逐帧重画）；切范围时整张重画（见 SMOOTH_CHART_UPDATE）。
    animationDuration: 0,
    animationEasing: 'cubicOut' as const,
    animationDurationUpdate: 360,
    animationEasingUpdate: 'cubicInOut' as const,
    // 右边留够半个日期标签的宽度：最后一个日期居中在最右那一点上，留 14px 时「28/09」会被
    // 画布裁成「28/0」。（不用 alignMaxLabel 贴边：贴边以后会和前一个标签叠在一起。）
    grid: { left: 42, right: 24, top: 16, bottom: 26 },
    tooltip: {
      trigger: 'axis',
      formatter: (params: Array<{ axisValue: string }>) => {
        const axisValue = Array.isArray(params) ? params[0]?.axisValue : undefined;
        const point = axisValue ? byDate.get(axisValue) : undefined;
        if (!point) return '';
        const unit = options.unit ? ` ${options.unit}` : '';
        const palette = chartPalettes[resolvedTheme.value];
        const spread =
          typeof point.min === 'number' && typeof point.max === 'number'
            ? `<br><span style="color:${palette.tooltipSub}">${copy().dayRange(format(point.min), format(point.max), unit)}</span>`
            : '';
        const samples = point.samples
          ? `<br><span style="color:${palette.tooltipDim}">${copy().samples(point.samples)}</span>`
          : '';
        return `${shortDate(point.date)}<br><b>${format(point.value)}</b>${unit}${spread}${samples}`;
      },
    },
    xAxis: {
      type: 'category',
      data: dates,
      boundaryGap: bar,
      axisLabel: { formatter: shortDate, hideOverlap: true, fontSize: 11 },
      splitLine: { show: false },
    },
    yAxis: {
      type: 'value',
      scale: true,
      splitNumber: 3,
      axisLabel: { fontSize: 11, formatter: (value: number) => format(value) },
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
            itemStyle: { color: options.color, borderRadius: [4, 4, 1, 1] },
          }
        : {
            type: 'line',
            data: values,
            smooth: 0.2,
            connectNulls: false,
            showSymbol: series.points.length <= 14,
            symbolSize: 5,
            itemStyle: { color: options.color },
            lineStyle: { width: 2.2, color: options.color, cap: 'round' },
            // 线下一层从上到下淡掉的光：有体积感，又不会被读成「面积」数据。有区间阴影时不叠。
            ...(hasSpread ? {} : {
              areaStyle: {
                color: {
                  type: 'linear', x: 0, y: 0, x2: 0, y2: 1,
                  colorStops: [{ offset: 0, color: hexToRgba(options.color, 0.2) }, { offset: 1, color: hexToRgba(options.color, 0) }],
                },
              },
            }),
          },
    ],
  };
};
