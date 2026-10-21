<script setup lang="ts">
/**
 * 封口的火漆印，刻着版本号（批次 6）。按住约 0.7 秒，或者按住往外一掰（拖出 32px），它就裂成两半掉开；
 * 键盘按 Enter / 空格同样拆开。边缘的不规则起伏由版本号做种子，同一版永远是同一枚。
 * 裂开只动 transform / opacity；减少动态效果时直接拆开，不放裂开的动画。
 */
import { computed, onBeforeUnmount, ref } from 'vue';
import { lessMotion } from '../../lib/motion/lessMotion';
import { playSealCrack } from '../../lib/letters/sound';

const props = withDefaults(defineProps<{ version: string; label: string; size?: number }>(), { size: 76 });
const emit = defineEmits<{ (event: 'break'): void }>();

const HOLD_MS = 700;
const SNAP_PX = 32;

/* 蜡的边缘：24 个点，半径在 44..48 之间起伏（视口 100 × 100）。 */
const edge = computed(() => {
  let seed = 0;
  for (const ch of props.version) seed = (seed * 31 + ch.charCodeAt(0)) >>> 0;
  const rand = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
  const points: string[] = [];
  for (let i = 0; i < 24; i += 1) {
    const a = (i / 24) * Math.PI * 2;
    const r = 44 + rand() * 4;
    points.push(`${(50 + Math.cos(a) * r).toFixed(1)},${(50 + Math.sin(a) * r).toFixed(1)}`);
  }
  return points.join(' ');
});
const [major, minor, patch] = props.version.split('.');

const holding = ref(false);
const broken = ref(false);
let timer: number | undefined;
let start: { x: number; y: number } | null = null;

const crack = () => {
  if (broken.value) return;
  window.clearTimeout(timer);
  holding.value = false;
  broken.value = true;
  playSealCrack();
  // 裂开的两半飞出去一小会儿再通知外面打开信封：减少动态效果时立刻。
  window.setTimeout(() => emit('break'), lessMotion() ? 0 : 260);
};
const down = (event: PointerEvent) => {
  if (broken.value || event.button !== 0) return;
  (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
  start = { x: event.clientX, y: event.clientY };
  holding.value = true;
  timer = window.setTimeout(crack, lessMotion() ? 0 : HOLD_MS);
};
const move = (event: PointerEvent) => {
  if (!start || broken.value) return;
  if (Math.hypot(event.clientX - start.x, event.clientY - start.y) >= SNAP_PX) crack();
};
const up = () => {
  start = null;
  if (!broken.value) { holding.value = false; window.clearTimeout(timer); }
};
const key = (event: KeyboardEvent) => {
  if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); crack(); }
};
onBeforeUnmount(() => window.clearTimeout(timer));
</script>

<template>
  <button type="button" :class="['wax-seal', { holding, broken }]" :style="{ width: `${size}px`, height: `${size}px` }"
    :aria-label="label" :disabled="broken" @pointerdown="down" @pointermove="move" @pointerup="up" @pointercancel="up" @keydown="key">
    <svg v-for="half in ['left', 'right']" :key="half" :class="['wax', half]" viewBox="0 0 100 100" aria-hidden="true">
      <defs>
        <radialGradient :id="`wax-${half}-${version}`" cx="38%" cy="32%" r="75%">
          <stop offset="0" stop-color="var(--wax-hi)" />
          <stop offset=".55" stop-color="var(--wax)" />
          <stop offset="1" stop-color="var(--wax-lo)" />
        </radialGradient>
        <clipPath :id="`wax-clip-${half}-${version}`">
          <path v-if="half === 'left'" d="M0 0H52L46 22L55 41L44 60L53 78L47 100H0Z" />
          <path v-else d="M52 0H100V100H47L53 78L44 60L55 41L46 22Z" />
        </clipPath>
      </defs>
      <g :clip-path="`url(#wax-clip-${half}-${version})`">
        <polygon :points="edge" :fill="`url(#wax-${half}-${version})`" />
        <circle cx="50" cy="50" r="31" class="rim" />
        <circle cx="50" cy="50" r="27" class="rim inner" />
        <text x="50" y="49" text-anchor="middle" class="major">{{ major }}.{{ minor }}</text>
        <text x="50" y="63" text-anchor="middle" class="patch">· {{ patch }} ·</text>
      </g>
    </svg>
    <svg class="hold-ring" viewBox="0 0 100 100" aria-hidden="true"><circle cx="50" cy="50" r="49" pathLength="1" /></svg>
  </button>
</template>

<style scoped>
.wax-seal {
  --wax: #8f1f24; --wax-hi: #c2403f; --wax-lo: #5b1015;
  position: relative; display: block; padding: 0; border: 0; border-radius: 50%; background: none; cursor: grab; touch-action: none;
  filter: drop-shadow(0 3px 4px rgb(0 0 0 / .32));
}
.wax-seal:focus-visible { outline: 2px solid var(--focus); outline-offset: 4px; }
.wax-seal:disabled { cursor: default; }
.wax { position: absolute; inset: 0; width: 100%; height: 100%; overflow: visible; transition: transform 140ms ease; }
.holding .wax { transform: scale(.96); }
.rim { fill: none; stroke: rgb(0 0 0 / .28); stroke-width: 1.6; }
.rim.inner { stroke: rgb(255 255 255 / .16); stroke-width: 1; }
.major { font: 700 19px/1 Georgia, 'Times New Roman', serif; fill: rgb(0 0 0 / .38); paint-order: stroke; stroke: rgb(255 255 255 / .12); stroke-width: .6; }
.patch { font: 700 9px/1 Georgia, serif; fill: rgb(0 0 0 / .32); letter-spacing: .08em; }
.hold-ring { position: absolute; inset: -6px; width: calc(100% + 12px); height: calc(100% + 12px); rotate: -90deg; pointer-events: none; }
.hold-ring circle { fill: none; stroke: color-mix(in srgb, var(--wax-hi) 80%, white); stroke-width: 2.5; stroke-linecap: round; stroke-dasharray: 1; stroke-dashoffset: 1; opacity: 0; }
.holding .hold-ring circle { opacity: .9; stroke-dashoffset: 0; transition: stroke-dashoffset 700ms linear, opacity 120ms ease; }
.broken .hold-ring { display: none; }
.broken .wax.left { animation: wax-fall-left 620ms cubic-bezier(.3, .6, .4, 1) forwards; }
.broken .wax.right { animation: wax-fall-right 620ms cubic-bezier(.3, .6, .4, 1) forwards; }
@keyframes wax-fall-left { to { transform: translate(-22px, 26px) rotate(-28deg); opacity: 0; } }
@keyframes wax-fall-right { to { transform: translate(20px, 30px) rotate(24deg); opacity: 0; } }
@media (prefers-reduced-motion: reduce) {
  .broken .wax.left, .broken .wax.right { animation: none; opacity: 0; }
  .holding .hold-ring circle { transition: none; }
}
:root[data-effects='lite'] .broken .wax { animation: none; opacity: 0; }
</style>
