<script setup lang="ts">
/* 睡眠分期环：整圈按深睡、浅睡、REM、清醒的占比分四段（lib/album/album.ts 的 stageRing），圈中可写一个数（评分）。
   月头部、日档每一行、睡眠详情页共用这一种画法，颜色走 --sleep-* 令牌。
   四段都没有时退回单色评分弧（弧长 = 评分），评分也没有就只画底圈。 */
import { computed } from 'vue';
import { stageRing, type SleepStages } from '../../lib/album/album';
import type { InkPhase } from '../../lib/motion/develop';

const props = defineProps<{
  stages?: Partial<Record<keyof SleepStages, number | null | undefined>> | null;
  /** 圈中写的数（评分）；没有就空着。 */
  value?: number | null;
  /** 圆环描边粗细（viewBox 是 42）。 */
  stroke?: number;
  label?: string;
  /** 显影（lib/motion/develop.ts）：潜伏时四段已是最终形状、只是淡色，显影时淡入成实色。 */
  ink?: InkPhase;
}>();

const parts = computed(() => {
  const s = props.stages;
  if (!s) return [];
  const pick = (key: keyof SleepStages) => { const v = s[key]; return typeof v === 'number' && Number.isFinite(v) ? v : 0; };
  return stageRing({ deep: pick('deep'), light: pick('light'), rem: pick('rem'), awake: pick('awake') });
});
const shown = computed(() => (typeof props.value === 'number' && Number.isFinite(props.value) && props.value > 0 ? Math.round(props.value) : null));
const fallback = computed(() => (!parts.value.length && shown.value !== null ? Math.min(100, shown.value) : null));
</script>

<template>
  <svg :class="['stage-ring', { latent: ink === 'latent' }]" viewBox="0 0 42 42" :role="label ? 'img' : undefined" :aria-label="label" :aria-hidden="label ? undefined : 'true'" focusable="false"
    :style="{ '--ring-stroke': stroke ?? 5 }">
    <circle class="ring-base" cx="21" cy="21" r="15.915" />
    <circle v-for="arc in parts" :key="arc.stage" :class="['ring-part', arc.stage]" cx="21" cy="21" r="15.915" :stroke-dasharray="arc.dash" :stroke-dashoffset="arc.offset" />
    <circle v-if="fallback !== null" class="ring-part score" cx="21" cy="21" r="15.915" :stroke-dasharray="`${fallback} ${100 - fallback}`" stroke-dashoffset="25" />
    <text v-if="shown !== null" x="21" y="21" dominant-baseline="central" text-anchor="middle">{{ shown }}</text>
  </svg>
</template>

<style scoped>
.stage-ring { display: block; flex: none; overflow: visible; }
.stage-ring circle { fill: none; stroke-width: var(--ring-stroke); }
.ring-base { stroke: color-mix(in srgb, var(--ink) 7%, transparent); }
.ring-part.deep { stroke: var(--sleep-deep); }
.ring-part.light { stroke: var(--sleep-light); }
.ring-part.rem { stroke: var(--sleep-rem); }
.ring-part.awake { stroke: var(--sleep-awake); }
.ring-part.score { stroke: var(--sleep); stroke-linecap: round; }
.ring-part { transition: opacity var(--dur-slow, 600ms) var(--ease-enter, ease-out); }
.latent .ring-part { opacity: .38; }
@media (prefers-reduced-motion: reduce) { .ring-part { transition: none; } }
text { fill: var(--ink); font-size: 12.5px; font-weight: 700; font-variant-numeric: tabular-nums; }
</style>
