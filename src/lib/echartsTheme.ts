/* ZeppBridge ECharts 统一主题（设计系统 v3）
   暗色 `zeppbridge-dark` 为 P1 基准；`zeppbridge-light` 供 P3 使用。
   语义色集中定义；品牌色不进入健康数据的默认序列调色板。 */

const fonts = "'MiSans','Segoe UI','Microsoft YaHei UI',sans-serif";

/** Stable metric colors shared by charts, legends, and data exports. */
export const zeppSemanticColors = {
  brand: '#D8FF52',
  heart: '#FF777A',
  pace: '#6ED8F5',
  distance: '#6ED8F5',
  calories: '#FFB866',
  power: '#FFB866',
  altitude: '#76E5BF',
  cadence: '#6ED8F5',
  stride: '#76E5BF',
  training: '#D8FF52',
  vo2: '#D8FF52',
  readiness: '#76E5BF',
  sleep: {
    deep: '#8078E8',
    light: '#8FA8FF',
    rem: '#55D7B1',
    awake: '#FF777A',
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

const darkAxis = {
  axisLine: { show: false },
  axisTick: { show: false },
  axisLabel: { color: '#8A969D', fontSize: 11, fontFamily: fonts },
  splitLine: { show: true, lineStyle: { color: 'rgba(224,235,240,0.08)', type: 'dashed' as const } },
};

const lightAxis = {
  axisLine: { show: false },
  axisTick: { show: false },
  axisLabel: { color: '#66727A', fontSize: 11, fontFamily: fonts },
  splitLine: { show: true, lineStyle: { color: 'rgba(14,17,19,0.10)', type: 'dashed' as const } },
};

export const zeppThemeDark = {
  color: healthSeriesPalette,
  backgroundColor: 'transparent',
  textStyle: { fontFamily: fonts, color: '#A0A6AE' },
  categoryAxis: { ...darkAxis },
  valueAxis: { ...darkAxis },
  timeAxis: { ...darkAxis },
  logAxis: { ...darkAxis },
  tooltip: {
    backgroundColor: '#20262B',
    borderColor: 'rgba(224,235,240,0.16)',
    borderWidth: 1,
    padding: [8, 12],
    textStyle: { color: '#EDEFF2', fontSize: 12, fontFamily: fonts },
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
  color: healthSeriesPalette,
  backgroundColor: 'transparent',
  textStyle: { fontFamily: fonts, color: '#5C636C' },
  categoryAxis: { ...lightAxis },
  valueAxis: { ...lightAxis },
  timeAxis: { ...lightAxis },
  logAxis: { ...lightAxis },
  tooltip: {
    backgroundColor: '#FFFFFF',
    borderColor: '#D8DCE1',
    borderWidth: 1,
    padding: [8, 12],
    textStyle: { color: '#14171C', fontSize: 12, fontFamily: fonts },
    extraCssText: 'border-radius:8px;box-shadow:none;',
  },
  line: {
    symbol: 'circle',
    symbolSize: 0,
    smooth: 0.25,
    lineStyle: { width: 2.5, cap: 'round' as const, join: 'round' as const },
  },
};
