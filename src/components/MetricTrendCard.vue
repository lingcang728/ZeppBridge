<script setup lang="ts">
import { computed } from 'vue';
import { useLifeEvents } from '../composables/useLifeEvents';
import { useQueuedOption } from '../composables/useQueuedOption';
import { validEventDate, overlapsEvent } from '../lib/lifeEvents';
const { open: openEvent, events: lifeEvents } = useLifeEvents();
const chartClick = (event: { name?: string; data?: unknown }) => {
  const eventId = event.data && typeof event.data === 'object' && 'eventId' in event.data ? event.data.eventId : null;
  const matching = lifeEvents.value.find(e => e.id === eventId);
  if (matching) openEvent(matching);
  else if (event.name && validEventDate(event.name)) openEvent(undefined, event.name);
};
import { CHART_THEME, VChart, chartPalette } from '../lib/echartsSetup';
import { SMOOTH_CHART_UPDATE, buildSeriesOption, coverageLabel } from '../lib/metricSeries';
import type { MetricSeries } from '../types';
import { defineMessages, useMessages } from '../i18n';

const messages = defineMessages(
  {
    latestTag: '最新',
    measuredOn: (date: string) => `测于 ${date}`,
    trendAria: (label: string) => `${label}趋势曲线`,
    onlyOneDay: '这段范围只有 1 天记录，暂时画不出趋势。',
    defaultEmpty: '同步后展示这项指标的趋势。',
    average: '平均',
    minimum: '最低',
    maximum: '最高',
  },
  {
    latestTag: 'Latest',
    measuredOn: (date: string) => `measured ${date}`,
    trendAria: (label: string) => `${label} trend line`,
    onlyOneDay: 'Only one day of data in this range, so there is no trend to draw yet.',
    defaultEmpty: 'This metric shows its trend once it has been synced.',
    average: 'Avg',
    minimum: 'Min',
    maximum: 'Max',
  },
  {
    latestTag: 'Último',
    measuredOn: (date: string) => `medido el ${date}`,
    trendAria: (label: string) => `Línea de tendencia de ${label}`,
    onlyOneDay: 'Solo hay un día de datos en este rango, así que todavía no hay tendencia que trazar.',
    defaultEmpty: 'Esta métrica muestra su tendencia una vez sincronizada.',
    average: 'Prom.',
    minimum: 'Mín.',
    maximum: 'Máx.',
  },
  // moduleId：让 src/i18n/locales/<locale>.ts 的语言包能覆盖这个模块。
  'components/MetricTrendCard',
);
const t = useMessages(messages);

const props = withDefaults(defineProps<{
  label: string;
  hint?: string;
  series?: MetricSeries | null;
  color: string;
  unit?: string;
  decimals?: number;
  /** Draw the day's measured spread behind the line. */
  showSpread?: boolean;
  /** Render a value for display; defaults to a fixed-decimal number. */
  format?: (value: number) => string;
  /** One short qualitative line under the value, when the metric has one. */
  band?: string | null;
  /** Shown in place of the chart when nothing has been measured. */
  emptyText?: string;
  /** Bars instead of a line, for values counted per day rather than sampled. */
  chart?: 'line' | 'bar';
  /** Keep the days with no reading on the axis. See `buildSeriesOption`. */
  calendarAxis?: boolean;
  /** Leave out the average / min / max row (a card whose chart has more than one series). */
  hideStats?: boolean;
}>(), {
  decimals: 0,
  showSpread: false,
  // 空串表示「用默认文案」。默认值不能直接写成 t.value.defaultEmpty：
  // withDefaults 的默认值在 props 解析时求值，那时还没有组件上下文。
  emptyText: '',
});

const emptyMessage = computed(() => props.emptyText || t.value.defaultEmpty);

