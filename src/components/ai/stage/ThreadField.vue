<script setup lang="ts">
/**
 * 舞台中间的线（2026-10-08）：门锁散出去的思维树（左）和一束干净的平行线（右），算法在 lib/aiTask/threads.ts。
 * 静止时是静态 SVG，整张只有一个很慢的不透明度呼吸（动在 <svg> 自己身上，上合成器）；
 * 汇聚时 `lit` 里的那几根依次亮起来。不接收指针。
 */
import { computed } from 'vue';
import { pathD, type ThreadTree } from '../../../lib/aiTask/threads';

const props = defineProps<{ tree: ThreadTree | null; width: number; height: number; lit: boolean; active?: string | null }>();
const trunks = computed(() => props.tree?.trunks.map((q) => pathD([q])) ?? []);
const strands = computed(() => props.tree?.strands.map((s, i) => ({ id: s.id, d: pathD([s.branch]), i })) ?? []);
const noise = computed(() => props.tree?.noise.map((n, i) => ({ id: n.id, d: pathD([n.path]), i })) ?? []);
const right = computed(() => props.tree?.right.map((q) => pathD([q])) ?? []);
</script>

<template>
  <svg :class="['threads', { lit }]" :viewBox="`0 0 ${width} ${height}`" :width="width" :height="height" aria-hidden="true">
    <defs>
      <linearGradient id="thread-fade" x1="0" x2="1" y1="0" y2="0">
        <stop offset="0" stop-color="var(--ink)" stop-opacity=".05" />
        <stop offset="1" stop-color="var(--ink)" stop-opacity=".5" />
      </linearGradient>
    </defs>
    <g class="noise">
      <path v-for="n in noise" :key="`n${n.i}`" :d="n.d" :class="{ hot: active === n.id }" :style="{ '--i': n.i }" />
    </g>
    <g class="tree">
      <path v-for="(d, i) in trunks" :key="`t${i}`" :d="d" class="trunk" />
      <path v-for="s in strands" :key="s.id" :d="s.d" :class="['branch', { hot: active === s.id }]" :style="{ '--i': s.i }" />
    </g>
    <g class="right">
      <path v-for="(d, i) in right" :key="`r${i}`" :d="d" :style="{ '--i': i }" />
    </g>
  </svg>
</template>

<style scoped>
.threads { position: absolute; inset: 0; overflow: visible; pointer-events: none; animation: breathe 9s ease-in-out infinite alternate; }
.threads path { fill: none; stroke-linecap: round; transition: opacity 260ms ease, stroke 260ms ease; }
.noise path { stroke: var(--ink); stroke-width: .7; opacity: .07; }
.trunk { stroke: url(#thread-fade); stroke-width: 1.4; opacity: .8; }
.branch { stroke: var(--ink); stroke-width: .9; opacity: .2; }
.right path { stroke: var(--accent); stroke-width: 1; opacity: .34; }
.branch.hot, .noise path.hot { stroke: var(--accent); opacity: .6; }
/* 汇聚：枝和杂线依次亮起，右边那束也亮一点。 */
.threads.lit .branch { stroke: var(--accent); opacity: .7; transition-delay: calc(var(--i) * 45ms); }
.threads.lit .noise path { stroke: var(--accent); opacity: .22; transition-delay: calc(var(--i) * 25ms); }
.threads.lit .right path { opacity: .7; }
@keyframes breathe { from { opacity: .75; } to { opacity: 1; } }
@media (prefers-reduced-motion: reduce) { .threads { animation: none; } .threads path { transition: none; } }
</style>
