<script setup lang="ts">
import { computed } from 'vue';
import { VChart } from '../lib/echartsSetup';
import { buildSeriesOption, coverageLabel } from '../lib/metricSeries';
import type { MetricSeries } from '../types';

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
}>(), {
  decimals: 0,
  showSpread: false,
  emptyText: '同步后展示这项指标的趋势。',
});

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
  if (typeof series.average === 'number') rows.push({ label: '平均', value: render.value(series.average) });
  if (typeof series.minimum === 'number') rows.push({ label: '最低', value: render.value(series.minimum) });
  if (typeof series.maximum === 'number') rows.push({ label: '最高', value: render.value(series.maximum) });
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
      <span class="trend-latest">
        <strong :style="{ color }">{{ latest }}</strong>
        <small v-if="unit">{{ unit }}</small>
      </span>
    </header>

    <p class="trend-meta">
      <span>{{ coverage }}</span>
      <span v-if="latestDate" class="trend-date">最新 {{ latestDate }}</span>
      <span v-if="band" class="trend-band">{{ band }}</span>
    </p>

    <VChart
      v-if="option"
      class="trend-chart"
      theme="zeppbridge-dark"
      :option="option"
      autoresize
      role="img"
      :aria-label="`${label}趋势曲线`"
    />
    <p v-else-if="hasPoints" class="trend-empty">这段范围只有 1 天记录，暂时画不出趋势。</p>
    <p v-else class="trend-empty">{{ emptyText }}</p>

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
