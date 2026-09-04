<script setup lang="ts">
import { computed } from 'vue';
import { VChart } from '../lib/echartsSetup';
import { buildSeriesOption, coverageLabel } from '../lib/metricSeries';
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
  return buildSeriesOption(series, {
    color: props.color,
    decimals: props.decimals,
    showSpread: props.showSpread,
    format: render.value,
    unit: props.unit,
    chart: props.chart,
    calendarAxis: props.calendarAxis,
  });
});
</script>

<template>
  <section class="trend-card" :aria-label="label">
    <header class="trend-head">
      <span class="trend-title">
        <strong>{{ label }}</strong>
        <small v-if="hint">{{ hint }}</small>
      </span>
      <!-- 这个大数字是**最近一次读数**，不是这个范围的汇总，所以切 7 天 / 1 个月
           / 6 个月时它本来就不该变（最近一次还是同一次）。跟着范围变的是下面
           的平均/最低/最高和覆盖天数。以前它没有标签，读起来像「这个范围的
           值」，于是看着就像坏了。 -->
      <span class="trend-latest">
        <em class="trend-latest-tag">{{ t.latestTag }}</em>
        <strong :style="{ color }">{{ latest }}</strong>
        <small v-if="unit">{{ unit }}</small>
      </span>
    </header>

    <p class="trend-meta">
      <span>{{ coverage }}</span>
      <span v-if="latestDate" class="trend-date">{{ t.measuredOn(latestDate) }}</span>
      <span v-if="band" class="trend-band">{{ band }}</span>
    </p>

    <VChart
      v-if="option"
      class="trend-chart"
      theme="zeppbridge-dark"
      :option="option"
      autoresize
      role="img"
      :aria-label="t.trendAria(label)"
    />
    <p v-else-if="hasPoints" class="trend-empty">{{ t.onlyOneDay }}</p>
    <p v-else class="trend-empty">{{ emptyMessage }}</p>

    <dl v-if="stats.length" class="trend-stats">
      <div v-for="row in stats" :key="row.label">
        <dt>{{ row.label }}</dt>
        <dd>{{ row.value }}<i v-if="unit">{{ unit }}</i></dd>
      </div>
    </dl>
  </section>
</template>

<style scoped>
.trend-card {
  display: flex;
  flex-direction: column;
  min-width: 0;
  padding: var(--space-4);
  border: 1px solid var(--line);
  border-radius: var(--radius-md);
  background: var(--surface);
}
.trend-head { display: flex; align-items: flex-start; justify-content: space-between; gap: var(--space-3); }
.trend-title { display: grid; gap: 2px; min-width: 0; }
.trend-title strong { color: var(--ink); font-size: 13px; font-weight: 700; }
.trend-title small { color: var(--subtle); font-size: 11px; }
.trend-latest { display: flex; align-items: baseline; gap: 4px; white-space: nowrap; }
.trend-latest strong { font-family: var(--font-mono); font-size: 22px; font-variant-numeric: tabular-nums; }
.trend-latest small { color: var(--subtle); font-size: 11px; }
.trend-latest-tag { color: var(--subtle); font-size: 11px; font-style: normal; }
.trend-meta {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-1) var(--space-3);
  margin: var(--space-2) 0 0;
  color: var(--subtle);
  font-size: 11px;
}
.trend-date { font-family: var(--font-mono); }
.trend-band { color: var(--muted); }
.trend-chart { width: 100%; height: 132px; margin-top: var(--space-2); }
.trend-empty {
  display: flex;
  align-items: center;
  min-height: 132px;
  margin: var(--space-2) 0 0;
  color: var(--subtle);
  font-size: 12px;
}
.trend-stats {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-2) var(--space-4);
  margin: var(--space-2) 0 0;
  padding-top: var(--space-2);
  border-top: 1px solid var(--line);
}
.trend-stats > div { display: flex; align-items: baseline; gap: var(--space-1); }
.trend-stats dt { color: var(--subtle); font-size: 11px; }
.trend-stats dd {
  margin: 0;
  color: var(--muted);
  font-family: var(--font-mono);
  font-size: 12px;
  font-variant-numeric: tabular-nums;
}
.trend-stats dd i { margin-left: 2px; font-size: 10px; font-style: normal; }
</style>
