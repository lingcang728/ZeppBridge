/* ZeppBridge ECharts 统一主题
   深浅两套：`zeppbridge-dark` 与 `zeppbridge-light`，随 useTheme 的
   resolvedTheme 切换（见 echartsSetup.ts 的 CHART_THEME）。
   语义色集中定义；品牌色不进入健康数据的默认序列调色板。
   深色配色：冷调深灰底 + 橄榄军绿主色；浅色配色：暖白底 + 深绿主色。 */

const fonts = "'Inter','MiSans','Segoe UI','Microsoft YaHei UI',sans-serif";

/** 语义色形状——深浅两套各自给同一组键填色。 */
export interface ZeppSemanticColors {
  brand: string;
  heart: string;
  pace: string;
  distance: string;
  calories: string;
  power: string;
  altitude: string;
  cadence: string;
  stride: string;
  training: string;
  vo2: string;
  readiness: string;
  sleep: { deep: string; light: string; rem: string; awake: string };
}

/** Stable metric colors shared by charts, legends, and data exports (dark). */
export const zeppSemanticColors: ZeppSemanticColors = {
  brand: '#7DA33E',
  heart: '#F0616A',
  pace: '#4AA8E8',
  distance: '#4AA8E8',
  calories: '#F5860B',
  power: '#F5860B',
  altitude: '#F5C33B',
  cadence: '#4AA8E8',
  stride: '#2BB3C0',
  training: '#3DD84C',
  vo2: '#3DD84C',
  readiness: '#3DD84C',
  sleep: {
    deep: '#6477D7',
    light: '#7C8FF0',
    rem: '#8B5CF6',
    awake: '#E8833A',
  },
};

/** 同一组语义色的浅色版：色相不动，只压明度饱和，保证白底可读。 */
export const zeppSemanticColorsLight: ZeppSemanticColors = {
  brand: '#2F6B4F',
  heart: '#C93F49',
  pace: '#2E7FC2',
  distance: '#2E7FC2',
  calories: '#C96A05',
  power: '#C96A05',
  altitude: '#A87E0B',
  cadence: '#2E7FC2',
  stride: '#1E96A6',
  training: '#2F9E44',
  vo2: '#2F9E44',
  readiness: '#2F9E44',
  sleep: {
    deep: '#5565C9',
    light: '#6B7FE0',
    rem: '#7C4DDB',
    awake: '#D9732B',
  },
};

// The generic ECharts series palette intentionally excludes `brand`: a chart
// should never make a health measurement look like a product action.
const healthSeriesPalette = [
  zeppSemanticColors.heart,
  zeppSemanticColors.pace,
  zeppSemanticColors.calories,
  zeppSemanticColors.altitude,
  zeppSemanticColors.cadence,
  zeppSemanticColors.training,
  zeppSemanticColors.readiness,
  zeppSemanticColors.sleep.deep,
  zeppSemanticColors.sleep.light,
  zeppSemanticColors.sleep.rem,
  zeppSemanticColors.sleep.awake,
];

const healthSeriesPaletteLight = [
  zeppSemanticColorsLight.heart,
  zeppSemanticColorsLight.pace,
  zeppSemanticColorsLight.calories,
  zeppSemanticColorsLight.altitude,
  zeppSemanticColorsLight.cadence,
  zeppSemanticColorsLight.training,
  zeppSemanticColorsLight.readiness,
  zeppSemanticColorsLight.sleep.deep,
  zeppSemanticColorsLight.sleep.light,
  zeppSemanticColorsLight.sleep.rem,
  zeppSemanticColorsLight.sleep.awake,
];

/* 坐标轴文字沿用 CSS 的 --muted：11px/#9AA1A9 在正常视距下读不出来。 */
export const axisInk = '#B4BBC3';
/** 图表标记描边，和 `--surface` 同一色，避免再写一份游离 hex。 */
export const chartSurface = '#16191E';

/**
 * 组件侧图表选项的 chrome 色板（轴文字、网格线、tooltip、标记）。
 * 组件不直接挑 hex——主题切换时 option 会重建，从这里取当套色值。
 * 色值与 tokens.css 的同名 token 对齐（CSS 变量进不了 canvas/SVG 属性）。
 */
export interface ChartPalette {
  /** 轴标签/图例次要文字。 */
  axis: string;
  /** 虚线网格与轴线。 */
  grid: string;
  /** 更淡的分隔线（面板内的弱分割）。 */
  gridSoft: string;
  /** tooltip 容器。 */
  tooltipBg: string;
  tooltipBorder: string;
  tooltipText: string;
  /** tooltip 里的次级/说明文字。 */
  tooltipSub: string;
  tooltipDim: string;
  /** markLine / markArea 参考线。 */
  mark: string;
  /** 数据点白色描边（放在亮色线上的点环）。 */
  spot: string;
  /** 标记描边与卡片底色对齐时用。 */
  surface: string;
  legend: string;
  legendOff: string;
  /** 「未知」睡眠阶段等中性占位色。 */
  unknown: string;
  /** 图表内需要点出品牌/强调的位置。 */
  accent: string;
  /** 数据系列语义色（心率/配速/睡眠阶段…）。 */
  series: ZeppSemanticColors;
}

