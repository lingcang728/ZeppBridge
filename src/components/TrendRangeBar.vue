<script setup lang="ts">
/* 按天趋势的范围开关（U11）：几个详情页同一个位置、同一句标签、同一个全局记忆的范围。
 * 标签后面写出实际日期（「9月1日 – 9月30日」），不读说明也知道它管的是下面这些按天的图。
 * 除了四个预设档，还能选「自定义」：起止两个日期，终点可以是过去的某一天（lib/trendWindow.ts）。 */
import { computed } from 'vue';
import { useSectionTour } from '../composables/useTour';
import SegmentTrack from './SegmentTrack.vue';
import { selectCustomRange, selectPresetRange, useTrendRange } from '../composables/useTrendRange';
import { useTrendSmoothing } from '../composables/useTrendSmoothing';
import { SERIES_FETCH_DAYS, seriesRanges, windowStartDate, type SeriesRangeDays } from '../lib/metricSeries';
import { CUSTOM_MAX_DAYS, customRange, formatDay, validCustomRange } from '../lib/trendWindow';
import { today as currentToday } from '../lib/currentDay';
import { displayDateTimeFormatter, parseDisplayDate } from '../lib/dateTime';
import { defineMessages, useMessages } from '../i18n';

const messages = defineMessages(
  {
    label: '按天趋势',
    aria: '按天趋势的时间范围',
    smooth: '7 天均线',
    smoothHint: '在曲线上叠一条 7 天移动平均',
    custom: '自定义',
    from: '从',
    to: '到',
    customHint: (days: number) => `最早能选到 ${days} 天前；至少选两天，终点不晚于今天`,
    invalid: '日期范围不对：起点要早于终点，且在可选范围内',
  },
  {
    label: 'Daily trends',
    aria: 'Time range for daily trends',
    smooth: '7-day average',
    smoothHint: 'Overlay a 7-day moving average on the charts',
    custom: 'Custom',
    from: 'From',
    to: 'To',
    customHint: (days: number) => `You can go back up to ${days} days; pick at least two days, ending no later than today`,
    invalid: 'That date range does not work: the start must be before the end and within the available window',
  },
  {
    label: 'Tendencias diarias',
    aria: 'Rango de tiempo de las tendencias diarias',
    smooth: 'Media de 7 días',
    smoothHint: 'Superpone una media móvil de 7 días en las gráficas',
    custom: 'Personalizado',
    from: 'Desde',
    to: 'Hasta',
    customHint: (days: number) => `Puedes ir hasta ${days} días atrás; elige al menos dos días y que terminen como mucho hoy`,
    invalid: 'Ese rango de fechas no vale: el inicio debe ser anterior al final y estar dentro de lo disponible',
  },
  'components/TrendRangeBar',
);
const t = useMessages(messages);

const range = useTrendRange();
const smooth7 = useTrendSmoothing();
const ranges = computed(() => seriesRanges());
const CUSTOM = 'custom';
const items = computed(() => [
  ...ranges.value.map((item) => ({ value: item.days as number | string, label: item.label })),
  { value: CUSTOM as number | string, label: t.value.custom },
]);
const selected = computed<number | string>(() => (customRange.value ? CUSTOM : range.value));

const pick = (value: string | number) => {
  if (value === CUSTOM) {
    // 第一次点「自定义」：从当前预设的那段日期起步，之后再改两端。
    if (!customRange.value) {
      const current = { from: windowStartDate(range.value), to: formatDay(currentToday()) };
      selectCustomRange(validCustomRange(current) ? current : { from: windowStartDate(7), to: formatDay(currentToday()) });
    }
    return;
  }
  selectPresetRange(Number(value) as SeriesRangeDays);
};

