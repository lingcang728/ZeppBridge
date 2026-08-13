/* ZeppBridge ECharts 统一主题（设计系统 v2）
   暗色 `zeppbridge-dark` 为 P1 基准；`zeppbridge-light` 供 P3 使用。
   数据分类色与全局 token 一致：heart/sleep/activity/calories/distance。 */

const fonts = "'Inter','MiSans','Segoe UI','Microsoft YaHei UI',sans-serif";

const darkAxis = {
  axisLine: { show: false },
  axisTick: { show: false },
  axisLabel: { color: '#6E757E', fontSize: 11, fontFamily: fonts },
  splitLine: { show: true, lineStyle: { color: 'rgba(255,255,255,0.05)', type: 'dashed' as const } },
};

const lightAxis = {
  axisLine: { show: false },
  axisTick: { show: false },
  axisLabel: { color: '#8A9098', fontSize: 11, fontFamily: fonts },
  splitLine: { show: true, lineStyle: { color: 'rgba(20,23,28,0.06)', type: 'dashed' as const } },
};

export const zeppThemeDark = {
  color: ['#EF6E6E', '#9BA3F5', '#8FCB9B', '#EF9F27', '#378ADD', '#72C994'],
  backgroundColor: 'transparent',
  textStyle: { fontFamily: fonts, color: '#A0A6AE' },
  categoryAxis: { ...darkAxis },
  valueAxis: { ...darkAxis },
  timeAxis: { ...darkAxis },
  logAxis: { ...darkAxis },
  tooltip: {
    backgroundColor: '#1C1E22',
    borderColor: 'rgba(255,255,255,0.12)',
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
  color: ['#C45F64', '#6B72C8', '#4E9A70', '#B8842A', '#2B6FA3', '#3E8A5E'],
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