const darkPalette: ChartPalette = {
  axis: axisInk,
  grid: 'rgba(226, 234, 242, 0.12)',
  gridSoft: 'rgba(226, 234, 242, 0.08)',
  tooltipBg: '#1F232A',
  tooltipBorder: 'rgba(226, 234, 242, 0.22)',
  tooltipText: '#F2F4EE',
  tooltipSub: '#B4BBC3',
  tooltipDim: '#949CA5',
  mark: 'rgba(243, 244, 236, 0.38)',
  spot: '#F7FAF3',
  surface: chartSurface,
  legend: '#F2F4EE',
  legendOff: '#7C838C',
  unknown: 'rgba(226, 234, 242, 0.38)',
  accent: '#93B952',
  series: zeppSemanticColors,
};

const lightPalette: ChartPalette = {
  axis: '#4C5748',
  grid: 'rgba(38, 52, 41, 0.14)',
  gridSoft: 'rgba(38, 52, 41, 0.08)',
  tooltipBg: '#FFFFFF',
  tooltipBorder: 'rgba(38, 52, 41, 0.18)',
  tooltipText: '#20261F',
  tooltipSub: '#4C5748',
  tooltipDim: '#63705C',
  mark: 'rgba(32, 38, 31, 0.38)',
  spot: '#FFFFFF',
  surface: '#FFFFFF',
  legend: '#20261F',
  legendOff: '#9AA392',
  unknown: 'rgba(38, 52, 41, 0.32)',
  accent: '#2F6B4F',
  series: zeppSemanticColorsLight,
};

export type ChartThemeName = 'dark' | 'light';
export const chartPalettes: Record<ChartThemeName, ChartPalette> = {
  dark: darkPalette,
  light: lightPalette,
};

const darkAxis = {
  axisLine: { show: false },
  axisTick: { show: false },
  axisLabel: { color: darkPalette.axis, fontSize: 14.5, fontWeight: 400 as const, fontFamily: fonts, hideOverlap: true },
  splitLine: { show: true, lineStyle: { color: darkPalette.grid, type: 'dashed' as const } },
};

const lightAxis = {
  axisLine: { show: false },
  axisTick: { show: false },
  axisLabel: { color: lightPalette.axis, fontSize: 14.5, fontWeight: 400 as const, fontFamily: fonts, hideOverlap: true },
  splitLine: { show: true, lineStyle: { color: lightPalette.grid, type: 'dashed' as const } },
};

export const zeppThemeDark = {
  color: healthSeriesPalette,
  backgroundColor: 'transparent',
  textStyle: { fontFamily: fonts, color: darkPalette.axis },
  legend: {
    textStyle: { color: darkPalette.legend, fontFamily: fonts },
    inactiveColor: darkPalette.legendOff,
  },
  categoryAxis: { ...darkAxis },
  valueAxis: { ...darkAxis },
  timeAxis: { ...darkAxis },
  logAxis: { ...darkAxis },
  tooltip: {
    backgroundColor: darkPalette.tooltipBg,
    borderColor: darkPalette.tooltipBorder,
    borderWidth: 1,
    padding: [8, 12],
    textStyle: { color: darkPalette.tooltipText, fontSize: 15.5, fontFamily: fonts },
    extraCssText: 'border-radius:8px;box-shadow:none;',
  },
  line: {
    symbol: 'circle',
    symbolSize: 0,
    smooth: 0.25,
    lineStyle: { width: 2.5, cap: 'round' as const, join: 'round' as const },
  },
};

export const zeppThemeLight = {
  color: healthSeriesPaletteLight,
  backgroundColor: 'transparent',
  textStyle: { fontFamily: fonts, color: lightPalette.axis },
  legend: {
    textStyle: { color: lightPalette.legend, fontFamily: fonts },
    inactiveColor: lightPalette.legendOff,
  },
  categoryAxis: { ...lightAxis },
  valueAxis: { ...lightAxis },
  timeAxis: { ...lightAxis },
  logAxis: { ...lightAxis },
  tooltip: {
    backgroundColor: lightPalette.tooltipBg,
    borderColor: lightPalette.tooltipBorder,
    borderWidth: 1,
    padding: [8, 12],
    textStyle: { color: lightPalette.tooltipText, fontSize: 15.5, fontFamily: fonts },
    extraCssText: 'border-radius:8px;box-shadow:0 10px 28px rgba(38,52,41,.16);',
  },
  line: {
    symbol: 'circle',
    symbolSize: 0,
    smooth: 0.25,
    lineStyle: { width: 2.5, cap: 'round' as const, join: 'round' as const },
  },
};
