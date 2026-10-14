<script setup lang="ts">
import { computed, onMounted, provide, ref } from 'vue';
import PinTile from '../../components/overview/PinTile.vue';
import { PIN_TILES, type PinTileData } from '../../components/overview/pinTiles';
import { pinnedMetricsMessages } from '../../components/overview/PinnedMetrics.i18n';
import { backend } from '../../lib/bridge';
import { useMessages } from '../../i18n';
import { metricColor } from '../../lib/metricTone';
import { coverageLabel } from '../../lib/metricSeries';
import { PINNABLE_METRICS, pinMassUnit, pinSparkValues, pinValueText, type PinnableMetric } from '../../lib/pinnedMetrics';
import type { MetricSeries } from '../../types/health';

/**
 * 宣传片的「指标墙」：应用里能固定到概览的每一项指标，用概览真的磁贴（PinTile）画出来，
 * 开场一齐飞入，然后三排左右滚（计划 3.1）。读数取自演示合成数据。VO₂max 不上墙（用户不信手表的这个数）。
 * 只在演示 iframe 里由 presentation.wall('metrics') 挂上。
 */
const t = useMessages(pinnedMetricsMessages);
const metrics = PINNABLE_METRICS.filter((metric) => metric.id !== 'vo2max');
const series = ref<Record<string, MetricSeries>>({});
const unitText = (metric: PinnableMetric) => ({
  bpm: t.value.unitBpm, score: t.value.unitScore, steps: t.value.unitSteps, kcal: t.value.unitKcal, min: t.value.unitMin,
  pai: t.value.unitPai, ms: 'ms', percent: '%', mass: pinMassUnit(), vo2: 'ml/kg/min', '': '',
} as Record<string, string>)[metric.unit] ?? '';
const tiles = computed(() => new Map<string, PinTileData>(metrics.map((metric) => {
  const data = series.value[metric.id];
  return [metric.id, {
    id: metric.id, metric, label: (t.value.names as Record<string, string>)[metric.id] ?? metric.id,
    value: pinValueText(metric, data), unit: unitText(metric), when: null, spark: pinSparkValues(data),
    coverage: coverageLabel(data), tone: metricColor(metric.id),
  }];
})));
provide(PIN_TILES, tiles);
const rows = computed(() => [0, 1, 2].map((r) => metrics.filter((_, i) => i % 3 === r).map((m) => m.id)));
const ready = ref(false);
onMounted(async () => {
  const list = await backend.getMetricSeries(metrics.map((m) => m.id), 30);
  series.value = Object.fromEntries(list.map((s) => [s.metric, s]));
  ready.value = true;
});
</script>

<template>
  <div class="film-wall metrics" :class="{ ready }" aria-hidden="true">
    <div v-for="(row, r) in rows" :key="r" :class="['wall-row', r % 2 ? 'rtl' : 'ltr']" :style="{ '--dur': `${40 + r * 6}s` }">
      <div class="wall-track">
        <div v-for="pass in 2" :key="pass" class="wall-pass">
          <div v-for="(id, i) in row" :key="`${pass}-${id}`" class="wall-tile" :style="{ '--delay': `${(r * 3 + i) * 60}ms` }"><PinTile :id="id" /></div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.film-wall { position: fixed; inset: 0; z-index: 9000; display: grid; align-content: center; gap: 22px; overflow: hidden; background: var(--bg); }
.wall-track { display: flex; width: max-content; animation: wall-slide var(--dur) linear infinite; }
.rtl .wall-track { animation-direction: reverse; }
.wall-pass { display: flex; gap: 20px; padding-right: 20px; }
.wall-tile { width: 270px; opacity: 0; transform: translateY(60px) scale(.9); }
.wall-tile :deep(.pin-tile) { height: 168px; pointer-events: none; }
/* 一齐飞入：数据到了才起飞，按行列错开一点。 */
.ready .wall-tile { animation: tile-in 700ms cubic-bezier(.2, .9, .3, 1.15) var(--delay) forwards; }
@keyframes tile-in { to { opacity: 1; transform: none; } }
@keyframes wall-slide { to { transform: translateX(-50%); } }
</style>
