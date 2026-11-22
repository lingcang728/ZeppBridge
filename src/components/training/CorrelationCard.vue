<script setup lang="ts">
/**
 * 载荷与恢复：把训练负荷和一项恢复指标（HRV / 静息心率 / 睡眠评分）并排画成两条线，
 * 各自按自己的最小到最大拉伸（所以只比较「走势」，不比较数值大小），再给出相关系数 r。
 * 可选「同一天」或「前一天的负荷对今天」——练得多的第二天恢复指标怎么变，通常更有意义。
 * 相关不是因果，卡片上写明；配对的日子少于 10 天不给 r。
 */
import { computed, onMounted, ref } from 'vue';
import { useRevisionReload } from '../../composables/useRevisionReload';
import { useTrendRange } from '../../composables/useTrendRange';
import { isDesktop, backend } from '../../lib/bridge';
import { correlate, strengthOf, MIN_PAIRS } from '../../lib/correlation';
import { SERIES_FETCH_DAYS, indexSeries, sliceSeries } from '../../lib/metricSeries';
import type { MetricSeries } from '../../types';
import { defineMessages, useMessages } from '../../i18n';

const messages = defineMessages(
  {
    title: '负荷与恢复',
    hint: '两条线各按自己的范围拉伸，只比走势；相关不等于因果',
    load: '训练负荷',
    hrv: 'HRV',
    restingHr: '静息心率',
    sleepScore: '睡眠评分',
    sameDay: '同一天',
    nextDay: '负荷在前一天',
    r: (value: string) => `r = ${value}`,
    none: '基本没有相关',
    weak: '弱相关',
    moderate: '中等相关',
    strong: '强相关',
    positive: '同向',
    negative: '反向',
    pairs: (count: number) => `${count} 天配对`,
    notEnough: (min: number) => `两项同时有记录的日子不到 ${min} 天，算不出相关。`,
    empty: '没有可以比较的记录。',
    aria: '训练负荷与恢复指标的走势',
  },
  {
    title: 'Load and recovery',
    hint: 'Each line is stretched to its own range, so only the shape is compared; correlation is not causation',
    load: 'Training load',
    hrv: 'HRV',
    restingHr: 'Resting HR',
    sleepScore: 'Sleep score',
    sameDay: 'Same day',
    nextDay: 'Load the day before',
    r: (value: string) => `r = ${value}`,
    none: 'Almost no relationship',
    weak: 'Weak',
    moderate: 'Moderate',
    strong: 'Strong',
    positive: 'moving together',
    negative: 'moving opposite',
    pairs: (count: number) => `${count} paired days`,
    notEnough: (min: number) => `Fewer than ${min} days have both records, so no correlation can be worked out.`,
    empty: 'Nothing to compare yet.',
    aria: 'Training load and a recovery metric over time',
  },
  {
    title: 'Carga y recuperación',
    hint: 'Cada línea se ajusta a su propio rango, así que solo se compara la forma; correlación no es causalidad',
    load: 'Carga de entrenamiento',
    hrv: 'VFC',
    restingHr: 'FC en reposo',
    sleepScore: 'Puntuación de sueño',
    sameDay: 'El mismo día',
    nextDay: 'Carga del día anterior',
    r: (value: string) => `r = ${value}`,
    none: 'Casi sin relación',
    weak: 'Débil',
    moderate: 'Moderada',
    strong: 'Fuerte',
    positive: 'van en la misma dirección',
    negative: 'van en direcciones opuestas',
    pairs: (count: number) => `${count} días emparejados`,
    notEnough: (min: number) => `Hay menos de ${min} días con las dos medidas, no se puede calcular la correlación.`,
    empty: 'Todavía no hay nada que comparar.',
    aria: 'Carga de entrenamiento y una medida de recuperación en el tiempo',
  },
  'components/training/CorrelationCard',
);
const t = useMessages(messages);

const METRICS = ['training_load', 'hrv_rmssd', 'hrv', 'resting_hr', 'sleep_score'] as const;
const range = useTrendRange();
const full = ref<Record<string, MetricSeries>>({});
const loaded = ref(false);
const target = ref<'hrv' | 'resting_hr' | 'sleep_score'>('hrv');
const lag = ref<0 | 1>(1);

let seq = 0;
const load = async () => {
  if (!isDesktop()) { loaded.value = true; return; }
  const mine = ++seq;
  try {
    const next = indexSeries(await backend.getMetricSeries([...METRICS], SERIES_FETCH_DAYS));
    if (mine !== seq) return;
    full.value = next;
  } catch {
    // 读不出来就当没有记录。
  } finally {
    if (mine === seq) loaded.value = true;
  }
};
onMounted(() => { void load(); });
useRevisionReload(() => { void load(); });

/** HRV 有两个口径（rmssd / 厂商综合值）：谁有读数用谁，优先 rmssd。 */
const recoverySeries = computed<MetricSeries | null>(() => {
  const pick = (id: string) => (full.value[id]?.points.length ? full.value[id]! : null);
  if (target.value === 'hrv') return pick('hrv_rmssd') ?? pick('hrv');
  return pick(target.value);
});
const loadSeries = computed(() => (full.value.training_load?.points.length ? full.value.training_load : null));
const loadSlice = computed(() => (loadSeries.value ? sliceSeries(loadSeries.value, range.value) : null));
const recoverySlice = computed(() => (recoverySeries.value ? sliceSeries(recoverySeries.value, range.value) : null));

const result = computed(() => (loadSlice.value && recoverySlice.value
  ? correlate(loadSlice.value.points, recoverySlice.value.points, lag.value)
  : null));

