<script setup lang="ts">
/**
 * 卡片底行「状态词 ←→ 常态范围」（3.1，取自 tobi 稿，去掉人群常模）：左边是和自己比的结论
 * （平时 / 比平时高 6 / 比平时低 3，规则同 BaselineTag），右边是你自己近 90 天中间八成的读数。
 * 范围只来自本机的历史，数据不够（少于 14 天）整行不画，不拿人群常模顶上。
 */
import { computed } from 'vue';
import { useMetricBaselines } from '../../composables/useMetricBaselines';
import { useAskText } from './ask.i18n';

const props = defineProps<{
  metric: string | null | undefined;
  format: (value: number) => string;
  /** 只画右边的范围（二级页：状态词已经由大数字旁的标记说了）。 */
  rangeOnly?: boolean;
}>();
const a = useAskText();
const { baselineOf } = useMetricBaselines();
const baseline = computed(() => baselineOf(props.metric));
const range = computed(() => {
  const b = baseline.value;
  if (!b || b.usual_low == null || b.usual_high == null) return null;
  const low = props.format(b.usual_low);
  const high = props.format(b.usual_high);
  return low === high ? low : `${low}–${high}`;
});
const word = computed(() => {
  const b = baseline.value;
  if (!b) return '';
  // 单位已经跟在大数字后面，这里不再重复（磁贴窄，带单位会被截断）。
  const delta = props.format(Math.abs(b.delta));
  if (b.message_code === 'ui.metric_baseline.above') return a.value.above(delta);
  if (b.message_code === 'ui.metric_baseline.below') return a.value.below(delta);
  return a.value.usualWord;
});
const hint = computed(() => (range.value ? a.value.usualHint(range.value, baseline.value?.usual_days ?? 90) : ''));
</script>

<template>
  <span v-if="range" :class="['usual-row', { 'range-only': rangeOnly }]" :title="hint">
    <span v-if="!rangeOnly" :class="['usual-word', baseline?.direction]">{{ word }}</span>
    <span class="usual-range">{{ a.usualRange(range) }}</span>
  </span>
</template>

<style scoped>
.usual-row { display: flex; align-items: baseline; justify-content: space-between; gap: 10px; min-width: 0; font-size: var(--fs-2xs); font-variant-numeric: tabular-nums; }
.usual-row.range-only { display: inline-flex; }
.usual-word { overflow: hidden; color: var(--muted); text-overflow: ellipsis; white-space: nowrap; }
/* 偏离平时只加重字，不换颜色：全局颜色只表达「是哪项指标」。 */
.usual-word.above, .usual-word.below { color: var(--ink); font-weight: 600; }
.usual-range { flex: none; color: var(--subtle); white-space: nowrap; }
</style>