/* 两个日期输入：能取到的最早一天是「今天往回数一页的天数」，最晚是今天。 */
const earliest = computed(() => windowStartDate(Math.min(CUSTOM_MAX_DAYS, SERIES_FETCH_DAYS), currentToday()));
const latest = computed(() => formatDay(currentToday()));
const bad = computed(() => Boolean(customRange.value) && !validCustomRange(customRange.value!));
const edit = (field: 'from' | 'to', value: string) => {
  const base = customRange.value ?? { from: windowStartDate(range.value), to: latest.value };
  const next = { ...base, [field]: value };
  if (validCustomRange(next)) selectCustomRange(next);
};

const span = computed(() => {
  const format = displayDateTimeFormatter(customRange.value
    ? { year: 'numeric', month: 'short', day: 'numeric' }
    : { month: 'short', day: 'numeric' });
  const from = format.format(parseDisplayDate(windowStartDate(range.value)));
  const to = format.format(parseDisplayDate(windowStartDate(1)));
  return `${from} – ${to}`;
});
/* 新手引导「指标与挑日子」一章：几个指标页共用这条时间范围条，挂在这里一处就够。 */
useSectionTour('metric');
</script>

<template>
  <div class="range-bar">
    <p class="range-bar-label">
      <strong>{{ t.label }}</strong>
      <span>{{ span }}</span>
    </p>
    <div class="range-controls">
      <button type="button" class="smooth-toggle" :aria-pressed="smooth7" :title="t.smoothHint" @click="smooth7 = !smooth7">{{ t.smooth }}</button>
      <SegmentTrack
        :items="items"
        :model-value="selected"
        :aria-label="t.aria"
        @update:model-value="pick"
      />
    </div>
    <div v-if="customRange" class="range-custom">
      <label><span>{{ t.from }}</span>
        <input type="date" :value="customRange.from" :min="earliest" :max="customRange.to" @change="edit('from', ($event.target as HTMLInputElement).value)" />
      </label>
      <label><span>{{ t.to }}</span>
        <input type="date" :value="customRange.to" :min="customRange.from" :max="latest" @change="edit('to', ($event.target as HTMLInputElement).value)" />
      </label>
      <small>{{ bad ? t.invalid : t.customHint(CUSTOM_MAX_DAYS) }}</small>
    </div>
  </div>
</template>

<style scoped>
.range-bar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-top: var(--space-2);
}
/* 极简：一枚朴素的开关，开着时只有字变成强调色（不画胶囊底、不发光）。 */
.range-controls { display: flex; flex-wrap: wrap; align-items: center; gap: 12px; }
.smooth-toggle { padding: 4px 10px; border: 0; border-radius: var(--radius-sm); background: transparent; box-shadow: inset 0 0 0 1px var(--mat-line); color: var(--muted); font: inherit; font-size: var(--fs-xs); cursor: pointer; }
.smooth-toggle:hover { box-shadow: inset 0 0 0 1px var(--mat-line-hover); }
.smooth-toggle[aria-pressed='true'] { color: var(--accent); box-shadow: inset 0 0 0 1px var(--accent); }
.range-bar-label { display: flex; flex-wrap: wrap; align-items: baseline; gap: 4px 10px; margin: 0; }
.range-bar-label strong { color: var(--ink); font-size: var(--fs-lg); font-weight: 700; }
.range-bar-label span { color: var(--subtle); font-size: var(--fs-sm); font-variant-numeric: tabular-nums; }
.range-custom { display: flex; flex-basis: 100%; flex-wrap: wrap; align-items: center; justify-content: flex-end; gap: 8px 14px; }
.range-custom label { display: inline-flex; align-items: center; gap: 6px; color: var(--subtle); font-size: var(--fs-xs); }
.range-custom input { min-height: 32px; padding: 4px 10px; border: 0; border-radius: var(--radius-sm); background: transparent; box-shadow: inset 0 0 0 1px var(--mat-line); color: var(--ink); font: inherit; font-size: var(--fs-xs); color-scheme: inherit; }
.range-custom input:hover { box-shadow: inset 0 0 0 1px var(--mat-line-hover); }
.range-custom input:focus-visible { outline: 2px solid var(--focus); outline-offset: 2px; }
.range-custom small { color: var(--subtle); font-size: var(--fs-2xs); }
</style>