const render = computed(() => props.format ?? ((value: number) => value.toFixed(props.decimals)));
const hasPoints = computed(() => (props.series?.points.length ?? 0) > 0);
// One point is a reading, not a trend: show the number and say so rather than
// drawing a one-pixel line that implies a shape.
const hasTrend = computed(() => (props.series?.points.length ?? 0) > 1);
const latest = computed(() => {
  const value = props.series?.latest?.value;
  return typeof value === 'number' && Number.isFinite(value) ? render.value(value) : '—';
});
const latestDate = computed(() => props.series?.latest?.date ?? null);
const coverage = computed(() => coverageLabel(props.series));

const stats = computed(() => {
  const series = props.series;
  if (!series || !series.points.length) return [];
  const rows: { label: string; value: string }[] = [];
  if (typeof series.average === 'number') rows.push({ label: t.value.average, value: render.value(series.average) });
  if (typeof series.minimum === 'number') rows.push({ label: t.value.minimum, value: render.value(series.minimum) });
  if (typeof series.maximum === 'number') rows.push({ label: t.value.maximum, value: render.value(series.maximum) });
  return rows;
});

const option = computed(() => {
  const series = props.series;
  if (!series || !hasTrend.value) return null;
  const result = buildSeriesOption(series, {
    color: props.color,
    decimals: props.decimals,
    showSpread: props.showSpread,
    format: render.value,
    unit: props.unit,
    chart: props.chart,
    calendarAxis: props.calendarAxis,
  });
  // Mark every visible calendar day covered by an event, including ongoing spans.
  const marks = series.points.filter(p => lifeEvents.value.some(e => overlapsEvent(e, p.date, p.date)))
    .map(p => ({ coord: [p.date, p.value], eventId: lifeEvents.value.find(e => overlapsEvent(e, p.date, p.date))?.id }));
  const chartSeries = result.series as Array<Record<string, unknown>>;
  const last = chartSeries[chartSeries.length - 1];
  Object.assign(last, { markPoint: { symbol: 'circle', symbolSize: 9, label: { show: false },
    itemStyle: { color: chartPalette.value.series.brand, borderColor: chartPalette.value.surface, borderWidth: 2 }, data: marks } });
  return result;
});
/* 切范围时十来张图同时换数据：排队，一帧只换一张（见 useQueuedOption）。 */
const shownOption = useQueuedOption(option);
</script>

<template>
  <!-- 四块自上而下：卡头（标题 / 最新读数 / 说明）、覆盖说明、曲线、统计。
       卡片是父网格的 subgrid，同一行几张卡的这四块各自对齐（见 material.css 的 .trend-grid）。
       以前标题和说明挤在左边、最新读数占着右上角：葡语这种长标题被压成一列一个词竖着排，
       右边却空着一大块。现在标题独占一行、读数在它下面、说明铺满整宽。 -->
  <section class="trend-card" :aria-label="label">
    <header class="trend-head">
      <strong class="trend-title">{{ label }}</strong>
      <!-- 这个大数字是**最近一次读数**，不是这个范围的汇总，所以切 7 天 / 1 个月
           / 6 个月时它本来就不该变（最近一次还是同一次）。跟着范围变的是下面
           的平均/最低/最高和覆盖天数。以前它没有标签，读起来像「这个范围的
           值」，于是看着就像坏了。 -->
      <span class="trend-latest">
        <em class="trend-latest-tag">{{ t.latestTag }}</em>
        <slot name="latest">
          <strong :style="{ color }">{{ latest }}</strong>
          <small v-if="unit">{{ unit }}</small>
        </slot>
      </span>
      <small v-if="hint" class="trend-hint">{{ hint }}</small>
    </header>

    <p class="trend-meta">
      <span>{{ coverage }}</span>
      <span v-if="latestDate" class="trend-date">{{ t.measuredOn(latestDate) }}</span>
      <span v-if="band" class="trend-band">{{ band }}</span>
    </p>

    <div v-if="$slots.chart" class="trend-slot"><slot name="chart" /></div>
    <VChart
      v-else-if="shownOption"
      class="trend-chart"
      :key="CHART_THEME"
      :theme="CHART_THEME"
      :option="shownOption"
      :update-options="SMOOTH_CHART_UPDATE"
      @click="chartClick"
      autoresize
      role="img"
      :aria-label="t.trendAria(label)"
    />
    <p v-else-if="hasPoints" class="trend-empty">{{ t.onlyOneDay }}</p>
    <p v-else class="trend-empty">{{ emptyMessage }}</p>


    <dl v-if="stats.length && !hideStats" class="trend-stats">
      <div v-for="row in stats" :key="row.label">
        <dt>{{ row.label }}</dt>
        <dd>{{ row.value }}<i v-if="unit">{{ unit }}</i></dd>
      </div>
    </dl>
    <!-- 没有统计也占住第四行：subgrid 要求每张卡的行数一样。 -->
    <span v-else class="trend-stats-empty" aria-hidden="true"></span>
  </section>
