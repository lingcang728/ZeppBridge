<script setup lang="ts">
/**
 * 一枚邮票（批次 6）：厚的米白纸、细密齿孔、票面一幅小画，右上角黑色衬线面值。
 * 票面：作者给这一版画了图（docs/releases/letters/<版本>/stamp.*，规格见 docs/releases/README.md）就用它；
 * 没有就贴默认那枚（StampArt.vue：海拔山形，面值照样印这一版的版本号）。
 * 横版，外框 124 × 100，票面 108 × 84，从 (8, 8) 起。
 *
 * 不用 SVG 滤镜和混合模式（2026-10-21：信封翻面时这些要逐帧重画，录屏里整段翻面被跳过）：
 * 纸边的厚度是往右下错开一点的一层暗色齿孔外形，纸纹是一张自带透明度的颗粒图（assets/letters/paper-speck.png）。
 */
import { computed, useId } from 'vue';
import { stampFace } from '../../lib/letters/stamp';
import { useStampImage } from '../../services/letters';
import StampArt from './StampArt.vue';
import speck from '../../assets/letters/paper-speck.png';

const props = withDefaults(defineProps<{ version: string; width?: number; tilt?: number }>(), { width: 92, tilt: 0 });
const face = computed(() => stampFace(props.version));
const image = useStampImage(() => props.version);
const id = `stamp-${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`;

/* 齿孔又细又密：沿四边每 5.2 个单位一个。 */
const holes = computed(() => {
  const list: Array<[number, number]> = [];
  for (let x = 2.4; x <= 124; x += 5.2) list.push([x, 0], [x, 100]);
  for (let y = 2.4; y <= 100; y += 5.2) list.push([0, y], [124, y]);
  return list;
});
</script>

<template>
  <svg class="stamp" :width="width" :height="width * 104 / 128" viewBox="-2 -2 128 104" :style="{ rotate: `${tilt}deg` }" aria-hidden="true">
    <defs>
      <mask :id="`${id}-perf`" maskUnits="userSpaceOnUse" x="-2" y="-2" width="128" height="104">
        <rect width="124" height="100" fill="#fff" />
        <circle v-for="([x, y], i) in holes" :key="i" :cx="x" :cy="y" r="1.85" fill="#000" />
      </mask>
      <pattern :id="`${id}-grain`" width="60" height="60" patternUnits="userSpaceOnUse">
        <image :href="speck" width="60" height="60" />
      </pattern>
      <clipPath :id="`${id}-face`"><rect x="8" y="8" width="108" height="84" /></clipPath>
    </defs>
    <!-- 投在信封上的影子 + 纸的厚度：同一个齿孔外形往右下错开。 -->
    <g :mask="`url(#${id}-perf)`" transform="translate(1.4 1.8)"><rect width="124" height="100" fill="rgb(60 45 25 / .16)" /></g>
    <g :mask="`url(#${id}-perf)`" transform="translate(.5 .6)"><rect width="124" height="100" fill="rgb(90 70 40 / .22)" /></g>
    <g :mask="`url(#${id}-perf)`">
      <rect class="margin" width="124" height="100" />
      <rect width="124" height="100" :fill="`url(#${id}-grain)`" opacity=".8" />
    </g>
    <g :clip-path="`url(#${id}-face)`">
      <image v-if="image" :href="image" x="8" y="8" width="108" height="84" preserveAspectRatio="xMidYMid slice" />
      <g v-else transform="translate(8 8)"><StampArt /></g>
      <!-- 印在纸上：票面也透一点纸纹，四边压一圈淡淡的油墨边。 -->
      <rect x="8" y="8" width="108" height="84" :fill="`url(#${id}-grain)`" opacity=".55" />
      <rect x="8" y="8" width="108" height="84" class="face-edge" />
      <text class="denomination" x="111" y="22" text-anchor="end">{{ face }}</text>
    </g>
  </svg>
</template>

<style scoped>
.stamp { display: block; overflow: visible; }
.margin { fill: #f6f1e5; }
.face-edge { fill: none; stroke: rgb(50 40 25 / .28); stroke-width: .7; }
.denomination {
  font: 400 15px/1 Georgia, 'Times New Roman', 'Songti SC', serif; fill: #1b1915; letter-spacing: -.02em;
  paint-order: stroke; stroke: rgb(246 241 229 / .5); stroke-width: 1.6;
}
</style>
