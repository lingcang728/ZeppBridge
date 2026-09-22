<script setup lang="ts">
import { computed } from 'vue';
const props = defineProps<{
  current: number; baseline: number; currentLabel: string; baselineLabel: string;
  currentText: string; baselineText: string; tone: 'good' | 'bad' | 'flat';
}>();
const maximum = computed(() => Math.max(props.current, props.baseline, 1));
const percent = (value: number) => `${Math.max(0, value) / maximum.value * 100}%`;
</script>

<template>
  <div class="comparison-bars">
    <div class="comparison-row">
      <span>{{ currentLabel }}</span><span class="comparison-number">{{ currentText }}</span>
      <span class="comparison-track"><i :class="tone" :style="{ width: percent(current) }"></i></span>
    </div>
    <div class="comparison-row">
      <span>{{ baselineLabel }}</span><span class="comparison-number">{{ baselineText }}</span>
      <span class="comparison-track"><i class="baseline" :style="{ width: percent(baseline) }"></i></span>
    </div>
  </div>
</template>

<style scoped>
.comparison-bars { display: grid; gap: 10px; margin-block: 10px 6px; }
.comparison-row { display: grid; grid-template-columns: auto minmax(0, 1fr); gap: 5px 10px; color: var(--subtle); font-size: var(--fs-2xs); }
.comparison-number { text-align: right; overflow-wrap: anywhere; font-variant-numeric: tabular-nums; }
.comparison-track { grid-column: 1 / -1; height: 6px; border-radius: 6px; overflow: hidden; background: rgba(232,238,244,.08); }
.comparison-track i { display: block; height: 100%; border-radius: inherit; background: var(--muted); }
.comparison-track .good, .comparison-track .bad { background-color: var(--accent); background-image: repeating-linear-gradient(-45deg, transparent 0 6px, rgba(255,255,255,.28) 6px 10px, transparent 10px 16px); background-size: 24px 24px; animation: comparison-flow 1.8s linear infinite; }
.comparison-track .bad { background-color: var(--danger); }
.comparison-track .baseline { background: rgba(232,238,244,.24); }
@keyframes comparison-flow { to { background-position: 24px 0; } }
@media (prefers-reduced-motion: reduce) { .comparison-track .good, .comparison-track .bad { animation: none; } }
</style>
