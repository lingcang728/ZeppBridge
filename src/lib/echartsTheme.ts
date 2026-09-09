/* ZeppBridge ECharts 统一主题（设计系统 v4）
   只有暗色 `zeppbridge-dark`：产品不做浅色模式，不要再加浅色主题分支。
   语义色集中定义；品牌色不进入健康数据的默认序列调色板。
   v4 配色：冷调深灰底 + 橄榄军绿主色。 */

const fonts = "'Inter','MiSans','Segoe UI','Microsoft YaHei UI',sans-serif";

/** Stable metric colors shared by charts, legends, and data exports. */
export const zeppSemanticColors = {
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
} as const;

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

/* 坐标轴文字沿用 CSS 的 --muted：11px/#9AA1A9 在正常视距下读不出来。 */
export const axisInk = '#B4BBC3';

const darkAxis = {
  axisLine: { show: false },
  axisTick: { show: false },
  axisLabel: { color: axisInk, fontSize: 14.5, fontWeight: 400 as const, fontFamily: fonts, hideOverlap: true },
  splitLine: { show: true, lineStyle: { color: 'rgba(226,234,242,0.12)', type: 'dashed' as const } },
};

export const zeppThemeDark = {
  color: healthSeriesPalette,
  backgroundColor: 'transparent',
  textStyle: { fontFamily: fonts, color: axisInk },
  legend: {
    textStyle: { color: '#F2F4EE', fontFamily: fonts },
    inactiveColor: '#7C838C',
  },
  categoryAxis: { ...darkAxis },
  valueAxis: { ...darkAxis },
  timeAxis: { ...darkAxis },
  logAxis: { ...darkAxis },
  tooltip: {
    backgroundColor: '#1F232A',
    borderColor: 'rgba(226,234,242,0.22)',
    borderWidth: 1,
    padding: [8, 12],
    textStyle: { color: '#F2F4EE', fontSize: 15.5, fontFamily: fonts },
    extraCssText: 'border-radius:8px;box-shadow:none;',
  },
  line: {
    symbol: 'circle',
    symbolSize: 0,
    smooth: 0.25,
    lineStyle: { width: 2.5, cap: 'round' as const, join: 'round' as const },
  },
};
