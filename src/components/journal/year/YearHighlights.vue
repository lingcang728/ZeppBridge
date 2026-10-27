<script setup lang="ts">
/* 年轮区块最下面一排四张：活跃月份、最长连续、单月最多里程、跑得最远的一次。
   前三张点开是弹窗（从卡里长出来，YearDetailDialog），最后一张直接形变进那次运动的详情页。
   没有的就写「—」，不编。 */
import { RouterLink } from 'vue-router';
import Icon from '../../Icon.vue';
import { useRingsText } from '../../rings/rings.i18n';
import { useYearText } from './year.i18n';

export type HighlightKind = 'months' | 'streak' | 'distance';
interface Month { month: number; label: string; count: number; text: string; distance: number; km: string | null }
defineProps<{
  activeMonths: Month[];
  months: Month[];
  streak: { text: string; range: string; days: number } | null;
  bestMonth: Month | null;
  longestRun: { id: string; value: string; date: string } | null;
}>();
const emit = defineEmits<{ open: [kind: HighlightKind, origin: HTMLElement] }>();
const t = useRingsText();
const y = useYearText();
const open = (kind: HighlightKind, event: MouseEvent) => emit('open', kind, event.currentTarget as HTMLElement);
const tallest = (months: Month[]) => Math.max(1, ...months.map(m => m.distance));
</script>

<template>
  <div class="highlights">
    <button type="button" class="highlight" :disabled="!activeMonths.length" @click="open('months', $event)">
      <span class="head"><Icon name="bars" :size="18" />{{ y.activeMonths }}</span>
      <ol v-if="activeMonths.length" class="ranks">
        <li v-for="(m, i) in activeMonths.slice(0, 3)" :key="m.month" :style="{ '--share': m.count / activeMonths[0].count }">
          <span class="rank">{{ i + 1 }}</span><span class="month">{{ m.label }}</span><span class="bar" /><b>{{ m.text }}</b>
        </li>
      </ol>
      <strong v-else class="none">—</strong>
    </button>
    <button type="button" class="highlight" :disabled="!streak" @click="open('streak', $event)">
      <span class="head"><Icon name="flame" :size="18" />{{ y.streak }}</span>
      <template v-if="streak"><strong class="big">{{ streak.text }}</strong><small>{{ streak.range }}</small></template>
      <strong v-else class="none">—</strong>
    </button>
    <button type="button" class="highlight" :disabled="!bestMonth" @click="open('distance', $event)">
      <span class="head"><Icon name="map" :size="18" />{{ y.bestMonth }}</span>
      <template v-if="bestMonth">
        <strong class="big">{{ bestMonth.km }}</strong><small>{{ bestMonth.label }}</small>
        <span class="columns" aria-hidden="true"><i v-for="m in months" :key="m.month" :class="{ top: m.month === bestMonth.month }" :style="{ '--share': m.distance / tallest(months) }" /></span>
      </template>
      <strong v-else class="none">—</strong>
    </button>
    <component :is="longestRun ? RouterLink : 'div'" class="highlight" :to="longestRun ? `/workouts/${longestRun.id}` : undefined" :data-morph-card="longestRun ? '' : undefined">
      <span class="head"><Icon name="run" :size="18" />{{ t.longestRun }}</span>
      <template v-if="longestRun"><strong class="big">{{ longestRun.value }}</strong><small>{{ longestRun.date }}</small></template>
      <strong v-else class="none">—</strong>
    </component>
  </div>
</template>

<style scoped>
.highlights { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 16px; }
.highlight { display: grid; align-content: start; gap: 10px; min-width: 0; min-height: 168px; padding: 18px 20px; border: 0; border-radius: var(--radius-lg);
  background: var(--mat-card); box-shadow: var(--mat-rim), var(--mat-shadow); color: var(--ink); font: inherit; text-align: left; text-decoration: none; cursor: pointer;
  transition: background var(--dur-base) ease; }
.highlight:disabled, div.highlight { cursor: default; }
button.highlight:not(:disabled):hover, a.highlight:hover { background: color-mix(in srgb, var(--ink) 3%, var(--mat-card)); }
.highlight:focus-visible { outline: 2px solid var(--focus); outline-offset: 2px; }
.head { display: flex; align-items: center; gap: 8px; font-weight: 600; }
.head :deep(svg) { color: var(--kintsugi); flex: none; }
.big { font-size: clamp(26px, 2.4vw, 32px); font-weight: 600; font-variant-numeric: tabular-nums; line-height: 1.15; }
.none { color: var(--muted); font-size: 28px; font-weight: 400; }
small { color: var(--muted); font-size: var(--fs-sm); }
.ranks { display: grid; gap: 8px; margin: 0; padding: 0; list-style: none; }
.ranks li { display: grid; grid-template-columns: 20px 3em minmax(0, 1fr) auto; align-items: center; gap: 8px; }
.rank { display: grid; place-items: center; width: 20px; height: 20px; border-radius: 50%; background: color-mix(in srgb, var(--kintsugi) 22%, transparent); color: var(--kintsugi); font-size: 12px; font-weight: 600; }
.month { color: var(--muted); }
.bar { height: 6px; border-radius: 3px; background: linear-gradient(90deg, var(--kintsugi), color-mix(in srgb, var(--kintsugi) 60%, transparent)); width: calc(100% * var(--share)); }
.ranks b { font-weight: 500; font-variant-numeric: tabular-nums; }
.columns { display: grid; grid-template-columns: repeat(12, 1fr); align-items: end; gap: 3px; height: 40px; margin-top: auto; }
.columns i { height: calc(4px + 36px * var(--share)); border-radius: 2px; background: color-mix(in srgb, var(--kintsugi) 32%, transparent); }
.columns i.top { background: var(--kintsugi); }
@container journal (max-width: 1000px) { .highlights { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
@container journal (max-width: 520px) { .highlights { grid-template-columns: minmax(0, 1fr); } }
</style>
