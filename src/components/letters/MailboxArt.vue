<script setup lang="ts">
/**
 * 信匣顶上的信箱（批次 6，照用户喜欢的写信应用）：路边那种圆顶信箱，侧面一面小红旗。
 * 旗子竖起来 = 有事：有新回执，或者有回信还在待寄出（真信箱也是寄信时把旗竖起来）。
 * `peek` 时箱门往外开一下再合上（点了去取信）。只动 transform。
 */
import { useId } from 'vue';

withDefaults(defineProps<{ flag?: boolean; peek?: boolean; size?: number }>(), { flag: false, peek: false, size: 120 });
const id = `mailbox-${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`;
</script>

<template>
  <svg :class="['mailbox', { 'flag-up': flag, peek }]" :width="size" :height="size" viewBox="0 0 120 120" aria-hidden="true">
    <defs>
      <linearGradient :id="`${id}-body`" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="#7f97a6" /><stop offset=".45" stop-color="#5a7384" /><stop offset="1" stop-color="#3f5462" />
      </linearGradient>
      <linearGradient :id="`${id}-door`" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stop-color="#8aa2b1" /><stop offset="1" stop-color="#4c6474" />
      </linearGradient>
      <linearGradient :id="`${id}-post`" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0" stop-color="#9c7a58" /><stop offset=".5" stop-color="#7d5e42" /><stop offset="1" stop-color="#5d4430" />
      </linearGradient>
      <linearGradient :id="`${id}-flag`" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="#d4524a" /><stop offset="1" stop-color="#9e2b25" />
      </linearGradient>
      <radialGradient :id="`${id}-ground`"><stop offset="0" stop-color="rgb(0 0 0 / .22)" /><stop offset="1" stop-color="rgb(0 0 0 / 0)" /></radialGradient>
    </defs>
    <ellipse cx="58" cy="112" rx="38" ry="5" :fill="`url(#${id}-ground)`" />
    <rect x="52" y="64" width="10" height="48" rx="2" :fill="`url(#${id}-post)`" />
    <!-- 箱身：圆顶长箱，侧面看过去。 -->
    <path d="M20 66V42a22 22 0 0 1 22-22h44a14 14 0 0 1 14 14v32Z" :fill="`url(#${id}-body)`" />
    <path d="M20 66V42a22 22 0 0 1 22-22h44a14 14 0 0 1 14 14" class="body-light" />
    <path d="M24 60h72" class="seam" />
    <!-- 箱门：正面那块圆顶门板，从底边往外翻。 -->
    <g class="door">
      <path d="M14 66V44a20 20 0 0 1 20-20h0a8 8 0 0 1 8 8v34Z" class="door-face" :fill="`url(#${id}-door)`" />
      <path d="M22 40h8" class="handle" />
    </g>
    <!-- 旗子：转轴在杆底，放倒是横着，竖起来朝上。 -->
    <g class="flag">
      <rect x="95" y="28" width="3.5" height="30" rx="1.5" class="flag-pole" />
      <path d="M98.5 28h15l-4 6 4 6h-15Z" :fill="`url(#${id}-flag)`" />
    </g>
    <circle cx="96.75" cy="56" r="2.6" class="pivot" />
  </svg>
</template>

<style scoped>
.mailbox { display: block; overflow: visible; filter: drop-shadow(0 2px 2px rgb(0 0 0 / .18)); }
.body-light { fill: none; stroke: rgb(255 255 255 / .28); stroke-width: 2; stroke-linecap: round; }
.seam { stroke: rgb(0 0 0 / .18); stroke-width: 1.4; }
.door-face { stroke: rgb(0 0 0 / .12); stroke-width: 1; }
.handle { stroke: #e9e2d2; stroke-width: 3; stroke-linecap: round; }
.pivot { fill: #3d4f5c; }
.flag-pole { fill: #a7302a; }
.door { transform-box: fill-box; transform-origin: 50% 100%; transition: transform 420ms cubic-bezier(.3, .7, .3, 1); }
.peek .door { transform: perspective(200px) rotateX(-58deg); }
/* 放倒时旗杆贴着箱身朝前横着；竖起来时转到朝上，带一点回弹。 */
.flag { transform-box: view-box; transform-origin: 96.75px 56px; transform: rotate(-90deg); transition: transform 520ms cubic-bezier(.34, 1.4, .5, 1); }
.flag-up .flag { transform: rotate(0deg); }
@media (prefers-reduced-motion: reduce) { .door, .flag { transition: none; } }
</style>
