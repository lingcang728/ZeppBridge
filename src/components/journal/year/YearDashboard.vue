<script setup lang="ts">
/* 履历页最上面的年轮区块（用户 2026-10-27 给的参考图：去掉生成图那种背景和配画，结构照着排）：
   左边年轮卡（点进 /rings）、右边全年日历格子（标题栏上翻年、问 AI）、下面四张小结卡（点开有二级界面）。
   中间原来还有一张「这一年」（粒子年份、三个数、面积图），用户嫌丑，去掉了。
   能看到的都能交给 AI（useYearView 的 askAi，「交给 AI」整页从日历那张卡长出来）。 */
import { computed, onActivated, onMounted, ref, shallowRef } from 'vue';
import Icon from '../../Icon.vue';
import AskAiButton from '../../ask/AskAiButton.vue';
import GlassRim from '../../shell/GlassRim.vue';
import { useAnnualRings } from '../../../composables/useAnnualRings';
import { defaultRingYear } from '../../../lib/rings/selection';
import RingsCard from './RingsCard.vue';
import YearCalendar from './YearCalendar.vue';
import YearHighlights, { type HighlightKind } from './YearHighlights.vue';
import YearDetailDialog from './YearDetailDialog.vue';
import { useYearView } from './useYearView';
import { useYearText } from './year.i18n';
import { useJournalText } from '../journal.i18n';

const y = useYearText();
const j = useJournalText();
/* 全应用一份（composables/useAnnualRings.ts）：返回履历页时直接用上次的数据画，形变量到的卡位置才对。 */
const { data, error, loaded, load } = useAnnualRings();
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
/* 翻年：年份数字顺着翻的方向滑进来（往后翻从右边进、往前翻从左边进）。 */
const direction = ref<'prev' | 'next'>('next');
const step = (delta: number) => {
  const next = order.value[order.value.indexOf(selected.value ?? NaN) + delta];
  if (next === undefined) return;
  direction.value = delta < 0 ? 'prev' : 'next';
  picked.value = next;
};
const view = useYearView(data, selected);
const { year, legend, months, activeMonths, allStreaks, bestMonth, longestRun } = view;
const calendarCard = ref<HTMLElement | null>(null);

const detail = shallowRef<{ kind: HighlightKind; origin: HTMLElement } | null>(null);
</script>

<template>
  <section class="year-dashboard" :aria-label="year ? String(year.year) : undefined">
    <RingsCard class="nebula-slot" :years="data?.years ?? []" :year="year" :legend="legend" />
    <section v-if="year && data" ref="calendarCard" class="calendar-card">
      <header>
        <h2>{{ y.activity }}</h2>
        <AskAiButton direct :label="String(year.year)" @activate="view.askAi(calendarCard)" />
        <div class="stepper glass-control is-lens-host has-rim">
          <GlassRim />
          <button type="button" :disabled="order.indexOf(year.year) <= 0" :aria-label="y.prevYear" @click="step(-1)"><Icon name="chevron-right" :size="16" class="flip" /></button>
          <span class="stepper-year" aria-live="polite"><Transition :name="`year-${direction}`"><span :key="year.year">{{ year.year }}</span></Transition></span>
          <button type="button" :disabled="order.indexOf(year.year) >= order.length - 1" :aria-label="y.nextYear" @click="step(1)"><Icon name="chevron-right" :size="16" /></button>
        </div>
      </header>
      <YearCalendar :year="year" :today="data.today" />
    </section>
    <!-- 还没读到：占着日历的位置，不说「还没有」（以前第一次点进来先闪一下「还没有」再出日历）。 -->
    <div v-else-if="!loaded" class="calendar-card placeholder" aria-hidden="true" />
    <div v-else class="calendar-card empty">{{ error || j.noRecord }}</div>
    <div v-if="!loaded && !year" class="highlights-slot highlight-placeholders" aria-hidden="true"><i v-for="n in 4" :key="n" /></div>
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
.calendar-card.placeholder { min-height: 184px; }
.calendar-card header { display: flex; align-items: center; gap: 10px; }
.calendar-card h2 { margin: 0 auto 0 0; font-size: var(--fs-lg); font-weight: 600; }
.calendar-card :deep(svg) { max-width: none !important; }
/* 翻年用浮在卡上的液态玻璃胶囊（用户 2026-10-27：「右上角的切换居然不是 Liquid Glass」）：和顶栏的按钮组同一种做法，
   玻璃画在垫底的 GlassRim 上、外圈一窄条折射；只带 .glass-control 是一层毛玻璃，在不透明的卡上看着就是个描边胶囊。 */
.stepper { display: flex; align-items: center; gap: 2px; padding: 3px; border-radius: 999px; }
.stepper-year { display: grid; place-items: center; min-width: 3.4em; height: 28px; overflow: hidden; font-variant-numeric: tabular-nums; font-weight: 600; }
.stepper-year > span { grid-area: 1 / 1; }
.stepper button { display: grid; place-items: center; width: 32px; height: 30px; border: 0; border-radius: 999px; background: none; color: var(--ink); cursor: pointer;
  transition: background var(--dur-base) ease, scale var(--dur-fast) var(--ease-out); }
.stepper button:hover:not(:disabled) { background: color-mix(in srgb, var(--ink) 10%, transparent); }
.stepper button:active:not(:disabled) { scale: .9; background: color-mix(in srgb, var(--ink) 16%, transparent); }
.stepper button:disabled { color: var(--subtle); cursor: default; }
.year-next-enter-active, .year-next-leave-active, .year-prev-enter-active, .year-prev-leave-active { transition: transform 260ms var(--ease-out), opacity 200ms ease; }
.year-next-enter-from, .year-prev-leave-to { transform: translateX(70%); opacity: 0; }
.year-next-leave-to, .year-prev-enter-from { transform: translateX(-70%); opacity: 0; }
.flip { transform: rotate(180deg); }
.highlights-slot { grid-column: 1 / -1; }
.highlight-placeholders { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 16px; }
.highlight-placeholders i { min-height: 168px; border-radius: var(--radius-lg); background: var(--mat-card); box-shadow: var(--mat-rim), var(--mat-shadow); }
@container journal (max-width: 1100px) { .nebula-slot, .calendar-card { grid-column: 1 / -1; } }
@container journal (max-width: 1000px) { .highlight-placeholders { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
@media (prefers-reduced-motion: reduce) { .year-next-enter-active, .year-next-leave-active, .year-prev-enter-active, .year-prev-leave-active { transition: none; } }
</style>
