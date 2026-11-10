<script setup lang="ts">
/**
 * 左上角的标志，外面套一圈静默更新的状态（用户 2026-10-14 定）：
 *
 * - 平时：就是标志本身，什么都不加；
 * - 后台下载新版本时：外圈一道进度环，下了多少走多少；拿不到总大小时是一小段弧在转，不假装百分比；
 * - 下好了：外圈一道绿环，一直轻轻发光。点标志直接安装并重启；说明在重启后居中显示。
 *
 * 有新来信时（用户 2026-11-10 定）：Z 缩成信封封口上的火漆，信封从它身后长出来；看完原路变回 Z。
 * 标志是图片不能变形，所以信封是另画的一层（内联 SVG），两层各自只动 scale / translate / opacity，
 * 播一次停住、不循环；减少动态效果时直接换。更新的环照旧套在最外圈。
 *
 * 动效只动合成属性：光晕是一圈静态模糊的环，只循环它的透明度；转圈只转 rotate。
 * 进度环的弧长随下载变化（每多 1% 才变一次），不是逐帧动画。
 */
import { computed } from 'vue';
import BrandMark from '../BrandMark.vue';
import { downloadRatio, updateState } from '../../services/updateService';

const props = withDefaults(defineProps<{ size?: number; mail?: boolean }>(), { size: 30, mail: false });

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
  <span :class="['brand-update', { 'is-downloading': downloading, 'is-ready': ready, 'has-mail': mail }]" :style="{ '--box': `${box}px`, '--size': `${size}px` }">
    <!-- 信封：比标志略宽，封口是一个 V，正中压一枚火漆（Z 缩小后落在它上面）。 -->
    <svg class="envelope" :width="size + 6" :height="size - 4" viewBox="0 0 36 26" aria-hidden="true">
      <rect class="paper" x="1" y="1" width="34" height="24" rx="3.5" />
      <path class="fold" d="M1.8 22.6 13.6 13.2M34.2 22.6 22.4 13.2" />
      <path class="flap" d="M1.6 3.2 18 15.4 34.4 3.2" />
      <circle class="wax" cx="18" cy="15" r="6.6" />
    </svg>
    <span class="mark"><BrandMark :size="size" /></span>
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
.brand-update > * { grid-area: 1 / 1; }
.mark { display: block; line-height: 0; }

/* 信封和 Z 的交接：Z 往封口中心缩，信封从那一点长出来；收回时反过来。iOS 节奏，约半秒。 */
.mark { transition: scale 460ms cubic-bezier(.3, 1.25, .5, 1), translate 460ms cubic-bezier(.3, 1.25, .5, 1); }
.envelope {
  overflow: visible; pointer-events: none; opacity: 0; scale: .35; translate: 0 3px; transform-origin: 50% 58%;
  transition: opacity 220ms ease 60ms, scale 480ms cubic-bezier(.2, 1.2, .4, 1) 40ms, translate 480ms cubic-bezier(.2, 1.2, .4, 1) 40ms;
}
.has-mail .envelope { opacity: 1; scale: 1; translate: 0 0; }
/* 火漆在信封 viewBox（36×26）的 (18, 15)，比中心低 2 个单位；信封高 size-4、居中放。 */
.has-mail .mark { scale: .4; translate: 0 calc((var(--size) - 4px) * 2 / 26); }
.brand-update:not(.has-mail) .envelope { transition: opacity 160ms ease 200ms, scale 320ms ease-in, translate 320ms ease-in; }
.paper { fill: #f3e9d6; stroke: color-mix(in srgb, #6b5536 55%, transparent); stroke-width: 1.2; }
.flap, .fold { fill: none; stroke: color-mix(in srgb, #6b5536 60%, transparent); stroke-width: 1.2; stroke-linejoin: round; stroke-linecap: round; }
.fold { stroke-width: .9; opacity: .7; }
.wax { fill: #a82c24; }

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
  .mark, .envelope, .brand-update:not(.has-mail) .envelope { transition: none; }
}
</style>
