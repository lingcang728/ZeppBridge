import { displayDateTimeFormatter } from './dateTime';
import { isFiniteNumber } from './format';
import { downsample } from './workoutRoute';
import type { ChartPalette } from './echartsTheme';
import type { WorkoutSeriesSample } from '../types';

/* 运动详情里四张小折线图（心率 / 配速 / 海拔 / 步频）的数据与 ECharts 配置。纯函数。 */

export type SeriesKey = keyof Pick<WorkoutSeriesSample, 'heart_rate' | 'pace' | 'altitude_m' | 'cadence'>;
export type ChartPoint = { t: number; v: number };

/** 取出一列采样，去掉明显不合理的值（心率 20–250、配速 1–60 分/公里、步频 0–300、海拔 -500–10000 米）。 */
export const sampleSeries = (samples: WorkoutSeriesSample[] | undefined, key: SeriesKey): ChartPoint[] => downsample(
  (samples ?? [])
    .map((sample) => ({ t: new Date(sample.timestamp).getTime(), v: sample[key] }))
    .filter((point): point is ChartPoint => {
      if (!Number.isFinite(point.t) || !isFiniteNumber(point.v)) return false;
      if (key === 'heart_rate') return point.v >= 20 && point.v <= 250;
      if (key === 'pace') return point.v >= 1 && point.v < 60;
      if (key === 'cadence') return point.v > 0 && point.v < 300;
      return point.v >= -500 && point.v <= 10_000;
    }),
);

/**
 * 纵轴至少撑开 `minSpan`（围绕数据中点）：海拔图按数据自动缩放时，7–12 米的平路会被画成满屏起伏，
 * 和爬升卡「没有明显爬升」对不上（2026-10-28 录屏）。数据本身跨度够了就不管，交给 ECharts。
 */
export const spannedAxis = (points: ChartPoint[], minSpan: number): { min?: number; max?: number } => {
  if (minSpan <= 0 || !points.length) return {};
  let lo = Infinity;
  let hi = -Infinity;
  for (const p of points) { lo = Math.min(lo, p.v); hi = Math.max(hi, p.v); }
  if (hi - lo >= minSpan) return {};
  const mid = (lo + hi) / 2;
  const min = Math.floor(mid - minSpan / 2);
  return { min, max: min + Math.ceil(minSpan) };
};

/** 秒 → `m:ss`。配速图的纵轴和提示用它：画的已经是「每公里 / 每英里秒数」，这里不再换算单位。 */
export const clockSeconds = (seconds: number): string => {
  const total = Math.round(seconds);
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
};

export interface LineOptionOpts {
  color: string;
  unit: string;
  palette: ChartPalette;
  /** 纵轴至少撑开多少，见 `spannedAxis`。 */
  minSpan?: number;
  /** 纵轴倒过来：配速越快数越小，倒过来「好」才朝上，和别的图一致。 */
  inverse?: boolean;
  /** 纵轴刻度和提示里的数怎么写；不给就是保留一位小数的数字。 */
  format?: (value: number) => string;
}

