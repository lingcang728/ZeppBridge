<script setup lang="ts">
/* 一晚的分期条。`axis` 给了就按同一条时间轴摆（列表里每一行的入睡、醒来对得齐，一眼看出作息漂移）；
   没给就铺满自己（方块里）。没有分期记录的晚上只画入睡到醒来那一段，不编阶段。 */
import { computed } from 'vue';
import type { StageSpan } from '../../types/album';

const props = defineProps<{
  /** 这一晚的开始 / 结束：当地中午之后的分钟数。 */
  from: number;
  to: number;
  spans?: StageSpan[] | null;
  /** 共用时间轴（当地中午之后的分钟数）。 */
  axis?: { from: number; to: number } | null;
}>();

const STAGE_CLASS: Record<string, string> = { deep: 'deep', light: 'light', rem: 'rem', awake: 'awake' };
const frame = computed(() => props.axis ?? { from: props.from, to: props.to });
const pct = (minutes: number) => {
  const span = Math.max(1, frame.value.to - frame.value.from);
  return Math.min(100, Math.max(0, ((minutes - frame.value.from) / span) * 100));
};
const night = computed(() => ({ left: pct(props.from), width: Math.max(0.8, pct(props.to) - pct(props.from)) }));
const slices = computed(() => (props.spans ?? []).map((span) => ({
  key: `${span.from_min}-${span.stage}`,
  cls: STAGE_CLASS[span.stage] ?? 'light',
  left: pct(props.from + span.from_min),
  width: Math.max(0.4, pct(props.from + span.to_min) - pct(props.from + span.from_min)),
})));
</script>

<template>
  <span class="sleep-strip" aria-hidden="true">
    <span class="night" :class="{ bare: !slices.length }" :style="{ left: `${night.left}%`, width: `${night.width}%` }" />
    <span v-for="slice in slices" :key="slice.key" :class="['slice', slice.cls]" :style="{ left: `${slice.left}%`, width: `${slice.width}%` }" />
  </span>
</template>

<style scoped>
.sleep-strip { position: relative; display: block; height: 10px; border-radius: 4px; background: color-mix(in srgb, var(--ink) 5%, transparent); overflow: hidden; }
.night, .slice { position: absolute; top: 0; bottom: 0; }
.night { border-radius: 3px; background: color-mix(in srgb, var(--sleep-light, #7C9CF5) 30%, transparent); }
.night.bare { background: color-mix(in srgb, var(--sleep-light, #7C9CF5) 70%, transparent); }
.slice.deep { background: var(--sleep-deep, #3F4FB8); }
.slice.light { background: var(--sleep-light, #7C9CF5); }
.slice.rem { background: var(--sleep-rem, #2EC4B6); }
.slice.awake { top: 1px; bottom: 1px; background: var(--sleep-awake, #E8833A); }
</style>
