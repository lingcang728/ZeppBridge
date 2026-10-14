<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import PlayingCard from '../../components/cards/PlayingCard.vue';
import { backend } from '../../lib/bridge';
import { locale } from '../../i18n';
import { metricColor } from '../../lib/metricTone';
import { flipCard } from '../../lib/motion/cards/flip';
import type { MetricSeries } from '../../types/health';

/**
 * 宣传片的「牌墙」：三排真牌反向滚动，读数取自演示数据（合成示例，不是谁的真记录）；
 * 每项指标一种颜色、跟着主题走；时不时有一张翻到背面「交给 AI ✓」再翻回来。
 * 只在演示 iframe 里由 presentation.wall('cards') 挂上。
 */
const METRICS = [
  { metric: 'sleep_score', unit: '' },
  { metric: 'resting_hr', unit: 'bpm' },
  { metric: 'hrv_rmssd', unit: 'ms' },
  { metric: 'steps', unit: '' },
] as const;

interface Face { key: string; top: string; title: string; value: string; unit: string; corner: string; tint: string }
const series = ref<MetricSeries[]>([]);
const confirm = ref(new Set<string>());

const weekday = (date: string) => new Intl.DateTimeFormat(locale.value, { weekday: 'short' }).format(new Date(`${date}T12:00:00`));
const facesOf = (metric: string, unit: string): Face[] => {
  const points = series.value.find((s) => s.metric === metric)?.points ?? [];
  return points.slice(-12).map((p) => ({
    key: `${metric}:${p.date}`, top: weekday(p.date), title: `${Number(p.date.slice(5, 7))}/${Number(p.date.slice(8, 10))}`,
    value: Math.round(p.value).toLocaleString(locale.value), unit, corner: String(Number(p.date.slice(8, 10))), tint: metricColor(metric),
  }));
};
/* 三排：睡眠评分 + 步数交错、静息心率、HRV —— 每排颜色不同，一眼看出「牌色跟着指标走」。 */
const rows = computed(() => {
  const [sleep, hr, hrv, steps] = METRICS.map((m) => facesOf(m.metric, m.unit));
  const mixed = sleep!.flatMap((face, i) => (steps![i] ? [face, steps![i]!] : [face]));
  return [mixed, hr!, hrv!];
});

const root = ref<HTMLElement | null>(null);
let timer = 0;
onMounted(async () => {
  series.value = await backend.getMetricSeries(METRICS.map((m) => m.metric), 30);
  timer = window.setInterval(() => {
    const cards = [...(root.value?.querySelectorAll<HTMLElement>('.pcard[data-key]') ?? [])].filter((el) => {
      const r = el.getBoundingClientRect();
      return r.left > 120 && r.right < innerWidth - 120;
    });
    const el = cards[Math.floor(Math.random() * cards.length)];
    const key = el?.dataset.key;
    if (!el || !key) return;
    void flipCard(el, () => { confirm.value = new Set([...confirm.value, key]); }).then(() => window.setTimeout(() => {
      void flipCard(el, () => { const next = new Set(confirm.value); next.delete(key); confirm.value = next; });
    }, 900));
  }, 1300);
});
onBeforeUnmount(() => clearInterval(timer));
</script>

<template>
  <div ref="root" class="film-wall cards" aria-hidden="true">
    <div v-for="(row, r) in rows" :key="r" :class="['wall-row', r % 2 ? 'rtl' : 'ltr']" :style="{ '--dur': `${34 + r * 6}s` }">
      <div class="wall-track">
        <div v-for="pass in 2" :key="pass" class="wall-pass">
          <PlayingCard v-for="face in row" :key="`${pass}-${face.key}`" :data-key="`${pass}-${face.key}`" kind="day" :top="face.top" :title="face.title"
            :value="face.value" :unit="face.unit" :corner="face.corner" :tint="face.tint" :state="confirm.has(`${pass}-${face.key}`) ? 'confirm' : 'front'" />
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.film-wall { position: fixed; inset: 0; z-index: 9000; display: grid; align-content: center; gap: 34px; overflow: hidden; background: var(--bg); --card-w: 150px; }
.wall-row { overflow: visible; }
.wall-row:nth-child(2) { --card-w: 172px; }
.wall-track { display: flex; width: max-content; animation: wall-slide var(--dur) linear infinite; }
.rtl .wall-track { animation-direction: reverse; }
.wall-pass { display: flex; gap: 22px; padding-right: 22px; }
.wall-pass :deep(.pcard) { pointer-events: none; }
@keyframes wall-slide { to { transform: translateX(-50%); } }
</style>
