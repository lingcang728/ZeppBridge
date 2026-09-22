<script setup lang="ts">
/* 概览的「最近心率」卡：只画最近几个小时，完整的 24 小时留给心率二级页。 */
import { computed, defineAsyncComponent } from 'vue';
import { RouterLink } from 'vue-router';
import { resolvedTheme } from '../../composables/useTheme';
import { chartPalettes } from '../../lib/echartsTheme';
import { HR_GAP_BREAK_MS, insertNullBreaks } from '../../lib/chartGaps';
import { displayDateTimeFormatter } from '../../lib/dateTime';
import { formatMetric, isFiniteNumber } from '../../lib/format';
import type { HeartRatePoint } from '../../types';
import DesignIcon from '../DesignIcon.vue';
import { defineMessages, useMessages } from '../../i18n';

defineOptions({ name: 'OverviewHeartRateCard' });

const messages = defineMessages(
  {
    hrPanelAria: '打开心率详情，查看完整 24 小时',
    hrTitle: '最近心率',
    hrWindow: (hours: number) => `最近 ${hours} 小时`,
    latest: '最新',
    bpm: '次/分',
    hrChartAria: '24 小时心率曲线',
    hrZonesAria: '心率区间（绝对阈值）',
    hrEmpty: '同步后展示真实的心率波动。',
    hrMore: '完整 24 小时',
    hrTooltip: (clock: string, value: number) => `${clock}　<b>${value}</b> 次/分`,
    zoneRest: '休息 0–99',
    zoneFat: '燃脂 100–139',
    zoneAerobic: '有氧 140–169',
    zoneAnaerobic: '无氧 170+',
  },
  {
    hrPanelAria: 'Open heart rate detail for the full 24 hours',
    hrTitle: 'Recent heart rate',
    hrWindow: (hours: number) => `Last ${hours} hours`,
    latest: 'Latest',
    bpm: 'bpm',
    hrChartAria: '24-hour heart rate curve',
    hrZonesAria: 'Heart rate zones (absolute thresholds)',
    hrEmpty: 'Real heart rate movement shows up here after a sync.',
    hrMore: 'Full 24 hours',
    hrTooltip: (clock: string, value: number) => `${clock}　<b>${value}</b> bpm`,
    zoneRest: 'Rest 0–99',
    zoneFat: 'Fat burn 100–139',
    zoneAerobic: 'Aerobic 140–169',
    zoneAnaerobic: 'Anaerobic 170+',
  },
  {
    hrPanelAria: 'Abrir el detalle de frecuencia cardíaca de las 24 horas',
    hrTitle: 'Frecuencia cardíaca reciente',
    hrWindow: (hours: number) => `Últimas ${hours} horas`,
    latest: 'Última',
    bpm: 'lpm',
    hrChartAria: 'Curva de frecuencia cardíaca de 24 horas',
    hrZonesAria: 'Zonas de frecuencia cardíaca (umbrales absolutos)',
    hrEmpty: 'Tu frecuencia cardíaca real aparece aquí después de sincronizar.',
    hrMore: '24 horas completas',
    hrTooltip: (clock: string, value: number) => `${clock}　<b>${value}</b> lpm`,
    zoneRest: 'Reposo 0–99',
    zoneFat: 'Quema de grasa 100–139',
    zoneAerobic: 'Aeróbica 140–169',
    zoneAnaerobic: 'Anaeróbica 170+',
  },
);
const t = useMessages(messages);

/* VChart 连同 ECharts 本体按需加载：loader 在组件首次渲染时才执行，
   hrPoints≤1 的空态分支永远不会去下载 charts chunk（全前端最大的一块）。
   注册与主题仍只在 echartsSetup 里做一次，这里只是推迟到真要用才 import。 */
const VChart = defineAsyncComponent(() =>
  import('../../lib/echartsSetup').then((module) => module.VChart));

/* chartPalette / CHART_THEME 原本从 echartsSetup 拿，但那个模块顶部 import 了
   ECharts——静态引用会让空态分支也背上图表库。色值源头是 echartsTheme，主题
   名只跟 resolvedTheme 走，本地重建同一份 computed，行为不变。 */
const CHART_THEME = computed(() =>
  resolvedTheme.value === 'light' ? 'zeppbridge-light' : 'zeppbridge-dark');
const chartPalette = computed(() => chartPalettes[resolvedTheme.value]);

const props = defineProps<{
  /** `getHeartRateSeries(6)` 的原始点；卡片自己截取窗口和算均值。 */
  points: HeartRatePoint[];
  /** `overview.current_hr`，没有就从序列末尾取。 */
  currentHr?: number | null;
}>();

/**
 * 首页这张卡只画**最近几个小时**。
 *
 * 把整整 24 小时压进一张小卡，几百个点挤在两百来像素里，看到的是一团锯齿，
 * 既看不出「刚才怎么样」，也看不出趋势。完整的 24 小时留给心率二级页，那里
 * 有足够的宽度。
 */
const OVERVIEW_HR_WINDOW_HOURS = 5;

const allPoints = computed(() => props.points
  .map((point) => ({ ts: new Date(point.timestamp).getTime(), value: point.value }))
  .filter((point) => Number.isFinite(point.ts) && isFiniteNumber(point.value)));

