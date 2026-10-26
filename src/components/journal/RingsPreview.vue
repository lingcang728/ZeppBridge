<script setup lang="ts">
/* 履历页最上面的年轮缩略大卡：一枚 2D 年轮（同分享图那套几何，不在履历页再起 WebGL）+ 默认那一年的真实数字，
   整张卡就是去 /rings 的链接，形变从这张卡展开、返回时缩回来。没有任何一年的数据就只画一圈虚线和「还没有」。 */
import { computed, onActivated, onMounted, shallowRef } from 'vue';
import { RouterLink } from 'vue-router';
import { backend, toUserMessage } from '../../lib/bridge';
import { treeRings, weekShape, angleOfDay } from '../../lib/rings/geometry';
import { defaultRingYear } from '../../lib/rings/selection';
import { kmText } from '../../lib/logbook/display';
import { useRingsText } from '../rings/rings.i18n';
import { useJournalText } from './journal.i18n';
import { useRepairText } from './repair.i18n';
import type { AnnualRings } from '../../types/rings';

const t = useRingsText();
const j = useJournalText();
const repair = useRepairText();
const data = shallowRef<AnnualRings | null>(null);
const error = shallowRef('');
const load = async () => { try { data.value = await backend.annualRings(); error.value = ''; } catch (e) { error.value = toUserMessage(e, ''); } };
onMounted(load);
onActivated(load);
const year = computed(() => data.value?.years.find(y => y.year === defaultRingYear(data.value!)));
const paths = computed(() => treeRings(data.value?.years ?? [], 90).map(ring => {
  const weeks = weekShape(ring.weeks);
  let pen = false;
  const d = [...weeks, weeks[0]].map((value, i) => {
    if (value === null) { pen = false; return ''; }
    const radius = ring.inner + (ring.outer - ring.inner) * (.3 + value * .65);
    const angle = angleOfDay(i, weeks.length);
    const segment = `${pen ? 'L' : 'M'}${Math.cos(angle) * radius},${Math.sin(angle) * radius}`;
    pen = true;
    return segment;
  }).join(' ');
  return { year: ring.year, d };
}));
</script>

<template>
  <RouterLink class="rings-preview" :to="{ name: 'Rings', query: year ? { year: String(year.year) } : {} }" data-morph-card>
    <svg viewBox="-100 -100 200 200" aria-hidden="true">
      <path v-for="path in paths" :key="path.year" :d="path.d" :class="{ selected: path.year === year?.year }" />
      <circle v-if="!year" r="80" />
    </svg>
    <div class="preview-copy">
      <span>{{ t.title }}</span><strong>{{ year?.year ?? '—' }}</strong>
      <div v-if="year" class="preview-facts">
        <span>{{ t.workouts }} <b>{{ t.times(year.workouts) }}</b></span>
        <span>{{ repair.distance }} <b>{{ j.km(kmText(year.distance_m / 1000)) }}</b></span>
        <span>{{ repair.recorded }} <b>{{ t.days(year.data_days) }}</b></span>
      </div>
      <span v-else>{{ error || j.noRecord }}</span>
    </div>
    <span class="preview-arrow" aria-hidden="true">→</span>
  </RouterLink>
</template>

<style scoped>
.rings-preview { display: flex; align-items: center; gap: clamp(20px, 5vw, 72px); padding: 24px 36px; min-width: 0; border-radius: var(--radius-lg); background: var(--mat-card); box-shadow: var(--mat-rim), var(--mat-shadow); color: var(--ink); text-decoration: none; }
svg { width: clamp(120px, 19vw, 210px); flex: none; fill: none; stroke: var(--kintsugi); stroke-width: 1.2; }
path { opacity: .5; } path.selected { opacity: 1; stroke-width: 2; } circle { stroke-dasharray: 3 5; opacity: .4; }
.preview-copy { display: grid; gap: 10px; min-width: 0; color: var(--muted); }
strong { font-size: clamp(40px, 5vw, 68px); font-family: var(--font-mono); color: var(--ink); line-height: 1.1; }
.preview-facts { display: flex; flex-wrap: wrap; gap: 8px 24px; } b { color: var(--ink); font-weight: 550; }
.preview-arrow { margin-left: auto; font-size: 24px; }
@media (max-width: 600px) { .rings-preview { gap: 16px; padding: 20px 16px; } svg { width: 100px; } .preview-facts { display: grid; font-size: 13px; } }
</style>
