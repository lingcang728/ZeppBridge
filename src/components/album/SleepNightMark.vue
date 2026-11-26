<script setup lang="ts">
/* 睡眠日档一行右边的小记号：一根细横线只标入睡、醒来两个点（所有行共用一条时间轴，上下对得齐），
   右边一枚分期环：整圈按深睡 / 浅睡 / REM / 清醒分四色（各行起点一致，上下一扫就能比结构），圈中写评分。
   以前每行是一整条分期色带（一晚几十到上百段），滚动和退出页面的形变都要整页重画，这里只有几个元素。
   没有分期就退回单色评分弧；分期、评分都没有就不画环。
   默认插槽钉在横线正中间（睡前日志的标记）：浮在线上、不占横向位置，各行的线照样从同一处起、到同一处止。 */
import { computed } from 'vue';
import StageRing from './StageRing.vue';
import type { SleepStages } from '../../lib/album/album';

const props = defineProps<{
  /** 入睡、醒来：当地中午之后的分钟数（醒来可以超过 1440）。 */
  from: number;
  to: number;
  /** 共用的时间轴（同样是中午之后的分钟数）；没有就按这一晚自己铺满。 */
  axis?: { from: number; to: number } | null;
  score?: number | null;
  scoreLabel?: string;
  stages?: Partial<Record<keyof SleepStages, number | null | undefined>> | null;
}>();

const span = computed(() => {
  const from = props.axis?.from ?? props.from;
  const to = props.axis?.to ?? props.to;
  const width = Math.max(1, to - from);
  const clamp = (v: number) => Math.min(100, Math.max(0, v));
  return { start: clamp(((props.from - from) / width) * 100), end: clamp(((props.to - from) / width) * 100) };
});
const ringScore = computed(() => (typeof props.score === 'number' && props.score > 0 ? Math.min(100, Math.round(props.score)) : null));
const hasStages = computed(() => Object.values(props.stages ?? {}).some((v) => typeof v === 'number' && v > 0));
</script>

<template>
  <span class="night-mark">
    <span class="night-line" aria-hidden="true" :style="{ '--start': `${span.start}%`, '--end': `${span.end}%` }"><i class="dot onset" /><i class="dot wake" /><span v-if="$slots.default" class="night-pin"><slot /></span></span>
    <StageRing v-if="ringScore !== null || hasStages" class="score-ring" :stages="stages" :value="ringScore" :stroke="4.6" :label="scoreLabel" />
  </span>
</template>

<style scoped>
.night-mark { display: flex; align-items: center; gap: 14px; width: 100%; min-width: 0; }
/* 一根很淡的底线（整条时间轴），入睡到醒来那一段加深，两头各一个点。 */
.night-line { position: relative; flex: 1; min-width: 60px; height: 10px; }
.night-line::before, .night-line::after { content: ''; position: absolute; top: 50%; height: 2px; border-radius: 2px; translate: 0 -50%; }
.night-line::before { left: 0; right: 0; background: color-mix(in srgb, var(--ink) 7%, transparent); }
.night-line::after { left: var(--start); right: calc(100% - var(--end)); background: color-mix(in srgb, var(--sleep) 55%, transparent); }
.dot { position: absolute; z-index: 1; top: 50%; width: 8px; height: 8px; border-radius: 50%; translate: -50% -50%; }
.dot.onset { left: var(--start); background: var(--sleep); }
.dot.wake { left: var(--end); background: var(--mat-card-solid); box-shadow: inset 0 0 0 2px var(--sleep); }
.night-pin { position: absolute; z-index: 2; top: 50%; left: 50%; translate: -50% -50%; display: flex; }
.score-ring { width: 38px; height: 38px; }
</style>
