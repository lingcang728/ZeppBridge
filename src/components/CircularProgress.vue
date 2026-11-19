<script setup lang="ts">
/* 得分圆环。`ink`（lib/motion/develop.ts）：潜伏时弧长已经是最终值、只是淡色；显影时实色从 12 点顺时针扫过淡色弧，
   数字不从 0 数起。之后 value 变了，弧长用 --dur-std 过渡到新值。 */
import { computed, onBeforeUnmount, ref, watch } from 'vue';
import { DEVELOP_EASE, DEVELOP_MS } from '../lib/motion/timing';
import type { InkPhase } from '../lib/motion/develop';

interface Props {
  value: number;
  size?: number;
  strokeWidth?: number;
  color?: string;
  trackColor?: string;
  showLabel?: boolean;
  unit?: string;
  ink?: InkPhase;
}

const props = withDefaults(defineProps<Props>(), {
  size: 120,
  strokeWidth: 8,
  color: 'var(--accent)',
  trackColor: 'var(--line)',
  showLabel: true,
  unit: '%',
  ink: 'solid',
});

const radius = computed(() => (props.size - props.strokeWidth) / 2);
const circumference = computed(() => 2 * Math.PI * radius.value);
const clamped = computed(() => Math.max(0, Math.min(100, props.value)));
const offset = computed(() => circumference.value * (1 - clamped.value / 100));
const center = computed(() => props.size / 2);
const fontSize = computed(() => Math.max(16, Math.round(props.size * 0.28)));
const label = computed(() => `${Math.round(clamped.value)}${props.unit}`);

const inkArc = ref<SVGCircleElement | null>(null);
/** 淡色弧还要不要画：潜伏、显影中要；显影放完或一开始就是实色就不要。 */
const ghost = ref(props.ink !== 'solid');
let run: Animation | null = null;
watch(() => props.ink, (now, before) => {
  if (now === 'develop' && before === 'latent' && inkArc.value && typeof inkArc.value.animate === 'function') {
    run = inkArc.value.animate([{ strokeDashoffset: circumference.value }, { strokeDashoffset: offset.value }], { duration: DEVELOP_MS, easing: DEVELOP_EASE });
    const end = () => { ghost.value = false; run = null; };
    run.finished.then(end, end);
  } else if (now !== 'latent' && !run) {
    ghost.value = false;
  }
});
onBeforeUnmount(() => run?.cancel());
</script>

<template>
  <div class="circular-progress" :style="{ width: `${size}px`, height: `${size}px` }">
    <svg :width="size" :height="size" :viewBox="`0 0 ${size} ${size}`">
      <circle
        :cx="center"
        :cy="center"
        :r="radius"
        fill="none"
        :stroke="trackColor"
        :stroke-width="strokeWidth"
      />
      <circle
        v-if="ghost"
        :cx="center"
        :cy="center"
        :r="radius"
        fill="none"
        :stroke="color"
        :stroke-width="strokeWidth"
        stroke-linecap="round"
        :stroke-dasharray="circumference"
        :stroke-dashoffset="offset"
        :transform="`rotate(-90 ${center} ${center})`"
        opacity=".38"
      />
      <circle
        ref="inkArc"
        class="ink"
        :cx="center"
        :cy="center"
        :r="radius"
        fill="none"
        :stroke="color"
        :stroke-width="strokeWidth"
        stroke-linecap="round"
        :stroke-dasharray="circumference"
        :stroke-dashoffset="ink === 'latent' ? circumference : offset"
        :transform="`rotate(-90 ${center} ${center})`"
        :opacity="ink === 'latent' ? 0 : 1"
      />
      <text
        v-if="showLabel && !$slots.default"
        :x="center"
        :y="center"
        text-anchor="middle"
        dominant-baseline="central"
        class="progress-label"
        :font-size="fontSize"
      >{{ label }}</text>
    </svg>
    <div v-if="$slots.default" class="progress-slot">
      <slot />
    </div>
  </div>
</template>

<style scoped>
.ink { transition: stroke-dashoffset var(--dur-std) var(--ease-enter); }
@media (prefers-reduced-motion: reduce) { .ink { transition: none; } }
.circular-progress {
  display: inline-grid;
  position: relative;
  place-items: center;
}
.progress-label {
  fill: var(--ink);
  font-family: 'Inter', var(--font-sans);
  font-weight: 600;
}
.progress-slot {
  position: absolute;
  inset: 0;
  display: grid;
  place-items: center;
  pointer-events: none;
  text-align: center;
}
</style>
