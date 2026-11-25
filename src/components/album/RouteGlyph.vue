<script setup lang="ts">
/* 一条运动轨迹的轮廓（只有形状，lib 里没有坐标）：月档小格和日档行上的缩略图都用它。
   不垫网格底板、不加框：一笔平滑曲线直接画在卡上（后端只给几十个抽样点，这里用 Catmull-Rom 连成曲线，
   折线的棱角就没了），起点一个实心点。线色跟着 currentColor（列表页按运动类型给）。
   描边和起点的像素大小不随缩放变（vector-effect）。只是图，读屏跳过。 */
import { computed } from 'vue';
import type { RouteShape } from '../../types/album';

const props = defineProps<{ shape: RouteShape; stroke?: number }>();
const PAD = 0.08;
const box = computed(() => {
  const w = Math.max(props.shape.width, 0.05);
  const h = Math.max(props.shape.height, 0.05);
  return `${-PAD} ${-PAD} ${w + PAD * 2} ${h + PAD * 2}`;
});
const f = (value: number) => value.toFixed(4);
/** 抽样点 → 过每个点的平滑三次曲线（Catmull-Rom，张力 1/6）。 */
const path = computed(() => {
  const p = props.shape.points;
  if (p.length < 2) return '';
  let d = `M${f(p[0][0])} ${f(p[0][1])}`;
  for (let i = 0; i < p.length - 1; i += 1) {
    const a = p[Math.max(0, i - 1)];
    const b = p[i];
    const c = p[i + 1];
    const e = p[Math.min(p.length - 1, i + 2)];
    d += `C${f(b[0] + (c[0] - a[0]) / 6)} ${f(b[1] + (c[1] - a[1]) / 6)} ${f(c[0] - (e[0] - b[0]) / 6)} ${f(c[1] - (e[1] - b[1]) / 6)} ${f(c[0])} ${f(c[1])}`;
  }
  return d;
});
const start = computed(() => props.shape.points[0] ?? [0, 0]);
</script>

<template>
  <span class="route-glyph" aria-hidden="true">
    <svg :viewBox="box" preserveAspectRatio="xMidYMid meet" focusable="false">
      <path :d="path" fill="none" stroke="currentColor" :stroke-width="stroke ?? 2.4" stroke-linecap="round" stroke-linejoin="round" vector-effect="non-scaling-stroke" />
      <path class="start" :d="`M${f(start[0])} ${f(start[1])}h0`" stroke="currentColor" :stroke-width="(stroke ?? 2.4) + 4.6" stroke-linecap="round" vector-effect="non-scaling-stroke" />
    </svg>
  </span>
</template>

<style scoped>
.route-glyph { display: block; min-width: 0; min-height: 0; }
svg { display: block; width: 100%; height: 100%; overflow: visible; }
</style>