const hrPoints = computed(() => {
  const points = allPoints.value;
  const newest = points[points.length - 1]?.ts;
  if (!newest) return points;
  const cutoff = newest - OVERVIEW_HR_WINDOW_HOURS * 3_600_000;
  return points.filter((point) => point.ts >= cutoff);
});
const hrLatest = computed(() => {
  if (isFiniteNumber(props.currentHr)) return props.currentHr;
  return hrPoints.value[hrPoints.value.length - 1]?.value ?? null;
});
const HR_ZONES = computed(() => [
  { key: 'rest', label: t.value.zoneRest },
  { key: 'fat', label: t.value.zoneFat },
  { key: 'aero', label: t.value.zoneAerobic },
  { key: 'an', label: t.value.zoneAnaerobic },
]);
const hrAverage = computed(() => {
  if (!hrPoints.value.length) return null;
  const sum = hrPoints.value.reduce((total, point) => total + point.value, 0);
  return Math.round(sum / hrPoints.value.length);
});

const hexToRgba = (hex: string, alpha: number): string => {
  const parsed = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!parsed) return hex;
  const int = Number.parseInt(parsed[1], 16);
  return `rgba(${(int >> 16) & 255}, ${(int >> 8) & 255}, ${int & 255}, ${alpha})`;
};

const num = (value: unknown) => isFiniteNumber(value) ? formatMetric(value) : '—';

const hrChartOption = computed(() => {
  const palette = chartPalette.value;
  const heart = palette.series.heart;
  // 采样断档处插一个 null，让线断开而不是被直线连起来。
  const data = insertNullBreaks(hrPoints.value, HR_GAP_BREAK_MS);
  const last = data[data.length - 1];
  const clock = (value: number) => displayDateTimeFormatter({ hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(value));
  return {
    animationDuration: 900,
    animationEasing: 'cubicOut' as const,
    grid: { left: 36, right: 16, top: 14, bottom: 24 },
    tooltip: {
      trigger: 'axis',
      backgroundColor: palette.tooltipBg,
      borderColor: palette.tooltipBorder,
      borderWidth: 1,
      padding: [8, 12],
      textStyle: { color: palette.tooltipText, fontSize: 15.5 },
      extraCssText: 'border-radius:8px;box-shadow:none;',
      formatter: (params: Array<{ value: [number, number | null] }>) => {
        const point = Array.isArray(params) ? params[0] : params;
        if (!point || point.value[1] == null) return '';
        return t.value.hrTooltip(clock(point.value[0]), Math.round(point.value[1]));
      },
    },
    xAxis: {
      type: 'time', min: data[0]?.[0], max: last?.[0],
      axisLabel: { formatter: clock, hideOverlap: true, color: palette.axis, fontSize: 14.5 },
      axisLine: { lineStyle: { color: palette.grid } }, axisTick: { show: false }, splitLine: { show: false },
    },
    yAxis: {
      type: 'value', scale: true, splitNumber: 3, min: 40,
      axisLabel: { color: palette.axis, fontSize: 14.5 }, axisLine: { show: false }, axisTick: { show: false },
      splitLine: { lineStyle: { color: palette.gridSoft, type: 'dashed' } },
    },
    series: [{
      type: 'line', data, smooth: .18, showSymbol: false, connectNulls: false,
      lineStyle: { width: 2, color: heart, cap: 'round' },
      /* 线性渐变写成对象字面量，等价于 graphic.LinearGradient——
         这样就不必为了一个 helper 静态 import 'echarts/core'。 */
      areaStyle: { color: {
        type: 'linear', x: 0, y: 0, x2: 0, y2: 1,
        colorStops: [
          { offset: 0, color: hexToRgba(heart, .22) },
          { offset: 1, color: hexToRgba(heart, 0) },
        ],
      } },
      markLine: hrAverage.value === null ? undefined : {
        silent: true,
        symbol: 'none',
        lineStyle: { type: 'dashed', color: palette.mark, width: 1.1 },
        label: { show: false },
        data: [{ yAxis: hrAverage.value }],
      },
    }, {
      type: 'line', data: last ? [last] : [], symbol: 'circle', symbolSize: 7,
      itemStyle: { color: heart, borderColor: palette.spot, borderWidth: 2 }, lineStyle: { opacity: 0 }, tooltip: { show: false }, z: 5,
    }],
  };
});
</script>

<template>
  <RouterLink class="metric-panel hr-panel" to="/heart" :aria-label="t.hrPanelAria">
    <div class="panel-head"><span class="panel-title"><span class="chart-icon"><DesignIcon name="heart-rate" :size="34" /></span><span><strong>{{ t.hrTitle }}</strong><small>{{ t.hrWindow(OVERVIEW_HR_WINDOW_HOURS) }}</small></span></span><span class="latest-value">{{ t.latest }} <strong>{{ num(hrLatest) }}</strong><small>{{ t.bpm }}</small></span></div>
    <VChart v-if="hrPoints.length > 1" :key="CHART_THEME" class="hr-chart" :theme="CHART_THEME" :option="hrChartOption" autoresize role="img" :aria-label="t.hrChartAria" />
    <ul v-if="hrPoints.length > 1" class="hr-zones" :aria-label="t.hrZonesAria">
      <li v-for="zone in HR_ZONES" :key="zone.key">{{ zone.label }}</li>
    </ul>
    <div v-else class="panel-empty"><DesignIcon name="heart-rate" :size="56" /><span>{{ t.hrEmpty }}</span></div>
    <span class="panel-more">{{ t.hrMore }} <DesignIcon name="chevron-right" :size="18" /></span>
  </RouterLink>
</template>

<style scoped>
/* 网格位置由父级的 .hr-card-slot 持有：本卡是异步 chunk，
   外壳要在它到达之前先占住同一个格子。 */
.hr-panel { min-height: 286px; padding: 20px 20px 12px; }
.hr-chart { width: 100%; height: 198px; }
.hr-zones { display: flex; flex-wrap: wrap; gap: 8px 12px; margin: 4px 0 0; padding: 0; list-style: none; color: var(--subtle); font-size: var(--fs-xs); }
</style>
