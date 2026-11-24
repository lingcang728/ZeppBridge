<script setup lang="ts">
/* 一条运动轨迹的轮廓（只有形状，lib 里没有坐标）：列表行、方块和月 / 年卡的封面都用它。
   画在一块小底板上（圆角、淡网格），像一张缩小的地图，而不是悬空的一笔；起点实心、终点空心。
   描边粗细不随缩放变（vector-effect）。只是图，读屏跳过。`bare`：不要底板（卡片封面自己有底）。 */
import { computed } from 'vue';
import type { RouteShape } from '../../types/album';

const props = defineProps<{ shape: RouteShape; stroke?: number; bare?: boolean }>();
const PAD = 0.1;
const box = computed(() => {
  const w = Math.max(props.shape.width, 0.05);
  const h = Math.max(props.shape.height, 0.05);
  return { w, h, view: `${-PAD} ${-PAD} ${w + PAD * 2} ${h + PAD * 2}` };
});
const path = computed(() => props.shape.points.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(4)} ${y.toFixed(4)}`).join(''));
const start = computed(() => props.shape.points[0] ?? [0, 0]);
const end = computed(() => props.shape.points[props.shape.points.length - 1] ?? [0, 0]);
/** 首尾离得很近（环线）：只画起点，不叠两个点。 */
const loop = computed(() => Math.hypot(end.value[0] - start.value[0], end.value[1] - start.value[1]) < 0.08);
</script>

<template>
  <span :class="['route-glyph', { bare }]" aria-hidden="true">
    <svg :viewBox="box.view" preserveAspectRatio="xMidYMid meet" focusable="false">
      <path class="halo" :d="path" fill="none" :stroke-width="(stroke ?? 2) + 3" stroke-linecap="round" stroke-linejoin="round" vector-effect="non-scaling-stroke" />
      <path :d="path" fill="none" stroke="currentColor" :stroke-width="stroke ?? 2" stroke-linecap="round" stroke-linejoin="round" vector-effect="non-scaling-stroke" />
      <circle v-if="!loop" class="end" :cx="end[0]" :cy="end[1]" r="0.04" vector-effect="non-scaling-stroke" />
      <circle class="start" :cx="start[0]" :cy="start[1]" r="0.045" fill="currentColor" />
    </svg>
  </span>
</template>

<style scoped>
.route-glyph {
  display: block;
  padding: 4px;
  border-radius: 9px;
  /* 淡网格 + 一层品牌色的底：一眼看出是「地图上的一段路」。 */
  background:
    linear-gradient(color-mix(in srgb, var(--ink) 6%, transparent) 1px, transparent 1px) 0 0 / 100% 8px,
    linear-gradient(90deg, color-mix(in srgb, var(--ink) 6%, transparent) 1px, transparent 1px) 0 0 / 8px 100%,
    color-mix(in srgb, currentColor 8%, var(--mat-card-solid, transparent));
  box-shadow: inset 0 0 0 1px color-mix(in srgb, currentColor 14%, transparent);
}
.route-glyph.bare { padding: 0; border-radius: 0; background: none; box-shadow: none; }
svg { display: block; width: 100%; height: 100%; overflow: visible; }
.halo { stroke: color-mix(in srgb, currentColor 18%, transparent); }
.end { fill: var(--mat-card-solid, #111); stroke: currentColor; stroke-width: 1.5; }
</style>
