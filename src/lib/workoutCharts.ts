import { displayDateTimeFormatter } from './dateTime';
import { isFiniteNumber } from './format';
import { downsample } from './workoutRoute';
import type { AxisRange } from './chartAxis';
import type { ChartPalette } from './echartsTheme';
import type { WorkoutSeriesSample } from '../types';

/* 运动详情里的逐点折线图（心率 / 配速 / 海拔 / 步频）的数据与 ECharts 配置。纯函数。 */

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
 * 秒 → `m'ss"`。配速图的纵轴、提示、标注和卡头统计都用这一种写法（2026-11-14 用户截图：
 * 轴上是 8:20、卡头是 2'18"，两套写法对不上）。画的已经是「每公里 / 每英里秒数」，这里不再换算单位。
 */
export const paceSeconds = (seconds: number): string => {
  const total = Math.round(seconds);
  return `${Math.floor(total / 60)}'${String(total % 60).padStart(2, '0')}"`;
};

export interface LineOptionOpts {
  color: string;
  unit: string;
  palette: ChartPalette;
  /** 纵轴范围（chartAxis.ts 算好的）；不给就交给 ECharts 按数据缩放。 */
  axis?: AxisRange | null;
  /** 纵轴倒过来：配速越快数越小，倒过来「好」才朝上，和别的图一致。 */
  inverse?: boolean;
  /** 纵轴刻度和提示里的数怎么写；不给就是保留一位小数的数字。 */
  format?: (value: number) => string;
  /** 均值线画在哪（配速用 距离 ÷ 运动时间，和卡头、概要卡同一个数）；不给就是这些点的算术平均。 */
  average?: number | null;
}

/** 一张带均值虚线的面积折线图；少于两个点时返回 null（不画图，不编数据）。 */
export const lineOption = (points: ChartPoint[], opts: LineOptionOpts) => {
  const { color, unit, palette, axis, inverse = false, format } = opts;
  if (points.length < 2) return null;
  const avg = isFiniteNumber(opts.average) ? opts.average : points.reduce((sum, p) => sum + p.v, 0) / points.length;
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
      ...(axis ? { min: axis.min, max: axis.max, interval: axis.interval } : {}),
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
      clip: true,
      lineStyle: { width: 2, color },
      areaStyle: {
        // 面积从线往「差」的那一头填：倒过来的配速轴里差（慢）在下面，所以填到轴最大值那一端
        // （曾经填到最小值，也就是顶上——用户截图里配速像倒挂着）。
        origin: inverse ? 'end' : 'start',
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
        data: [{ yAxis: format ? avg : Math.round(avg) }],
        label: { show: false },
      },
    }],
  };
};

/* ── 卡变大就多画细节（2026-11-13 用户：卡拉大了内容也该多，不是同一张图放大）。 ──
   整场一直都画（不截取一段）。档位按卡的宽 × 高（2026-11-14：只按宽分档，拉高了什么都不加）：
   中档：时间刻度更密、平均线标上数、暂停段铺灰；
   大档：再标出最高 / 最低点，心率图按手表划的区间分色（色带 + 折线分段着色，区间名在右侧槽里）。
   只画已有的数：没有区间就不画色带，不编数据。 */
export type ChartTier = 'sm' | 'md' | 'lg';
export const chartTier = (width: number, height = Infinity): ChartTier => {
  if (width >= 760 && height >= 360) return 'lg';
  if (width >= 440 && height >= 250) return 'md';
  return 'sm';
};
export interface ChartBand { index: number; low: number | null; high: number }
export interface ChartDetail {
  color: string;
  palette: ChartPalette;
  format?: (value: number) => string;
  /** 心率区间（手表随运动下发的上界），从低到高。 */
  bands?: ChartBand[];
  /** 区间色（按 band.index 取，和心率区间卡同一套）。 */
  zoneColor?: (index: number) => string;
  /** 暂停段（毫秒时间戳）。 */
  pauses?: Array<{ start: number; end: number }>;
  /** 大档标出来的两个极值点；不给就是数据的最高 / 最低。配速给剔除停顿后的最快 / 最慢，和卡头一致。 */
  extremes?: ChartPoint[];
}
type LineOption = NonNullable<ReturnType<typeof lineOption>>;
type AreaEdge = { xAxis?: number; yAxis?: number; name?: string; itemStyle?: Record<string, unknown>; label?: Record<string, unknown> };

