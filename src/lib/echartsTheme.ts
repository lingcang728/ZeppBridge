/* ZeppBridge ECharts 统一主题（设计系统 v3）
   暗色 `zeppbridge-dark` 为 P1 基准；`zeppbridge-light` 供 P3 使用。
   语义色集中定义；品牌色不进入健康数据的默认序列调色板。 */

const fonts = "'MiSans','Segoe UI','Microsoft YaHei UI',sans-serif";

/** Stable metric colors shared by charts, legends, and data exports. */
export const zeppSemanticColors = {
  brand: '#CDDC7C',
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
    deep: '#7B4FB3',
    light: '#7C8FF0',
    rem: '#2FA96B',
    awake: '#E84C3D',
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
  axisLabel: { color: '#A9AF97', fontSize: 11, fontFamily: fonts },
  splitLine: { show: true, lineStyle: { color: 'rgba(228,235,208,0.08)', type: 'dashed' as const } },
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
  textStyle: { fontFamily: fonts, color: '#A9AF97' },
  categoryAxis: { ...darkAxis },
  valueAxis: { ...darkAxis },
  timeAxis: { ...darkAxis },
  logAxis: { ...darkAxis },
  tooltip: {
    backgroundColor: '#22261A',
    borderColor: 'rgba(228,235,208,0.16)',
    borderWidth: 1,
    padding: [8, 12],
    textStyle: { color: '#F3F4EC', fontSize: 12, fontFamily: fonts },
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
