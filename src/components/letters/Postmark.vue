<script setup lang="ts">
/**
 * 邮戳（批次 6，照用户的参考照片）：只有几道黑色波浪线，从邮票左下角掠过、大半落在信封上。
 * 墨色半透明、有几处没盖实，像真盖上去的。
 */
import { useId } from 'vue';

withDefaults(defineProps<{ width?: number; tilt?: number }>(), { width: 96, tilt: -6 });
const id = `postmark-${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`;
/* 六道波浪线：每道五个起伏，起点和长度略错开。 */
const waves = [0, 1, 2, 3, 4, 5].map((i) => {
  const y = 8 + i * 8.6;
  const x = 4 + ((i * 5) % 9);
  return `M${x} ${y}c5 -4 10 -4 15 0s10 4 15 0s10 -4 15 0s10 4 15 0s10 -4 ${12 + ((i * 3) % 5)} 0`;
});
</script>

<template>
  <svg class="postmark" :width="width" :height="width * 60 / 100" viewBox="0 0 100 60" :style="{ rotate: `${tilt}deg` }" aria-hidden="true">
    <defs>
      <!-- 断墨：一层细碎的遮罩，让线有几处没盖实。 -->
      <mask :id="`${id}-ink`">
        <rect width="100" height="60" fill="#fff" />
        <circle v-for="i in 22" :key="i" :cx="(i * 37) % 100" :cy="(i * 23) % 60" :r=".7 + (i % 3) * .45" fill="#000" opacity=".75" />
      </mask>
    </defs>
    <g :mask="`url(#${id}-ink)`">
      <path v-for="(d, i) in waves" :key="i" class="wave" :d="d" />
    </g>
  </svg>
</template>

<style scoped>
.postmark { display: block; overflow: visible; pointer-events: none; mix-blend-mode: multiply; }
.wave { fill: none; stroke: rgb(30 28 28 / .72); stroke-width: 1.15; stroke-linecap: round; }
</style>
