<script setup lang="ts">
/**
 * 左上角的标志，外面套一圈静默更新的状态（用户 2026-10-14 定）：
 *
 * - 平时：就是标志本身，什么都不加；
 * - 后台下载新版本时：外圈一道进度环，下了多少走多少；拿不到总大小时是一小段弧在转，不假装百分比；
 * - 下好了：外圈一道绿环，一直轻轻发光，提醒有新版本。点标志弹出版本和「更新」按钮（AppTopBar）。
 *
 * 动效只动合成属性：光晕是一圈静态模糊的环，只循环它的透明度；转圈只转 rotate。
 * 进度环的弧长随下载变化（每多 1% 才变一次），不是逐帧动画。
 */
import { computed } from 'vue';
import BrandMark from '../BrandMark.vue';
import { downloadRatio, updateState } from '../../services/updateService';

const props = withDefaults(defineProps<{ size?: number }>(), { size: 30 });

/** 环比标志大一圈：每边留 5px，线宽 2px。 */
const box = computed(() => props.size + 10);
const radius = computed(() => box.value / 2 - 1.5);
const circumference = computed(() => 2 * Math.PI * radius.value);

const downloading = computed(() => updateState.phase === 'downloading');
const ready = computed(() => updateState.phase === 'ready' || updateState.phase === 'applying');
const ratio = computed(() => downloadRatio(updateState));
const dashOffset = computed(() => circumference.value * (1 - (ratio.value ?? 0)));
</script>

<template>
  <span :class="['brand-update', { 'is-downloading': downloading, 'is-ready': ready }]" :style="{ '--box': `${box}px` }">
    <BrandMark :size="size" />
    <svg v-if="downloading || ready" :class="['ring', { spinning: downloading && ratio === null }]" :width="box" :height="box" :viewBox="`0 0 ${box} ${box}`" aria-hidden="true">
      <template v-if="downloading">
        <circle class="track" :cx="box / 2" :cy="box / 2" :r="radius" />
        <circle v-if="ratio !== null" class="progress" :cx="box / 2" :cy="box / 2" :r="radius"
          :stroke-dasharray="circumference" :stroke-dashoffset="dashOffset" />
        <circle v-else class="progress" :cx="box / 2" :cy="box / 2" :r="radius"
          :stroke-dasharray="`${circumference * 0.22} ${circumference}`" />
      </template>
      <circle v-else class="done" :cx="box / 2" :cy="box / 2" :r="radius" />
    </svg>
    <i v-if="ready" class="glow" aria-hidden="true"></i>
  </span>
</template>

<style scoped>
.brand-update { position: relative; display: inline-grid; place-items: center; }
.ring { position: absolute; left: 50%; top: 50%; translate: -50% -50%; overflow: visible; pointer-events: none; }
.ring circle { fill: none; stroke-width: 2; }
.track { stroke: color-mix(in srgb, var(--ink) 14%, transparent); }
/* 从 12 点钟方向顺时针走。 */
.progress, .done { stroke: var(--accent); stroke-linecap: round; transform: rotate(-90deg); transform-origin: center; transform-box: fill-box; }
.progress { transition: stroke-dashoffset 400ms ease; }
.ring.spinning { animation: update-spin 1.1s linear infinite; }
/* 光晕：一圈静态模糊的绿环，只让透明度呼吸。 */
.glow {
  position: absolute; left: 50%; top: 50%; width: var(--box); height: var(--box); translate: -50% -50%;
  border-radius: 50%; box-shadow: 0 0 0 2px var(--accent), 0 0 12px 3px color-mix(in srgb, var(--accent) 70%, transparent);
  filter: blur(1.5px); pointer-events: none; opacity: .35; animation: update-glow 2.4s ease-in-out infinite;
}
@keyframes update-spin { to { rotate: 360deg; } }
@keyframes update-glow { 50% { opacity: .95; } }
@media (prefers-reduced-motion: reduce) {
  .ring.spinning { animation: none; }
  .glow { animation: none; opacity: .7; }
}
</style>