/** 一张带均值虚线的面积折线图；少于两个点时返回 null（不画图，不编数据）。 */
export const lineOption = (points: ChartPoint[], opts: LineOptionOpts) => {
  const { color, unit, palette, minSpan = 0, inverse = false, format } = opts;
  if (points.length < 2) return null;
  const avg = points.reduce((sum, p) => sum + p.v, 0) / points.length;
  const yRange = spannedAxis(points, minSpan);
  // 时间轴的刻度间隔钉在「整分钟、大约四格」：短短几分钟的记录里 ECharts 会按秒
  // 切刻度，「19:44 19:46 19:48」挤成一串，hideOverlap 管不到时间轴的两级标签。
  const span = points[points.length - 1]!.t - points[0]!.t;
  const tick = Math.max(60_000, Math.ceil(span / 4 / 60_000) * 60_000);
  return {
    animation: false,
    grid: { left: 8, right: 18, top: 12, bottom: 8, containLabel: true },
    xAxis: {
      type: 'time',
      splitNumber: 4,
      minInterval: tick,
      maxInterval: tick,
      axisLine: { show: false },
      axisTick: { show: false },
      axisLabel: { color: palette.axis, fontSize: 14.5, hideOverlap: true, formatter: '{HH}:{mm}' },
      splitLine: { show: false },
    },
    yAxis: {
      type: 'value',
      scale: true,
      ...yRange,
      inverse,
      axisLine: { show: false },
      axisTick: { show: false },
      axisLabel: { color: palette.axis, fontSize: 14.5, ...(format ? { formatter: format } : {}) },
      splitLine: { show: true, lineStyle: { color: palette.gridSoft, type: 'dashed' } },
    },
    tooltip: {
      trigger: 'axis',
      backgroundColor: palette.tooltipBg,
      borderColor: palette.tooltipBorder,
      borderWidth: 1,
      textStyle: { color: palette.tooltipText, fontSize: 15.5 },
      formatter: (params: Array<{ value: [number, number] }>) => {
        const point = Array.isArray(params) ? params[0] : params;
        if (!point) return '';
        const time = displayDateTimeFormatter({ hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(point.value[0]));
        const value = format ? format(point.value[1]) : String(Math.round(point.value[1] * 10) / 10);
        return `${time}　<b>${value}</b> ${unit}`;
      },
    },
    series: [{
      type: 'line',
      data: points.map((point) => [point.t, point.v]),
      smooth: 0.2,
      showSymbol: false,
      lineStyle: { width: 2, color },
      areaStyle: {
        color: {
          type: 'linear',
          x: 0,
          y: 0,
          x2: 0,
          y2: 1,
          colorStops: [
            { offset: 0, color: `${color}40` },
            { offset: 1, color: `${color}00` },
          ],
        },
      },
      markLine: {
        silent: true,
        symbol: 'none',
        lineStyle: { type: 'dashed', color: palette.mark, width: 1.2 },
        data: [{ yAxis: Math.round(avg) }],
        label: { show: false },
      },
    }],
  };
};

/* ── 卡变大就多画细节（2026-11-13 用户：卡拉大了内容也该多，不是同一张图放大）。 ──
   整场一直都画（不截取一段）；中档：时间刻度更密、平均线标上数；大档：再标出最高 / 最低点，心率图叠上手表划的区间色带。
   只画已有的数：没有区间就不画色带，不编数据。 */
export type ChartTier = 'sm' | 'md' | 'lg';
export const chartTier = (width: number): ChartTier => (width >= 820 ? 'lg' : width >= 520 ? 'md' : 'sm');
export interface ChartBand { index: number; low: number | null; high: number }
export interface ChartDetail {
  color: string;
  palette: ChartPalette;
  format?: (value: number) => string;
  /** 心率区间（手表随运动下发的上界），从低到高。 */
  bands?: ChartBand[];
}
type LineOption = NonNullable<ReturnType<typeof lineOption>>;

export const withDetail = (option: LineOption, tier: ChartTier, detail: ChartDetail): LineOption => {
  if (tier === 'sm') return option;
  const [series] = option.series;
  const data = series.data;
  const span = data[data.length - 1]![0] - data[0]![0];
  const parts = tier === 'lg' ? 8 : 6;
  const tick = Math.max(60_000, Math.ceil(span / parts / 60_000) * 60_000);
  const fmt = (value: number) => (detail.format ? detail.format(value) : String(Math.round(value)));
  const { palette, color } = detail;
  const label = { color: palette.axis, fontSize: 12.5, fontWeight: 600 };
  const next: LineOption & { series: Array<LineOption['series'][number] & Record<string, unknown>> } = {
    ...option,
    xAxis: { ...option.xAxis, splitNumber: parts, minInterval: tick, maxInterval: tick },
    series: [{
      ...series,
      markLine: {
        ...series.markLine,
        label: { show: true, position: 'insideEndTop', ...label, formatter: (p: { value: number }) => fmt(p.value) },
      },
    }],
  };
  if (tier === 'lg') {
    next.series[0].markPoint = {
      symbol: 'circle',
      symbolSize: 8,
      itemStyle: { color, borderColor: palette.surface, borderWidth: 2 },
      label: { show: true, position: 'top', distance: 6, ...label, color: palette.tooltipText, formatter: (p: { value: number }) => fmt(p.value) },
      data: [{ type: 'max' }, { type: 'min' }],
    };
    if (detail.bands?.length) {
      next.series[0].markArea = {
        silent: true,
        label: { show: true, position: 'insideRight', color: palette.axis, fontSize: 11 },
        data: detail.bands.map((band, i) => [
          { yAxis: band.low ?? 0, name: `Z${band.index}`, itemStyle: { color: `${color}${i % 2 ? '14' : '08'}` } },
          { yAxis: band.high },
        ]),
      };
    }
  }
  return next;
};
