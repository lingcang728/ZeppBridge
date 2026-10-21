<script setup lang="ts">
/**
 * 一枚邮票（lib/letters/stamp.ts 出几何，这里只画）。齿孔是一圈半圆缺口的遮罩，纸面固定米白，
 * 图案是单色线画，颜色来自类别色 token。深浅主题下邮票本身都是「纸」，只有外面的投影跟着主题。
 */
import { computed } from 'vue';
import { stampDesign } from '../../lib/letters/stamp';

const props = withDefaults(defineProps<{ version: string; width?: number; tilt?: number }>(), { width: 64, tilt: 0 });
const design = computed(() => stampDesign(props.version));
const uid = computed(() => `stamp-${props.version.replace(/\./g, '-')}-${Math.round(props.width)}`);

/* 外框 96 × 112，内框 8..88 × 8..104（图案坐标 0..80 × 0..96 平移过去）。齿孔沿四边每 8 个单位一个。 */
const holes = computed(() => {
  const list: Array<[number, number]> = [];
  for (let x = 4; x <= 92; x += 8) list.push([x, 0], [x, 112]);
  for (let y = 4; y <= 108; y += 8) list.push([0, y], [96, y]);
  return list;
});
</script>

<template>
  <svg class="stamp" :width="width" :height="width * 112 / 96" viewBox="0 0 96 112" :style="{ '--stamp-tone': `var(${design.tone})`, rotate: `${tilt}deg` }" aria-hidden="true">
    <defs>
      <mask :id="`${uid}-perf`">
        <rect width="96" height="112" fill="#fff" />
        <circle v-for="([x, y], i) in holes" :key="i" :cx="x" :cy="y" r="2.6" fill="#000" />
      </mask>
      <clipPath :id="`${uid}-inner`"><rect x="8" y="8" width="80" height="96" rx="1.5" /></clipPath>
    </defs>
    <rect class="paper" width="96" height="112" :mask="`url(#${uid}-perf)`" />
    <rect class="frame" x="8" y="8" width="80" height="96" rx="1.5" />
    <g :clip-path="`url(#${uid}-inner)`" transform="translate(8 8)">
      <path v-for="(d, i) in design.paths" :key="i" class="motif" :d="d" />
      <circle v-for="([x, y, r], i) in design.dots" :key="`d${i}`" class="star" :cx="x" :cy="y" :r="r" />
    </g>
    <text class="brand" x="13" y="19">ZEPPBRIDGE</text>
    <text class="face" x="84" y="99" text-anchor="end">{{ design.face }}</text>
  </svg>
</template>

<style scoped>
.stamp { display: block; overflow: visible; filter: drop-shadow(0 1px 1.5px rgb(0 0 0 / .22)); }
.paper { fill: #faf6ec; }
.frame { fill: color-mix(in srgb, var(--stamp-tone) 9%, #faf6ec); stroke: color-mix(in srgb, var(--stamp-tone) 55%, #6d6456); stroke-width: .8; }
.motif { fill: none; stroke: var(--stamp-tone); stroke-width: 1.3; stroke-linecap: round; stroke-linejoin: round; opacity: .9; }
.star { fill: var(--stamp-tone); }
.brand { font: 700 6px/1 var(--font-sans); letter-spacing: .12em; fill: color-mix(in srgb, var(--stamp-tone) 60%, #3a352c); }
.face { font: 700 15px/1 Georgia, 'Times New Roman', serif; fill: #3a352c; }
</style>
