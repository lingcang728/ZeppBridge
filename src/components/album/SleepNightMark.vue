<script setup lang="ts">
/* 睡眠日档一行右边的小记号：一根细横线只标入睡、醒来两个点（所有行共用一条时间轴，上下对得齐），右边一枚评分小圆环。
   以前每行是一整条分期色带（一晚几十到上百段），滚动和退出页面的形变都要整页重画，这里只有几个元素。
   没有评分就不画环（不画一个 0 分的空环）。 */
import { computed } from 'vue';

const props = defineProps<{
  /** 入睡、醒来：当地中午之后的分钟数（醒来可以超过 1440）。 */
  from: number;
  to: number;
  /** 共用的时间轴（同样是中午之后的分钟数）；没有就按这一晚自己铺满。 */
  axis?: { from: number; to: number } | null;
  score?: number | null;
  scoreLabel?: string;
}>();

const span = computed(() => {
  const from = props.axis?.from ?? props.from;
  const to = props.axis?.to ?? props.to;
  const width = Math.max(1, to - from);
  const clamp = (v: number) => Math.min(100, Math.max(0, v));
  return { start: clamp(((props.from - from) / width) * 100), end: clamp(((props.to - from) / width) * 100) };
});
const ringScore = computed(() => (typeof props.score === 'number' && props.score > 0 ? Math.min(100, Math.round(props.score)) : null));
</script>

<template>
  <span class="night-mark">
    <span class="night-line" aria-hidden="true" :style="{ '--start': `${span.start}%`, '--end': `${span.end}%` }"><i class="dot onset" /><i class="dot wake" /></span>
    <svg v-if="ringScore !== null" class="score-ring" viewBox="0 0 36 36" role="img" :aria-label="scoreLabel" focusable="false">
      <circle class="ring-base" cx="18" cy="18" r="15.915" />
      <circle class="ring-value" cx="18" cy="18" r="15.915" :stroke-dasharray="`${ringScore} ${100 - ringScore}`" stroke-dashoffset="25" />
      <text x="18" y="18" dominant-baseline="central" text-anchor="middle">{{ ringScore }}</text>
    </svg>
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
.score-ring { flex: none; width: 34px; height: 34px; }
.score-ring circle { fill: none; stroke-width: 3.2; }
.ring-base { stroke: color-mix(in srgb, var(--ink) 8%, transparent); }
.ring-value { stroke: var(--sleep); stroke-linecap: round; }
.score-ring text { fill: var(--ink); font-size: 11px; font-weight: 700; font-variant-numeric: tabular-nums; }
</style>
