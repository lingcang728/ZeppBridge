<script setup lang="ts">
/* 按天趋势的范围开关（U11）：四个详情页同一个位置、同一句标签、同一个全局记忆的范围。
 * 标签后面写出实际日期（「9月1日 – 9月30日」），不读说明也知道它管的是下面这些按天的图。 */
import { computed } from 'vue';
import SegmentTrack from './SegmentTrack.vue';
import { useTrendRange } from '../composables/useTrendRange';
import { seriesRanges, windowStartDate, type SeriesRangeDays } from '../lib/metricSeries';
import { displayDateTimeFormatter, parseDisplayDate } from '../lib/dateTime';
import { defineMessages, useMessages } from '../i18n';

const messages = defineMessages(
  {
    label: '按天趋势',
    aria: '按天趋势的时间范围',
  },
  {
    label: 'Daily trends',
    aria: 'Time range for daily trends',
  },
  {
    label: 'Tendencias diarias',
    aria: 'Rango de tiempo de las tendencias diarias',
  },
  'components/TrendRangeBar',
);
const t = useMessages(messages);

const range = useTrendRange();
const ranges = computed(() => seriesRanges());
const pick = (value: string | number) => { range.value = Number(value) as SeriesRangeDays; };

const span = computed(() => {
  const format = displayDateTimeFormatter({ month: 'short', day: 'numeric' });
  const from = format.format(parseDisplayDate(windowStartDate(range.value)));
  const to = format.format(parseDisplayDate(windowStartDate(1)));
  return `${from} – ${to}`;
});
</script>

<template>
  <div class="range-bar">
    <p class="range-bar-label">
      <strong>{{ t.label }}</strong>
      <span>{{ span }}</span>
    </p>
    <SegmentTrack
      :items="ranges.map((item) => ({ value: item.days, label: item.label }))"
      :model-value="range"
      :aria-label="t.aria"
      @update:model-value="pick"
    />
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
.range-bar-label { display: flex; flex-wrap: wrap; align-items: baseline; gap: 4px 10px; margin: 0; }
.range-bar-label strong { color: var(--ink); font-size: var(--fs-lg); font-weight: 700; }
.range-bar-label span { color: var(--subtle); font-size: var(--fs-sm); font-variant-numeric: tabular-nums; }
</style>
