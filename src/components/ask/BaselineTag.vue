<script setup lang="ts">
/**
 * 「比平时高 6」「比平时低 3」的小标记（精修批次 6.2）。只和用户自己的近 28 天比，数据不够或者在平时的范围里
 * 就什么都不画。悬停说清楚基线是多少、这不是诊断。差值按卡片自己的格式写（小数位、千分位跟卡片一致）。
 */
import { computed } from 'vue';
import { useMetricBaselines } from '../../composables/useMetricBaselines';
import { useAskText } from './ask.i18n';

const props = defineProps<{ metric: string | null | undefined; format: (value: number) => string; unit?: string }>();
const a = useAskText();
const { baselineOf } = useMetricBaselines();
const baseline = computed(() => baselineOf(props.metric));
const text = computed(() => {
  const b = baseline.value;
  // 按码分支（ui.metric_baseline.usual 不画）；差值让界面按卡片自己的格式排。
  if (!b || b.message_code === 'ui.metric_baseline.usual') return null;
  const delta = `${props.format(Math.abs(b.delta))}${props.unit ? ` ${props.unit}` : ''}`;
  if (b.message_code === 'ui.metric_baseline.above') return a.value.above(delta);
  if (b.message_code === 'ui.metric_baseline.below') return a.value.below(delta);
  return null;
});
const hint = computed(() => (baseline.value ? a.value.baselineHint(`${props.format(baseline.value.median)}${props.unit ? ` ${props.unit}` : ''}`, 28) : ''));
</script>

<template>
  <span v-if="text" :class="['baseline-tag', baseline?.direction]" :title="hint"><i aria-hidden="true">{{ baseline?.direction === 'above' ? '↑' : '↓' }}</i>{{ text }}</span>
</template>

<style scoped>
.baseline-tag { display: inline-flex; align-items: center; gap: 4px; padding: 1px 8px; border-radius: 999px; background: color-mix(in srgb, var(--ink) 7%, transparent);
  color: var(--ink); font-size: var(--fs-2xs); font-weight: 600; font-variant-numeric: tabular-nums; white-space: nowrap; }
.baseline-tag i { font-style: normal; color: var(--muted); }
</style>
