<script setup lang="ts">
import { computed } from 'vue';

interface Props {
  value: number;
  size?: number;
  strokeWidth?: number;
  color?: string;
  trackColor?: string;
  showLabel?: boolean;
}

const props = withDefaults(defineProps<Props>(), {
  size: 120,
  strokeWidth: 8,
  color: 'var(--accent)',
  trackColor: 'var(--line)',
  showLabel: true,
});

const radius = computed(() => (props.size - props.strokeWidth) / 2);
const circumference = computed(() => 2 * Math.PI * radius.value);
const clamped = computed(() => Math.max(0, Math.min(100, props.value)));
const offset = computed(() => circumference.value * (1 - clamped.value / 100));
const center = computed(() => props.size / 2);
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
      />
      <text
        v-if="showLabel"
        :x="center"
        :y="center"
        text-anchor="middle"
        dominant-baseline="central"
        class="progress-label"
      >{{ Math.round(clamped) }}%</text>
    </svg>
  </div>
</template>

<style scoped>
.circular-progress {
  display: inline-block;
  position: relative;
}
.progress-label {
  fill: var(--ink);
  font-family: var(--font-mono);
  font-size: clamp(18px, 4vw, 28px);
  font-weight: 500;
}
</style>
