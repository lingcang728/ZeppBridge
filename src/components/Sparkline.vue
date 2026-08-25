<script setup lang="ts">
import { computed } from 'vue';

const props = defineProps<{
  /** Ordered values, oldest first. Gaps must be omitted, not zero-filled. */
  values: number[];
  color: string;
  /** Accessible description; the shape alone says nothing to a screen reader. */
  label: string;
}>();

const WIDTH = 120;
const HEIGHT = 34;
const PADDING = 3;

/**
 * Two points are the minimum that can describe a direction. One reading is a
 * value, not a trend, and drawing it as a flat line would imply a stability
 * that was never measured — so the caller gets nothing to render.
 */
const points = computed(() => {
  const values = props.values.filter((value) => Number.isFinite(value));
  if (values.length < 2) return [];
  const low = Math.min(...values);
  const high = Math.max(...values);
  const span = high - low || 1;
  const step = (WIDTH - PADDING * 2) / (values.length - 1);
  return values.map((value, index) => ({
    x: PADDING + index * step,
    y: HEIGHT - PADDING - ((value - low) / span) * (HEIGHT - PADDING * 2),
  }));
});

const path = computed(() => points.value
  .map((point, index) => `${index === 0 ? 'M' : 'L'}${point.x.toFixed(1)} ${point.y.toFixed(1)}`)
  .join(' '));

const lastPoint = computed(() => points.value[points.value.length - 1] ?? null);
</script>

<template>
  <svg
    v-if="lastPoint"
    class="sparkline"
    :viewBox="`0 0 ${WIDTH} ${HEIGHT}`"
    preserveAspectRatio="none"
    role="img"
    :aria-label="label"
  >
    <path
      :d="path"
      fill="none"
      :stroke="color"
      stroke-width="1.8"
      stroke-linecap="round"
      stroke-linejoin="round"
    />
    <circle :cx="lastPoint.x" :cy="lastPoint.y" r="2.4" :fill="color" />
  </svg>
</template>

<style scoped>
.sparkline { width: 100%; height: 34px; overflow: visible; }
</style>
