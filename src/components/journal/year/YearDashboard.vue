<script setup lang="ts">
/* 履历页最上面的年轮区块（用户 2026-10-27 给的参考图：去掉生成图那种背景和配画，结构照着排）：
   左边年轮卡（点进 /rings）、右边全年日历格子（标题栏上翻年、问 AI）、下面四张小结卡（点开有二级界面）。
   中间原来还有一张「这一年」（粒子年份、三个数、面积图），用户嫌丑，去掉了。
   能看到的都能交给 AI（useYearView 的 askAi，「交给 AI」整页从日历那张卡长出来）。 */
import { computed, onActivated, onMounted, ref, shallowRef } from 'vue';
import AskAiButton from '../../ask/AskAiButton.vue';
import SegmentTrack from '../../SegmentTrack.vue';
import CapsuleWheel from '../../CapsuleWheel.vue';
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
/* 翻年：和顶栏导航、换语言同一种液态玻璃（用户 2026-10-28：「拖动液态玻璃就能切换」）。五年以内是一条
   SegmentTrack，按住镜片左右拖、点哪年都行；更多年放不下，用语言那种胶囊滚轮（CapsuleWheel）。 */
const yearItems = computed(() => (data.value?.years ?? []).map(v => ({ value: v.year, label: String(v.year) })));
const pick = (value: number) => { picked.value = value; };
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
        <template v-if="yearItems.length > 1">
          <SegmentTrack v-if="yearItems.length <= 5" class="year-track" variant="glass" compact no-wrap :items="yearItems" :model-value="year.year"
            :aria-label="y.activity" @update:model-value="pick" />
          <CapsuleWheel v-else class="year-track" :items="yearItems" :model-value="year.year" :span="132" :aria-label="y.activity" @update:model-value="pick" />
        </template>
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
/* 年份胶囊浮在卡上：和顶栏导航同一种液态玻璃（SegmentTrack 的 glass），字用等宽数字，翻年时镜片滑过去。 */
.year-track { flex: none; font-variant-numeric: tabular-nums; }
.highlights-slot { grid-column: 1 / -1; }
.highlight-placeholders { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 16px; }
.highlight-placeholders i { min-height: 168px; border-radius: var(--radius-lg); background: var(--mat-card); box-shadow: var(--mat-rim), var(--mat-shadow); }
@container journal (max-width: 1100px) { .nebula-slot, .calendar-card { grid-column: 1 / -1; } }
@container journal (max-width: 1000px) { .highlight-placeholders { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
</style>
