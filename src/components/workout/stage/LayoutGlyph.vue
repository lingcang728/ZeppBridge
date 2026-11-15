<script setup lang="ts">
/**
 * 舞台菜单里布局档的象形图（2026-11-15 用户：照 ColorOS 文件夹 / Windows 贴靠布局那样用格子表示，
 * 不写「主卡在左」「上一下三」这种字——字在长语言里放不下，三档挤成一团叠在一起）。
 *
 * 外框是舞台，里面的格子按 lib/stage/layout.ts 的真实比例画；颜色跟 currentColor，
 * 所以分段控件的普通层是灰、滑块下面的选中层是品牌色，不用另写选中样式。
 */
import { computed } from 'vue';

/** 每格 [x, y, w, h]，都是舞台的几成（0–1）。 */
export type GlyphCell = readonly [number, number, number, number];

const props = defineProps<{ cells: readonly GlyphCell[] }>();

const W = 30;
const H = 20;
/** 外框到格子、格子之间的空隙。 */
const PAD = 2.5;
const GAP = 1.5;
const rects = computed(() => props.cells.map(([x, y, w, h]) => {
  const iw = W - PAD * 2 + GAP;
  const ih = H - PAD * 2 + GAP;
  return { x: PAD + x * iw, y: PAD + y * ih, w: w * iw - GAP, h: h * ih - GAP };
}));
</script>

<template>
  <svg class="layout-glyph" :viewBox="`0 0 ${W} ${H}`" :width="W" :height="H" aria-hidden="true" focusable="false">
    <rect class="glyph-frame" x=".75" y=".75" :width="W - 1.5" :height="H - 1.5" rx="4" />
    <rect v-for="(r, i) in rects" :key="i" class="glyph-cell" :x="r.x" :y="r.y" :width="r.w" :height="r.h" rx="1.4" />
  </svg>
</template>

<style scoped>
.layout-glyph { display: block; flex: none; }
.glyph-frame { fill: none; stroke: currentColor; stroke-width: 1.5; opacity: .55; }
.glyph-cell { fill: currentColor; }
</style>
