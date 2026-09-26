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

/** 一张带均值虚线的面积折线图；少于两个点时返回 null（不画图，不编数据）。 */
export const lineOption = (points: ChartPoint[], color: string, unit: string, palette: ChartPalette) => {
  if (points.length < 2) return null;
  const avg = points.reduce((sum, p) => sum + p.v, 0) / points.length;
  return {
    animation: false,
    grid: { left: 8, right: 18, top: 12, bottom: 8, containLabel: true },
    xAxis: {
      type: 'time',
      splitNumber: 4,
      axisLine: { show: false },
      axisTick: { show: false },
      axisLabel: { color: palette.axis, fontSize: 14.5, hideOverlap: true, formatter: '{HH}:{mm}' },
      splitLine: { show: false },
    },
    yAxis: {
      type: 'value',
      scale: true,
      axisLine: { show: false },
      axisTick: { show: false },
      axisLabel: { color: palette.axis, fontSize: 14.5 },
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
        return `${time}　<b>${Math.round(point.value[1] * 10) / 10}</b> ${unit}`;
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