const W = 600;
const H = 140;
const PAD = 6;
const path = (series: MetricSeries | null, dates: string[]) => {
  if (!series) return '';
  const values = series.points.map((point) => point.value);
  if (!values.length) return '';
  const min = Math.min(...values);
  const max = Math.max(...values);
  const byDate = new Map(series.points.map((point) => [point.date, point.value]));
  let drawing = false;
  const parts: string[] = [];
  dates.forEach((date, index) => {
    const value = byDate.get(date);
    if (value === undefined) { drawing = false; return; }
    const x = dates.length === 1 ? W / 2 : (index / (dates.length - 1)) * W;
    const y = PAD + (1 - (max === min ? 0.5 : (value - min) / (max - min))) * (H - PAD * 2);
    parts.push(`${drawing ? 'L' : 'M'}${x.toFixed(1)} ${y.toFixed(1)}`);
    drawing = true;
  });
  return parts.join(' ');
};
const dates = computed(() => {
  const all = new Set<string>();
  for (const series of [loadSlice.value, recoverySlice.value]) for (const point of series?.points ?? []) all.add(point.date);
  return [...all].sort();
});
const loadPath = computed(() => path(loadSlice.value, dates.value));
const recoveryPath = computed(() => path(recoverySlice.value, dates.value));

const recoveryLabel = computed(() => (target.value === 'hrv' ? t.value.hrv : target.value === 'resting_hr' ? t.value.restingHr : t.value.sleepScore));
const strengthText = computed(() => (result.value ? t.value[strengthOf(result.value.r)] : ''));
const direction = computed(() => (result.value && strengthOf(result.value.r) !== 'none' ? (result.value.r > 0 ? t.value.positive : t.value.negative) : ''));
const targets = computed(() => ([
  ['hrv', t.value.hrv], ['resting_hr', t.value.restingHr], ['sleep_score', t.value.sleepScore],
] as const));
</script>

<template>
  <section v-if="loaded && loadSeries" class="corr-card" :aria-label="t.title">
    <header>
      <span class="corr-head"><strong>{{ t.title }}</strong><small>{{ t.hint }}</small></span>
      <span class="corr-controls">
        <span class="corr-switch" role="group" :aria-label="t.title">
          <button v-for="[key, label] in targets" :key="key" type="button" :aria-pressed="target === key" @click="target = key">{{ label }}</button>
        </span>
        <span class="corr-switch" role="group" :aria-label="t.title">
          <button type="button" :aria-pressed="lag === 0" @click="lag = 0">{{ t.sameDay }}</button>
          <button type="button" :aria-pressed="lag === 1" @click="lag = 1">{{ t.nextDay }}</button>
        </span>
      </span>
    </header>
    <p v-if="!recoverySeries" class="corr-empty">{{ t.empty }}</p>
    <template v-else>
      <p class="corr-facts">
        <template v-if="result"><b>{{ t.r(result.r.toFixed(2)) }}</b> · {{ strengthText }}<template v-if="direction"> · {{ direction }}</template> · {{ t.pairs(result.pairs) }}</template>
        <template v-else>{{ t.notEnough(MIN_PAIRS) }}</template>
      </p>
      <svg class="corr-plot" :viewBox="`0 0 ${W} ${H}`" preserveAspectRatio="none" role="img" :aria-label="t.aria">
        <path :d="loadPath" class="line-load" vector-effect="non-scaling-stroke" />
        <path :d="recoveryPath" class="line-recovery" vector-effect="non-scaling-stroke" />
      </svg>
      <p class="corr-legend" aria-hidden="true">
        <span><i class="key-load" />{{ t.load }}</span>
        <span><i class="key-recovery" />{{ recoveryLabel }}</span>
      </p>
    </template>
  </section>
</template>

<style scoped>
.corr-card { display: grid; gap: 12px; padding: 20px 22px; border-radius: var(--radius-lg); background: var(--mat-card); box-shadow: var(--mat-rim); }
header { display: flex; flex-wrap: wrap; align-items: flex-start; justify-content: space-between; gap: 10px 16px; }
.corr-head { display: grid; gap: 2px; max-width: 38rem; }
header strong { font-size: var(--fs-sm); font-weight: 600; }
header small, .corr-empty { color: var(--subtle); font-size: var(--fs-xs); }
.corr-empty { margin: 0; padding: 22px 0; text-align: center; }
.corr-controls { display: flex; flex-wrap: wrap; gap: 8px; }
.corr-switch { display: inline-flex; gap: 2px; padding: 2px; border-radius: var(--radius-sm); box-shadow: inset 0 0 0 1px var(--mat-line); }
.corr-switch button { padding: 3px 10px; border: 0; border-radius: 4px; background: transparent; color: var(--muted); font: inherit; font-size: var(--fs-xs); cursor: pointer; }
.corr-switch button[aria-pressed='true'] { background: color-mix(in srgb, var(--ink) 10%, transparent); color: var(--ink); }
.corr-facts { margin: 0; color: var(--muted); font-size: var(--fs-xs); }
.corr-facts b { color: var(--ink); font-size: 22px; font-weight: 600; font-variant-numeric: tabular-nums; }
.corr-plot { width: 100%; height: 140px; }
.corr-plot path { fill: none; stroke-linecap: round; stroke-linejoin: round; }
.line-load { stroke: color-mix(in srgb, var(--ink) 45%, transparent); stroke-width: 1.5; }
.line-recovery { stroke: var(--accent); stroke-width: 1.8; }
.corr-legend { display: flex; flex-wrap: wrap; gap: 6px 16px; margin: 0; color: var(--muted); font-size: var(--fs-xs); }
.corr-legend span { display: inline-flex; align-items: center; gap: 6px; }
.corr-legend i { width: 14px; height: 2px; border-radius: 1px; }
.key-load { background: color-mix(in srgb, var(--ink) 45%, transparent); }
.key-recovery { background: var(--accent); }
</style>
