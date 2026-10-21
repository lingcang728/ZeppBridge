<script setup lang="ts">
/**
 * 邮戳（批次 6，照用户的参考图）：圆戳盖在邮票左边的信封上，几道波浪线从圆戳往右掠过票面左半边。
 * 圆戳上沿是 ZEPPBRIDGE，中间是这台电脑第一次收到这封信的日子（services/letters.ts 的 receivedOn）。
 * 墨色半透明、边缘有点断续，像真盖上去的。
 */
import { useId } from 'vue';

withDefaults(defineProps<{ date: string; width?: number; tilt?: number }>(), { width: 150, tilt: -8 });
const id = `postmark-${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`;
/* 五道波浪线：从圆戳右边起，四个起伏，起点略错开。 */
const waves = [0, 1, 2, 3, 4].map((i) => {
  const y = 22 + i * 9;
  return `M${70 + (i % 3) * 3} ${y}c6 -5 12 -5 18 0s12 5 18 0s12 -5 18 0s12 5 ${14 - (i % 2) * 6} 0`;
});
</script>

<template>
  <svg class="postmark" :width="width" :height="width * 80 / 150" viewBox="0 0 150 80" :style="{ rotate: `${tilt}deg` }" aria-hidden="true">
    <defs>
      <path :id="`${id}-top`" d="M10 40A26 26 0 0 1 62 40" />
      <!-- 断墨：一层细碎的遮罩，让线和字有几处没盖实。 -->
      <mask :id="`${id}-ink`">
        <rect width="150" height="80" fill="#fff" />
        <circle v-for="i in 18" :key="i" :cx="(i * 37) % 150" :cy="(i * 23) % 80" :r="1 + (i % 3) * .6" fill="#000" opacity=".7" />
      </mask>
    </defs>
    <g :mask="`url(#${id}-ink)`">
      <path v-for="(d, i) in waves" :key="i" class="wave" :d="d" />
      <circle cx="36" cy="40" r="30" class="ring" />
      <circle cx="36" cy="40" r="22.5" class="ring thin" />
      <text class="arc"><textPath :href="`#${id}-top`" startOffset="50%" text-anchor="middle">ZEPPBRIDGE</textPath></text>
      <text class="date" x="36" y="44" text-anchor="middle">{{ date }}</text>
      <circle cx="36" cy="57" r="1.5" class="dot" />
    </g>
  </svg>
</template>

<style scoped>
.postmark { --ink: rgb(28 26 28 / .74); display: block; overflow: visible; pointer-events: none; mix-blend-mode: multiply; }
.wave { fill: none; stroke: var(--ink); stroke-width: 1.5; stroke-linecap: round; }
.ring { fill: none; stroke: var(--ink); stroke-width: 1.6; }
.ring.thin { stroke-width: .8; }
.arc { font: 700 6.4px/1 var(--font-sans); letter-spacing: .22em; fill: var(--ink); }
.date { font: 700 8.4px/1 Georgia, 'Times New Roman', serif; letter-spacing: .04em; fill: var(--ink); }
.dot { fill: var(--ink); }
</style>