</template>

<style scoped>
/* 和概览卡同一种有厚度的板：不描边，边界靠顶边高光、底边暗线和投影。 */
.trend-card {
  display: grid;
  /* 在 .trend-grid 里：四块各占父网格的一行（subgrid），同一行的卡互相对齐；
     单独放在别处时退回普通的四行网格。 */
  grid-row: span 4;
  grid-template-rows: subgrid;
  row-gap: var(--space-2);
  align-content: start;
  min-width: 0;
  padding: 18px 18px 16px;
  border-radius: var(--radius-lg);
  background: var(--mat-card);
  box-shadow: var(--mat-rim), var(--mat-shadow);
}
.trend-head { display: grid; align-content: start; gap: 4px; min-width: 0; }
.trend-title { min-width: 0; color: var(--ink); font-size: var(--fs-md); font-weight: 700; line-height: 1.3; overflow-wrap: anywhere; }
.trend-latest { display: flex; flex-wrap: wrap; align-items: baseline; gap: 2px 6px; min-width: 0; }
.trend-latest :deep(strong), .trend-latest strong { font-family: var(--font-mono); font-size: 26px; font-variant-numeric: tabular-nums; line-height: 1.15; }
.trend-latest :deep(small), .trend-latest small { color: var(--subtle); font-size: var(--fs-xs); }
.trend-latest :deep(small + strong) { margin-left: 8px; }
.trend-latest-tag { margin-right: 2px; color: var(--subtle); font-size: var(--fs-xs); font-style: normal; }
.trend-hint { color: var(--subtle); font-size: var(--fs-xs); line-height: 1.45; }
.trend-meta {
  display: flex;
  flex-wrap: wrap;
  align-content: start;
  gap: var(--space-1) var(--space-3);
  margin: 0;
  color: var(--subtle);
  font-size: var(--fs-xs);
}
.trend-date { font-variant-numeric: tabular-nums; }
.trend-band { color: var(--muted); }
.trend-chart, .trend-slot { width: 100%; height: 150px; align-self: end; }
.trend-slot > :deep(*) { width: 100%; height: 100%; }
.trend-empty {
  display: flex;
  align-items: center;
  min-height: 150px;
  margin: 0;
  color: var(--subtle);
  font-size: var(--fs-sm);
}
.trend-stats {
  display: flex;
  flex-wrap: wrap;
  align-self: start;
  gap: var(--space-2) var(--space-4);
  margin: 0;
  padding-top: var(--space-2);
  border-top: 1px solid var(--line);
}
.trend-stats > div { display: flex; align-items: baseline; gap: var(--space-1); }
.trend-stats dt { color: var(--subtle); font-size: var(--fs-xs); }
.trend-stats dd {
  margin: 0;
  color: var(--muted);
  font-family: var(--font-mono);
  font-size: var(--fs-sm);
  font-variant-numeric: tabular-nums;
}
.trend-stats dd i { margin-left: 4px; color: var(--subtle); font-family: var(--font-sans, inherit); font-size: var(--fs-2xs); font-style: normal; }
</style>
