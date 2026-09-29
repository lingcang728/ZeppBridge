<script setup lang="ts">
/* 概览最上面的「我的指标」：用户固定的 3–4 个指标，每个一块磁贴——最新值、测于哪天、
 * 近 30 天的迷你曲线和覆盖天数。没有记录就写「—」和「近 30 天无记录」，不补 0。
 * 一个都没固定时是一张引导卡，点开挑选面板（PinPicker）。
 *
 * 动效：挑完回来，新的一排磁贴依次浮上来（只在挑选之后，缓存页回到场上不重放）。 */
import { computed, onMounted, ref, watch } from 'vue';
import { RouterLink } from 'vue-router';
import Icon from '../Icon.vue';
import Sparkline from '../Sparkline.vue';
import PinPicker from './PinPicker.vue';
import { backend, isDesktop } from '../../lib/bridge';
import { useSyncController } from '../../composables/useSyncController';
import { resolvedTheme } from '../../composables/useTheme';
import { chartPalettes } from '../../lib/echartsTheme';
import { displayDateTimeFormatter, parseDisplayDate } from '../../lib/dateTime';
import { metricLabel } from '../../lib/aiTask/metrics';
import { coverageLabel, indexSeries } from '../../lib/metricSeries';
import {
  pinLatestDate, pinnableMetric, pinSparkValues, pinValueText, readPins, writePins, type PinnableMetric,
} from '../../lib/pinnedMetrics';
import type { MetricSeries } from '../../types';
import { useMessages } from '../../i18n';
import { pinnedMetricsMessages } from './PinnedMetrics.i18n';

defineOptions({ name: 'OverviewPinnedMetrics' });

const t = useMessages(pinnedMetricsMessages);
const WINDOW_DAYS = 30;

const pins = ref<string[]>(readPins());
const series = ref<Record<string, MetricSeries>>({});
const pickerOpen = ref(false);
/** 刚从挑选面板回来：这一次让磁贴依次浮上来。 */
const justPinned = ref(false);
const { dataRevision } = useSyncController();

const label = (id: string) => (id === 'sleep_score' ? t.value.sleepScore : metricLabel(id));
const unitText = (metric: PinnableMetric) => ({
  bpm: t.value.unitBpm, score: t.value.unitScore, steps: t.value.unitSteps, kcal: t.value.unitKcal, min: t.value.unitMin,
  ms: 'ms', percent: '%', kg: 'kg', vo2: 'ml/kg/min', '': '',
} as Record<string, string>)[metric.unit] ?? '';

const dayText = (date: string | null): string | null => {
  if (!date) return null;
  const day = parseDisplayDate(`${date}T12:00:00`);
  if (Number.isNaN(day.getTime())) return null;
  const today = new Date();
  const start = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const diff = Math.round((start(today) - start(day)) / 86_400_000);
  if (diff === 0) return t.value.today;
  if (diff === 1) return t.value.yesterday;
  return t.value.measuredOn(displayDateTimeFormatter({ month: 'short', day: 'numeric' }).format(day));
};

const palette = computed(() => chartPalettes[resolvedTheme.value]);
const tiles = computed(() => pins.value.flatMap((id) => {
  const metric = pinnableMetric(id);
  if (!metric) return [];
  const data = series.value[id];
  return [{
    id,
    metric,
    label: label(id),
    value: pinValueText(metric, data),
    unit: unitText(metric),
    when: dayText(pinLatestDate(data)),
    spark: pinSparkValues(data),
    coverage: coverageLabel(data),
  }];
}));

let loadSeq = 0;
const load = async () => {
  const seq = ++loadSeq;
  if (!isDesktop() || !pins.value.length) {
    series.value = {};
    return;
  }
  try {
    const result = await backend.getMetricSeries([...pins.value], WINDOW_DAYS);
    if (seq === loadSeq) series.value = indexSeries(result);
  } catch {
    // 读不出来就按「无记录」显示，概览其余部分照常。
    if (seq === loadSeq) series.value = {};
  }
};
onMounted(() => void load());
watch(dataRevision, () => void load());

const apply = (next: string[]) => {
  pickerOpen.value = false;
  const changed = next.join() !== pins.value.join();
  if (!changed) return;
  justPinned.value = true;
  pins.value = [...next];
  writePins(next);
  void load();
  window.setTimeout(() => { justPinned.value = false; }, 900);
};
</script>

