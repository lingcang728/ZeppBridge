<script setup lang="ts">
/* 一条运动轨迹的轮廓（只有形状，lib 里没有坐标）：列表行、方块和月 / 年卡的封面都用它。
   描边粗细不随缩放变（vector-effect），起点一个小圆点。只是图，读屏跳过。 */
import { computed } from 'vue';
import type { RouteShape } from '../../types/album';

const props = defineProps<{ shape: RouteShape; stroke?: number }>();
const PAD = 0.06;
const box = computed(() => {
  const w = Math.max(props.shape.width, 0.05);
  const h = Math.max(props.shape.height, 0.05);
  return { w, h, view: `${-PAD} ${-PAD} ${w + PAD * 2} ${h + PAD * 2}` };
});
const path = computed(() => props.shape.points.map(([x, y], i) => `${i ? 'L' : 'M'}${x} ${y}`).join(''));
const start = computed(() => props.shape.points[0] ?? [0, 0]);
</script>

<template>
  <svg class="route-glyph" :viewBox="box.view" preserveAspectRatio="xMidYMid meet" aria-hidden="true" focusable="false">
    <path :d="path" fill="none" stroke="currentColor" :stroke-width="stroke ?? 2" stroke-linecap="round" stroke-linejoin="round" vector-effect="non-scaling-stroke" />
    <circle :cx="start[0]" :cy="start[1]" r="0.035" fill="currentColor" />
  </svg>
</template>

<style scoped>
.route-glyph { display: block; overflow: visible; }
</style>
