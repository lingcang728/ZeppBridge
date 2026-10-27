<script setup lang="ts">
/* 年轮区块左上角：所有年份的年轮缩略（和年轮页同一块木头，lib/rings/tree.ts、wood.ts；太小了不画细木纹），正在看的那年提亮、外沿描深，旁边是各类运动的次数。
   整张卡是去 /rings 的链接，走普通的卡片形变：卡长成年轮页，年轮再从中心一圈圈长出来（TreeRings.vue）。 */
import { computed } from 'vue';
import { RouterLink } from 'vue-router';
import { bandPath, edgeSegments, treeLayout } from '../../../lib/rings/tree';
import { bandWood, barkOf, slicePath, WOOD } from '../../../lib/rings/wood';
import { useRingsText } from '../../rings/rings.i18n';
import type { RingYear } from '../../../types/rings';

const props = defineProps<{ years: RingYear[]; year: RingYear | null; legend: { key: string; label: string; count: number; text: string }[] }>();
const t = useRingsText();

const R = 100;
const layout = computed(() => treeLayout(props.years, R));
const bark = computed(() => barkOf(layout.value, 7));
const shapes = computed(() => layout.value.bands.map(band => ({
  year: band.year, on: band.year === props.year?.year, fill: bandPath(band), wood: bandWood(band, R), late: slicePath(band, 0.66, 1), edges: edgeSegments(band),
})));
</script>

<template>
  <RouterLink class="rings-card" :to="{ name: 'Rings', query: year ? { year: String(year.year) } : {} }" data-morph-card>
    <h2>{{ t.title }}</h2>
    <svg class="tree" :viewBox="`${-R - 14} ${-R - 14} ${2 * R + 28} ${2 * R + 28}`" aria-hidden="true">
      <path class="bark" :d="bark.ring" fill-rule="evenodd" />
      <g v-for="shape in shapes" :key="shape.year" :class="{ on: shape.on }">
        <path class="fill" :d="shape.fill" :fill="shape.wood" fill-rule="evenodd" />
        <path v-if="shape.on" class="lit" :d="shape.fill" fill-rule="evenodd" />
        <path class="late" :d="shape.late" fill-rule="evenodd" />
        <path v-for="(edge, i) in shape.edges" :key="i" :class="['edge', { gap: !edge.present }]" :d="edge.d" />
      </g>
      <circle r="2.2" class="pith" />
    </svg>
    <ul v-if="legend.length" class="legend">
      <li v-for="item in legend" :key="item.key">
        <span class="dot" /><span class="name">{{ item.label }}</span><b>{{ item.text }}</b>
      </li>
    </ul>
  </RouterLink>
</template>

<style scoped>
.rings-card { position: relative; display: grid; grid-template-columns: auto minmax(0, 1fr); grid-template-rows: auto 1fr; align-items: center; gap: 4px 28px; padding: 20px 24px 24px;
  border-radius: var(--radius-lg); background: var(--mat-card); box-shadow: var(--mat-rim), var(--mat-shadow); color: var(--ink); text-decoration: none; }
h2 { grid-column: 1 / -1; margin: 0; font-size: var(--fs-lg); font-weight: 600; }
.tree { width: clamp(140px, 14vw, 196px); aspect-ratio: 1; display: block; overflow: visible; }
.tree { filter: drop-shadow(0 8px 14px var(--wood-shadow)); }
.bark { fill: v-bind('WOOD.bark'); }
.edge { fill: none; stroke: v-bind('WOOD.line'); stroke-width: 1; vector-effect: non-scaling-stroke; stroke-linejoin: round; }
.edge.gap { stroke-dasharray: 2 4; }
.on .edge { stroke: v-bind('WOOD.mark'); stroke-width: 1.8; }
.lit { fill: v-bind('WOOD.selected'); }
.late { fill: v-bind('WOOD.late'); }
.pith { fill: v-bind('WOOD.pith'); }
.legend { display: grid; gap: 4px; margin: 0; padding: 0; list-style: none; }
.legend li { display: grid; grid-template-columns: 8px minmax(0, 1fr) auto; align-items: center; gap: 10px; padding: 10px 0; border-bottom: 1px solid var(--mat-line); }
.legend li:last-child { border-bottom: 0; }
.dot { width: 8px; height: 8px; border-radius: 50%; background: v-bind('WOOD.cambium'); }
.name { color: var(--muted); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.legend b { font-weight: 500; font-variant-numeric: tabular-nums; }
@media (max-width: 600px) { .rings-card { gap: 4px 16px; padding: 16px; } .tree { width: 112px; } }
</style>
