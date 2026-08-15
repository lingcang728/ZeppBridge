<script setup lang="ts">
import { computed } from 'vue';

interface Props {
  value: number;
  size?: number;
  strokeWidth?: number;
  color?: string;
  trackColor?: string;
  showLabel?: boolean;
  unit?: string;
}

const props = withDefaults(defineProps<Props>(), {
  size: 120,
  strokeWidth: 8,
  color: '#CDDC7C',
  trackColor: 'var(--line)',
  showLabel: true,
  unit: '%',
});

const radius = computed(() => (props.size - props.strokeWidth) / 2);
const circumference = computed(() => 2 * Math.PI * radius.value);
const clamped = computed(() => Math.max(0, Math.min(100, props.value)));
const offset = computed(() => circumference.value * (1 - clamped.value / 100));
const center = computed(() => props.size / 2);
const fontSize = computed(() => Math.max(16, Math.round(props.size * 0.28)));
const label = computed(() => `${Math.round(clamped.value)}${props.unit}`);
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
