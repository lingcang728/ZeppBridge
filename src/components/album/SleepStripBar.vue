<script setup lang="ts">
/* 一晚的分期图。`axis` 给了就按同一条时间轴摆（列表里每一行的入睡、醒来对得齐，一眼看出作息漂移）；
   没给就铺满自己（方块里）。没有分期记录的晚上只画入睡到醒来那一段，不编阶段。
   `lanes`：四档小阶梯（清醒在上、深睡在下，和睡眠详情页的分期图同一个排法）——每段落在自己那一档，
   互相不叠；不给就是一条扁条（方块太小，放不下四档）。 */
import { computed } from 'vue';
import type { StageSpan } from '../../types/album';

const props = defineProps<{
  /** 这一晚的开始 / 结束：当地中午之后的分钟数。 */
  from: number;
  to: number;
  spans?: StageSpan[] | null;
  /** 共用时间轴（当地中午之后的分钟数）。 */
  axis?: { from: number; to: number } | null;
  lanes?: boolean;
}>();

const STAGE_CLASS: Record<string, string> = { deep: 'deep', light: 'light', rem: 'rem', awake: 'awake' };
/** 四档从上往下：清醒、快速眼动、浅睡、深睡。 */
const LANE: Record<string, number> = { awake: 0, rem: 1, light: 2, deep: 3 };
const frame = computed(() => props.axis ?? { from: props.from, to: props.to });
const pct = (minutes: number) => {
  const span = Math.max(1, frame.value.to - frame.value.from);
  return Math.min(100, Math.max(0, ((minutes - frame.value.from) / span) * 100));
};
const night = computed(() => ({ left: pct(props.from), width: Math.max(0.8, pct(props.to) - pct(props.from)) }));
const slices = computed(() => (props.spans ?? []).map((span) => ({
  key: `${span.from_min}-${span.stage}`,
  cls: STAGE_CLASS[span.stage] ?? 'light',
  lane: LANE[span.stage] ?? 2,
  left: pct(props.from + span.from_min),
  width: Math.max(0.4, pct(props.from + span.to_min) - pct(props.from + span.from_min)),
})));
</script>

<template>
  <span :class="['sleep-strip', { lanes }]" aria-hidden="true">
    <span class="night" :class="{ bare: !slices.length }" :style="{ left: `${night.left}%`, width: `${night.width}%` }" />
    <span v-for="slice in slices" :key="slice.key" :class="['slice', slice.cls]"
      :style="{ left: `${slice.left}%`, width: `${slice.width}%`, '--lane': slice.lane }" />
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
/* 四档：每档 --lane-h 高、档间留 2px；底下那条淡带标出入睡到醒来。 */
.sleep-strip.lanes { --lane-h: 6px; height: calc(var(--lane-h) * 4 + 6px); border-radius: 6px; background: none; overflow: visible; }
.lanes .night { border-radius: 6px; background: color-mix(in srgb, var(--sleep-light, #7C9CF5) 10%, transparent); }
.lanes .night.bare { top: calc(var(--lane-h) * 2 + 4px); bottom: auto; height: var(--lane-h); background: color-mix(in srgb, var(--sleep-light, #7C9CF5) 60%, transparent); }
.lanes .slice { top: calc(var(--lane) * (var(--lane-h) + 2px)); bottom: auto; height: var(--lane-h); min-width: 1.5px; border-radius: 2px; }
</style>
