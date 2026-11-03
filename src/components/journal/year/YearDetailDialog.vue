<script setup lang="ts">
/* 年轮区块小结卡的二级界面：从被点的那张卡里长出来（ModalDialog → dialogFlight），关的时候缩回去。
   活跃月份 / 单月最多里程：十二个月逐月列出；最长连续：最长的五段。 */
import { computed } from 'vue';
import ModalDialog from '../../ModalDialog.vue';
import { useRingsText } from '../../rings/rings.i18n';
import { useYearText } from './year.i18n';
import type { HighlightKind } from './YearHighlights.vue';

interface Month { month: number; label: string; count: number; text: string; distance: number; km: string | null }
const props = defineProps<{
  kind: HighlightKind;
  origin: HTMLElement | null;
  year: number;
  months: Month[];
  streaks: { from: string; text: string; range: string; days: number }[];
}>();
const emit = defineEmits<{ close: [] }>();
const t = useRingsText();
const y = useYearText();
const title = computed(() => (props.kind === 'months' ? y.value.activeMonths : props.kind === 'streak' ? y.value.streak : y.value.bestMonth));
const rows = computed(() => {
  if (props.kind === 'streak') {
    const top = props.streaks.slice(0, 5);
    return top.map(s => ({ key: s.from, label: s.range, value: s.text, share: s.days / Math.max(1, top[0]?.days ?? 1) }));
  }
  const byDistance = props.kind === 'distance';
  const most = Math.max(1, ...props.months.map(m => (byDistance ? m.distance : m.count)));
  return props.months.map(m => ({
    key: String(m.month), label: m.label,
    value: byDistance ? m.km ?? '—' : m.count ? m.text : '—',
    share: (byDistance ? m.distance : m.count) / most,
  }));
});
const top = computed(() => Math.max(...rows.value.map(r => r.share)));
</script>

<template>
  <ModalDialog labelledby="year-detail-title" :origin="origin" :max-width="520" @close="emit('close')">
    <div class="year-detail">
      <h2 id="year-detail-title">{{ title }} <span>{{ year }}</span></h2>
      <ol :class="['rows', kind]">
        <li v-for="row in rows" :key="row.key" :class="{ top: row.share === top && row.share > 0 }" :style="{ '--share': row.share }">
          <span class="label">{{ row.label }}</span><span class="track"><span class="bar" /></span><b>{{ row.value }}</b>
        </li>
      </ol>
      <footer><button type="button" class="pill-button quiet" @click="emit('close')">{{ t.close }}</button></footer>
    </div>
  </ModalDialog>
</template>

<style scoped>
.year-detail { display: grid; gap: 18px; }
h2 { margin: 0; font-size: var(--fs-lg); font-weight: 600; }
h2 span { color: var(--muted); font-weight: 400; }
.rows { display: grid; gap: 8px; margin: 0; padding: 0; list-style: none; }
.rows li { display: grid; grid-template-columns: 4em minmax(0, 1fr) 6.5em; align-items: center; gap: 12px; }
.rows.streak li { grid-template-columns: minmax(0, 1.4fr) minmax(0, 1fr) 7em; }
.label { color: var(--muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.track { height: 8px; border-radius: 4px; background: color-mix(in srgb, var(--ink) 6%, transparent); overflow: hidden; }
.bar { display: block; height: 100%; width: calc(100% * var(--share)); border-radius: 4px; background: color-mix(in srgb, var(--kintsugi) 55%, transparent); transform-origin: left; animation: bar-grow 620ms cubic-bezier(.2, .8, .2, 1) both; }
.top .bar { background: var(--kintsugi); }
.top .label, .top b { color: var(--ink); }
b { font-weight: 500; font-variant-numeric: tabular-nums; text-align: right; white-space: nowrap; }
footer { display: flex; justify-content: flex-end; }
@keyframes bar-grow { from { transform: scaleX(0); } }
@media (prefers-reduced-motion: reduce) { .bar { animation: none; } }
</style>
