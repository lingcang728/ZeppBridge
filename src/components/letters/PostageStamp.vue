<script setup lang="ts">
/**
 * 一枚邮票（批次 6；2026-10-21 照用户的参考图重做：厚的米白纸、齿孔有厚度、票面是一幅画，右上角黑色衬线面值）。
 * 票面图用作者为这一版画的图（docs/releases/letters/<版本>/stamp.*，规格见 docs/releases/README.md）；
 * 没有就用默认那张（assets/letters/stamp-default.webp）。图里不带字和边——齿孔、白边、面值都在这里画。
 * 横版，外框 124 × 100，票面 108 × 84，从 (8, 8) 起。
 */
import { computed, useId } from 'vue';
import { stampFace } from '../../lib/letters/stamp';
import { useStampImage } from '../../services/letters';
import fallbackArt from '../../assets/letters/stamp-default.webp';
import tooth from '../../assets/letters/paper-tooth.png';

const props = withDefaults(defineProps<{ version: string; width?: number; tilt?: number }>(), { width: 92, tilt: 0 });
const face = computed(() => stampFace(props.version));
const image = useStampImage(() => props.version);
const id = `stamp-${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`;

/* 齿孔又细又密（参考图那样）：沿四边每 5.2 个单位一个。 */
const holes = computed(() => {
  const list: Array<[number, number]> = [];
  for (let x = 2.4; x <= 124; x += 5.2) list.push([x, 0], [x, 100]);
  for (let y = 2.4; y <= 100; y += 5.2) list.push([0, y], [124, y]);
  return list;
});
</script>

<template>
  <svg class="stamp" :width="width" :height="width * 100 / 124" viewBox="0 0 124 100" :style="{ rotate: `${tilt}deg` }" aria-hidden="true">
    <defs>
      <mask :id="`${id}-perf`">
        <rect width="124" height="100" fill="#fff" />
        <circle v-for="([x, y], i) in holes" :key="i" :cx="x" :cy="y" r="1.85" fill="#000" />
      </mask>
      <pattern :id="`${id}-grain`" width="60" height="60" patternUnits="userSpaceOnUse">
        <image :href="tooth" width="60" height="60" />
      </pattern>
      <!-- 纸边的厚度：齿孔和外沿左上受光、右下压暗。 -->
      <filter :id="`${id}-bevel`" x="-5%" y="-5%" width="110%" height="110%" color-interpolation-filters="sRGB">
        <feGaussianBlur in="SourceAlpha" stdDeviation=".9" result="soft" />
        <feSpecularLighting in="soft" surfaceScale="2.4" specularConstant=".55" specularExponent="14" lighting-color="#fff" result="shine">
          <feDistantLight azimuth="225" elevation="42" />
        </feSpecularLighting>
        <feComposite in="shine" in2="SourceAlpha" operator="in" result="shineIn" />
        <feOffset in="soft" dx=".5" dy=".6" result="drop" />
        <feComposite in="SourceAlpha" in2="drop" operator="out" result="rim" />
        <feFlood flood-color="rgb(90 70 40)" flood-opacity=".22" />
        <feComposite in2="rim" operator="in" result="rimShade" />
        <feMerge><feMergeNode in="SourceGraphic" /><feMergeNode in="rimShade" /><feMergeNode in="shineIn" /></feMerge>
      </filter>
      <clipPath :id="`${id}-face`"><rect x="8" y="8" width="108" height="84" /></clipPath>
    </defs>
    <g :filter="`url(#${id}-bevel)`">
      <g :mask="`url(#${id}-perf)`">
        <rect class="margin" width="124" height="100" />
        <rect width="124" height="100" :fill="`url(#${id}-grain)`" class="margin-grain" />
      </g>
    </g>
    <g :clip-path="`url(#${id}-face)`">
      <image :href="image ?? fallbackArt" x="8" y="8" width="108" height="84" preserveAspectRatio="xMidYMid slice" />
      <!-- 印在纸上：票面也透一点纸纹，四边压一圈淡淡的油墨边。 -->
      <rect x="8" y="8" width="108" height="84" :fill="`url(#${id}-grain)`" class="face-grain" />
      <rect x="8" y="8" width="108" height="84" class="face-edge" />
      <text class="denomination" x="111" y="22" text-anchor="end">{{ face }}</text>
    </g>
  </svg>
</template>

<style scoped>
.stamp { display: block; overflow: visible; filter: drop-shadow(0 .6px .6px rgb(60 45 25 / .35)) drop-shadow(0 3px 5px rgb(40 30 15 / .14)); }
.margin { fill: #f6f1e5; }
.margin-grain { opacity: .9; mix-blend-mode: soft-light; }
.face-grain { opacity: .5; mix-blend-mode: soft-light; }
.face-edge { fill: none; stroke: rgb(50 40 25 / .28); stroke-width: .7; }
.denomination {
  font: 400 15px/1 Georgia, 'Times New Roman', 'Songti SC', serif; fill: #1b1915; letter-spacing: -.02em;
  paint-order: stroke; stroke: rgb(246 241 229 / .45); stroke-width: 1.6;
}
</style>