/** 心率区间：只留和纵轴有交集的几段，夹到轴范围里（轴外的区间名不浮在图外）。 */
const visibleBands = (bands: ChartBand[], values: number[]) => {
  const lo = Math.min(...values);
  const hi = Math.max(...values);
  return bands
    .map((band) => ({ ...band, low: band.low ?? -Infinity }))
    .filter((band) => band.high > lo && band.low < hi)
    .map((band) => ({ index: band.index, from: Math.max(band.low, lo), to: Math.min(band.high, hi), low: band.low, high: band.high }));
};

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
  const areas: Array<[AreaEdge, AreaEdge]> = [];
  for (const pause of detail.pauses ?? []) {
    areas.push([{ xAxis: pause.start, itemStyle: { color: `${palette.axis}1f` } }, { xAxis: pause.end }]);
  }
  const zoneColor = detail.zoneColor ?? (() => color);
  const bands = tier === 'lg' && detail.bands?.length ? visibleBands(detail.bands, data.map((d) => d[1])) : [];
  for (const band of bands) {
    const tone = zoneColor(band.index);
    areas.push([
      { yAxis: band.from, name: `Z${band.index}`, itemStyle: { color: `${tone}1c` }, label: { color: tone } },
      { yAxis: band.to },
    ]);
  }
  const line: Record<string, unknown> = {
    ...series,
    // 按区间分段着色时线不能自带颜色：显式的 lineStyle.color 会盖过 visualMap。
    lineStyle: bands.length ? { width: series.lineStyle.width } : series.lineStyle,
    markLine: {
      ...series.markLine,
      // 均值的数标在左端：右端是区间名的位置。
      label: { show: true, position: bands.length ? 'insideStartTop' : 'insideEndTop', ...label, formatter: (p: { value: number }) => fmt(p.value) },
    },
    ...(areas.length ? {
      markArea: {
        silent: true,
        label: { show: true, position: 'right', distance: 6, fontSize: 11, fontWeight: 600 },
        data: areas,
      },
    } : {}),
  };
  const next = {
    ...option,
    // 区间名放在绘图区右侧的槽里，不压在折线上；大档顶上多留一点给最高点的标注（曾被裁掉半截）。
    grid: { ...option.grid, top: tier === 'lg' ? 28 : option.grid.top, right: bands.length ? 44 : option.grid.right },
    xAxis: { ...option.xAxis, splitNumber: parts, minInterval: tick, maxInterval: tick },
    series: [line],
  } as unknown as LineOption & Record<string, unknown>;
  if (bands.length) {
    // 折线按区间分段着色（成熟的运动软件都这么画）：一眼看出哪段在哪个区间。
    next.visualMap = {
      show: false,
      type: 'piecewise',
      seriesIndex: 0,
      dimension: 1,
      pieces: bands.map((band) => ({ ...(Number.isFinite(band.low) ? { gt: band.low } : {}), lte: band.high, color: zoneColor(band.index) })),
      outOfRange: { color },
    };
  }
  if (tier === 'lg') {
    const points = detail.extremes?.length ? detail.extremes.map((p) => ({ coord: [p.t, p.v], value: p.v })) : [{ type: 'max' }, { type: 'min' }];
    line.markPoint = {
      symbol: 'circle',
      symbolSize: 8,
      itemStyle: { color, borderColor: palette.surface, borderWidth: 2 },
      label: { show: true, position: 'top', distance: 6, ...label, color: palette.tooltipText, formatter: (p: { value: number }) => fmt(p.value) },
      data: points,
    };
  }
  return next;
};

/**
 * 纵轴刻度跟着图的高走（2026-11-14：舞台上一列叠三张图时，配速轴 3'10"…4'00" 六个刻度挤成一团）：
 * 每个刻度至少 PX_PER_TICK 像素，给定的间隔太密就按整倍数放宽（轴的上下界不动，刻度仍落在整数上）。
 * 没给轴范围（ECharts 自己切）时只限 splitNumber。
 */
const PX_PER_TICK = 34;
export const fitTicks = <T extends LineOption>(option: T, plotHeight: number): T => {
  const most = Math.max(2, Math.floor(plotHeight / PX_PER_TICK));
  const y = option.yAxis as LineOption['yAxis'] & { min?: number; max?: number; interval?: number; splitNumber?: number };
  if (y.min == null || y.max == null || !y.interval) return { ...option, yAxis: { ...y, splitNumber: Math.min(5, most) } };
  // 按格数算（整数），不在浮点上取余：n 格里挑最小的约数 d，让 n / d 不超过 most，刻度仍落在原来的整刻度上。
  const n = Math.round((y.max - y.min) / y.interval);
  if (n <= most) return option;
  let d = 2;
  while (d < n && (n % d !== 0 || n / d > most)) d += 1;
  return { ...option, yAxis: { ...y, interval: y.interval * d } };
};
