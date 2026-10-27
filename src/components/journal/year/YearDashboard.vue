<script setup lang="ts">
/* 履历页最上面的年轮区块（用户 2026-10-27 给的参考图：去掉生成图那种背景和配画，结构照着排）：
   左边星云卡（点进 /rings）、右边全年日历格子（标题栏上翻年、问 AI）、下面四张小结卡（点开有二级界面）。
   中间原来还有一张「这一年」（粒子年份、三个数、面积图），用户嫌丑，去掉了。
   能看到的都能交给 AI（useYearView 的 askAi，「交给 AI」整页从日历那张卡长出来）。 */
import { computed, onActivated, onMounted, ref, shallowRef } from 'vue';
import Icon from '../../Icon.vue';
import AskAiButton from '../../ask/AskAiButton.vue';
import { backend, toUserMessage } from '../../../lib/bridge';
import { defaultRingYear } from '../../../lib/rings/selection';
import NebulaCard from './NebulaCard.vue';
import YearCalendar from './YearCalendar.vue';
import YearHighlights, { type HighlightKind } from './YearHighlights.vue';
import YearDetailDialog from './YearDetailDialog.vue';
import { useYearView } from './useYearView';
import { useYearText } from './year.i18n';
import { useJournalText } from '../journal.i18n';
import type { AnnualRings } from '../../../types/rings';

const y = useYearText();
const j = useJournalText();
const data = shallowRef<AnnualRings | null>(null);
const error = shallowRef('');
const load = async () => { try { data.value = await backend.annualRings(); error.value = ''; } catch (e) { error.value = toUserMessage(e, ''); } };
onMounted(load);
onActivated(load);

/* 看哪一年：默认和年轮页一样（12 月 15 日起看今年）；翻过就记住，数据重读也不跳回去。 */
const picked = ref<number | null>(null);
const selected = computed(() => {
  const d = data.value;
  if (!d?.years.length) return null;
  return picked.value !== null && d.years.some(v => v.year === picked.value) ? picked.value : defaultRingYear(d);
});
const order = computed(() => data.value?.years.map(v => v.year) ?? []);
const step = (delta: number) => {
  const next = order.value[order.value.indexOf(selected.value ?? NaN) + delta];
  if (next !== undefined) picked.value = next;
};
const view = useYearView(data, selected);
const { year, legend, months, activeMonths, allStreaks, bestMonth, longestRun } = view;
const calendarCard = ref<HTMLElement | null>(null);

const detail = shallowRef<{ kind: HighlightKind; origin: HTMLElement } | null>(null);
</script>

<template>
  <section class="year-dashboard" :aria-label="year ? String(year.year) : undefined">
    <NebulaCard class="nebula-slot" :year="selected" :legend="legend" />
    <section v-if="year && data" ref="calendarCard" class="calendar-card">
      <header>
        <h2>{{ y.activity }}</h2>
        <AskAiButton direct :label="String(year.year)" @activate="view.askAi(calendarCard)" />
        <div class="stepper">
          <button type="button" :disabled="order.indexOf(year.year) <= 0" :aria-label="y.prevYear" @click="step(-1)"><Icon name="chevron-right" :size="16" class="flip" /></button>
          <span>{{ year.year }}</span>
          <button type="button" :disabled="order.indexOf(year.year) >= order.length - 1" :aria-label="y.nextYear" @click="step(1)"><Icon name="chevron-right" :size="16" /></button>
        </div>
      </header>
      <YearCalendar :year="year" :today="data.today" />
    </section>
    <div v-else class="calendar-card empty">{{ error || j.noRecord }}</div>
    <YearHighlights v-if="year" class="highlights-slot" :active-months="activeMonths" :months="months" :streak="allStreaks[0] ?? null"
      :best-month="bestMonth" :longest-run="longestRun" @open="(kind, origin) => (detail = { kind, origin })" />
    <YearDetailDialog v-if="detail && year" :kind="detail.kind" :origin="detail.origin" :year="year.year" :months="months" :streaks="allStreaks" @close="detail = null" />
  </section>
</template>

<style scoped>
.year-dashboard { display: grid; grid-template-columns: repeat(12, minmax(0, 1fr)); gap: 16px; }
.nebula-slot { grid-column: span 4; }
.calendar-card { grid-column: span 8; display: grid; align-content: space-between; gap: 14px; padding: 20px 24px; border-radius: var(--radius-lg); background: var(--mat-card); box-shadow: var(--mat-rim), var(--mat-shadow); min-width: 0; }
.calendar-card.empty { place-items: center; color: var(--muted); }
.calendar-card header { display: flex; align-items: center; gap: 10px; }
.calendar-card h2 { margin: 0 auto 0 0; font-size: var(--fs-lg); font-weight: 600; }
.calendar-card :deep(svg) { max-width: none !important; }
.stepper { display: flex; align-items: center; gap: 2px; padding: 3px; border-radius: 999px; background: var(--mat-inset); box-shadow: var(--mat-inset-shadow); }
.stepper span { min-width: 3.2em; text-align: center; font-variant-numeric: tabular-nums; }
.stepper button { display: grid; place-items: center; width: 30px; height: 28px; border: 0; border-radius: 999px; background: none; color: var(--ink); cursor: pointer; transition: background var(--dur-base) ease; }
.stepper button:hover:not(:disabled) { background: color-mix(in srgb, var(--ink) 8%, transparent); }
.stepper button:disabled { color: var(--subtle); cursor: default; }
.flip { transform: rotate(180deg); }
.highlights-slot { grid-column: 1 / -1; }
@container journal (max-width: 1100px) { .nebula-slot, .calendar-card { grid-column: 1 / -1; } }
</style>
