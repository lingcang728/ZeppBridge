<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, useId } from 'vue';

const props = defineProps<{
  values: number[];
  color: string;
  label: string;
}>();

const HEIGHT = 52;
const PAD_Y = 8;
const PAD_X = 6;
const host = ref<HTMLElement | null>(null);
const width = ref(280);
const uid = useId().replace(/[^a-zA-Z0-9_-]/g, '');
const fillId = `spark-fill-${uid}`;
const glowId = `spark-glow-${uid}`;
let observer: ResizeObserver | null = null;

const samples = computed(() => props.values.filter((value) => Number.isFinite(value)));
const points = computed(() => {
  const values = samples.value;
  if (values.length < 2) return [];
  const low = Math.min(...values);
  const high = Math.max(...values);
  const span = high - low || 1;
  const inner = Math.max(width.value - PAD_X * 2, 8);
  const step = inner / (values.length - 1);
  return values.map((value, index) => ({
    x: PAD_X + index * step,
    y: HEIGHT - PAD_Y - ((value - low) / span) * (HEIGHT - PAD_Y * 2),
  }));
});

const linePath = computed(() => {
  const pts = points.value;
  if (pts.length < 2) return '';
  let d = `M${pts[0].x.toFixed(1)} ${pts[0].y.toFixed(1)}`;
  for (let i = 0; i < pts.length - 1; i += 1) {
    const p0 = pts[i - 1] ?? pts[i];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[i + 2] ?? p2;
    const c1x = p1.x + (p2.x - p0.x) / 6;
    const c1y = p1.y + (p2.y - p0.y) / 6;
    const c2x = p2.x - (p3.x - p1.x) / 6;
    const c2y = p2.y - (p3.y - p1.y) / 6;
    d += ` C${c1x.toFixed(1)} ${c1y.toFixed(1)} ${c2x.toFixed(1)} ${c2y.toFixed(1)} ${p2.x.toFixed(1)} ${p2.y.toFixed(1)}`;
  }
  return d;
});

const areaPath = computed(() => {
  const pts = points.value;
  if (pts.length < 2 || !linePath.value) return '';
  const last = pts[pts.length - 1];
  const first = pts[0];
  const base = HEIGHT - 2;
  return `${linePath.value} L${last.x.toFixed(1)} ${base} L${first.x.toFixed(1)} ${base} Z`;
});

const lastPoint = computed(() => points.value[points.value.length - 1] ?? null);

onMounted(() => {
  if (!host.value) return;
  const apply = () => {
    const next = Math.round(host.value?.clientWidth ?? 280);
    if (next > 0) width.value = next;
  };
  apply();
  observer = new ResizeObserver(apply);
  observer.observe(host.value);
});
onBeforeUnmount(() => observer?.disconnect());
</script>

<template>
  <div v-if="lastPoint" ref="host" class="sparkline">
    <svg
      :viewBox="`0 0 ${width} ${HEIGHT}`"
      preserveAspectRatio="none"
      role="img"
      :aria-label="label"
    >
      <defs>
        <linearGradient :id="fillId" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" :stop-color="color" stop-opacity="0.38" />
          <stop offset="100%" :stop-color="color" stop-opacity="0" />
        </linearGradient>
        <filter :id="glowId" x="-20%" y="-40%" width="140%" height="180%">
          <feGaussianBlur stdDeviation="1.6" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>
      <path :d="areaPath" :fill="`url(#${fillId})`" />
      <path
        :d="linePath"
        fill="none"
        :stroke="color"
        stroke-width="2.4"
        stroke-linecap="round"
        stroke-linejoin="round"
        :filter="`url(#${glowId})`"
      />
      <circle :cx="lastPoint.x" :cy="lastPoint.y" r="4.2" :fill="color" fill-opacity="0.28" />
      <circle :cx="lastPoint.x" :cy="lastPoint.y" r="2.5" :fill="color" />
    </svg>
  </div>
</template>

<style scoped>
.sparkline { width: 100%; height: 52px; min-width: 0; }
.sparkline svg { display: block; width: 100%; height: 100%; overflow: visible; }
</style>
