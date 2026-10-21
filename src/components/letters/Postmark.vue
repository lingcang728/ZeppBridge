<script setup lang="ts">
/**
 * 邮戳（批次 6，照用户的参考照片）：几道黑色波浪线从邮票左下角掠过、大半落在信封上；
 * 给了日期就在波浪线左边再盖一枚圆戳（ZEPPBRIDGE + 这台电脑第一次收到这封信的日子）。
 * 墨色半透明、有几处没盖实，像真盖上去的。
 */
import { useId } from 'vue';

withDefaults(defineProps<{ date?: string | null; width?: number; tilt?: number }>(), { date: null, width: 96, tilt: -6 });
const id = `postmark-${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`;
/* 六道波浪线：每道五个起伏，起点和长度略错开；有圆戳时整组往右让出 64。 */
const waves = (shift: number) => [0, 1, 2, 3, 4, 5].map((i) => {
  const y = 8 + i * 8.6;
  const x = shift + 4 + ((i * 5) % 9);
  return `M${x} ${y}c5 -4 10 -4 15 0s10 4 15 0s10 -4 15 0s10 4 15 0s10 -4 ${12 + ((i * 3) % 5)} 0`;
});
</script>

<template>
  <svg class="postmark" :width="width * (date ? 164 : 100) / 100" :height="width * 60 / 100" :viewBox="`0 0 ${date ? 164 : 100} 60`"
    :style="{ rotate: `${tilt}deg` }" aria-hidden="true">
    <defs>
      <path :id="`${id}-top`" d="M7 30A24 24 0 0 1 55 30" />
      <!-- 断墨：一层细碎的遮罩，让线和字有几处没盖实。 -->
      <mask :id="`${id}-ink`">
        <rect width="164" height="60" fill="#fff" />
        <circle v-for="i in 30" :key="i" :cx="(i * 37) % 164" :cy="(i * 23) % 60" :r=".7 + (i % 3) * .45" fill="#000" opacity=".75" />
      </mask>
    </defs>
    <g :mask="`url(#${id}-ink)`">
      <template v-if="date">
        <circle cx="31" cy="30" r="27" class="ring" />
        <circle cx="31" cy="30" r="19.5" class="ring thin" />
        <text class="arc"><textPath :href="`#${id}-top`" startOffset="50%" text-anchor="middle">ZEPPBRIDGE</textPath></text>
        <text class="date" x="31" y="33.5" text-anchor="middle">{{ date }}</text>
        <circle cx="31" cy="45" r="1.3" class="dot" />
      </template>
      <path v-for="(d, i) in waves(date ? 64 : 0)" :key="i" class="wave" :d="d" />
    </g>
  </svg>
</template>

<style scoped>
.postmark { --ink: rgb(30 28 28 / .72); display: block; overflow: visible; pointer-events: none; mix-blend-mode: multiply; }
.wave { fill: none; stroke: var(--ink); stroke-width: 1.15; stroke-linecap: round; }
.ring { fill: none; stroke: var(--ink); stroke-width: 1.3; }
.ring.thin { stroke-width: .7; }
.arc { font: 700 5.6px/1 var(--font-sans); letter-spacing: .2em; fill: var(--ink); }
.date { font: 700 7.4px/1 Georgia, 'Times New Roman', serif; letter-spacing: .03em; fill: var(--ink); }
.dot { fill: var(--ink); }
</style>