<template>
  <section class="pins" aria-labelledby="pins-title">
    <header class="pins-head">
      <h2 id="pins-title">{{ t.title }}</h2>
      <button v-if="pins.length" type="button" class="pill-button quiet pins-edit" @click="pickerOpen = true">
        <Icon name="edit" :size="14" />{{ t.edit }}
      </button>
    </header>

    <button v-if="!pins.length" type="button" class="pins-empty" @click="pickerOpen = true">
      <span class="pins-plus" aria-hidden="true"><Icon name="plus" :size="18" /></span>
      <span class="pins-empty-copy"><strong>{{ t.emptyCta }}</strong><small>{{ t.emptySub }}</small></span>
    </button>

    <div v-else :key="pins.join()" :class="['pins-grid', { 'just-pinned': justPinned }]" :style="{ '--count': tiles.length }">
      <RouterLink v-for="(tile, index) in tiles" :key="tile.id" :to="tile.metric.route" class="pin-tile" data-morph-card
        :style="{ '--i': index }" :aria-label="t.tileAria(tile.label, tile.value)">
        <span class="pin-label">{{ tile.label }}</span>
        <span class="pin-value"><strong>{{ tile.value }}</strong><small v-if="tile.unit && tile.value !== '—'">{{ tile.unit }}</small></span>
        <span class="pin-when">{{ tile.when ?? tile.coverage }}</span>
        <Sparkline v-if="tile.spark.length > 1" class="pin-spark" :values="tile.spark" :color="palette.series.readiness" :label="`${tile.label} · ${tile.coverage}`" />
      </RouterLink>
    </div>

    <PinPicker v-if="pickerOpen" :pins="pins" :label="label" @close="pickerOpen = false" @done="apply" />
  </section>
</template>

<style scoped>
.pins { display: grid; gap: 10px; }
.pins-head { display: flex; align-items: center; justify-content: space-between; gap: 12px; min-height: 32px; }
.pins-head h2 { margin: 0; color: var(--muted); font-size: var(--fs-sm); font-weight: 650; }
.pins-edit { gap: 6px; }

.pins-empty {
  display: flex; align-items: center; gap: 14px; width: 100%; padding: 16px 18px;
  border: 1.5px dashed color-mix(in srgb, var(--ink) 16%, transparent); border-radius: var(--radius-lg);
  background: transparent; color: var(--muted); font: inherit; text-align: left; cursor: pointer;
  transition: border-color var(--dur-fast) ease, background var(--dur-fast) ease;
}
.pins-empty:hover { border-color: color-mix(in srgb, var(--accent) 55%, transparent); background: color-mix(in srgb, var(--accent) 6%, transparent); }
.pins-empty:focus-visible { outline: 2px solid var(--focus); outline-offset: 2px; }
.pins-plus { display: grid; flex: 0 0 auto; place-items: center; width: 40px; height: 40px; border-radius: 999px; background: var(--accent-soft); color: var(--accent); }
.pins-empty-copy { display: grid; gap: 2px; }
.pins-empty-copy strong { color: var(--ink); font-size: var(--fs-md); font-weight: 650; }
.pins-empty-copy small { font-size: var(--fs-xs); }

.pins-grid { display: grid; grid-template-columns: repeat(var(--count, 4), minmax(0, 1fr)); gap: 12px; }
.pin-tile {
  display: grid; align-content: start; gap: 4px; min-width: 0; padding: 14px 16px 12px;
  border-radius: var(--radius-lg); background: var(--mat-card); box-shadow: var(--mat-rim), var(--mat-shadow);
  color: inherit; text-decoration: none; transition: translate var(--dur-base) var(--ease-out), box-shadow var(--dur-base) ease;
}
.pin-tile:hover { translate: 0 -2px; }
.pin-tile:focus-visible { outline: 2px solid var(--focus); outline-offset: 2px; }
.pin-label { overflow: hidden; color: var(--muted); font-size: var(--fs-xs); text-overflow: ellipsis; white-space: nowrap; }
.pin-value { display: flex; align-items: baseline; gap: 5px; }
.pin-value strong { color: var(--ink); font-size: var(--fs-3xl); font-weight: 650; font-variant-numeric: tabular-nums; letter-spacing: -.02em; }
.pin-value small { color: var(--muted); font-size: var(--fs-xs); }
.pin-when { color: var(--subtle); font-size: var(--fs-2xs); }
.pin-spark { margin-top: 2px; }

/* 挑完回来：新一排依次浮上来。只动 opacity 和独立的 translate / scale。 */
@media (prefers-reduced-motion: no-preference) {
  .just-pinned .pin-tile { animation: pin-rise 460ms cubic-bezier(.2, .8, .2, 1) both; animation-delay: calc(var(--i) * 60ms); }
}
@keyframes pin-rise { from { opacity: 0; translate: 0 12px; scale: .97; } }

@container (max-width: 760px) {
  .pins-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
}
@media (max-width: 760px) {
  .pins-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
}
</style>
