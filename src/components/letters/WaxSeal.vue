<script setup lang="ts">
/**
 * 封口的火漆印（批次 6；2026-10-21 用户嫌矢量画的像橡皮泥、没有庄重感，改用参考图里那颗真火漆：
 * assets/letters/wax-seal.webp，从用户给的参考图抠出来、摆正，带蜡面的高光和压印的叶枝）。
 *
 * 交互：按住约 0.7 秒，或者按住往外一掰（拖出 32px），它沿一道裂缝分成两半掉开；键盘 Enter / 空格同样拆开。
 * `still`：只是摆着看（信匣里的信封），不能按；`cracked` 画一道裂痕表示拆过了。
 * 裂开只动 transform / opacity；减少动态效果时直接拆开。
 */
import { onBeforeUnmount, ref, useId } from 'vue';
import { lessMotion } from '../../lib/motion/lessMotion';
import { playSealCrack } from '../../lib/letters/sound';
import wax from '../../assets/letters/wax-seal.webp';

const props = withDefaults(defineProps<{ label?: string; size?: number; still?: boolean; cracked?: boolean }>(),
  { label: '', size: 84, still: false, cracked: false });
const emit = defineEmits<{ (event: 'break'): void }>();

const HOLD_MS = 700;
const SNAP_PX = 32;
const id = `seal-${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`;
/* 裂缝从上沿斜着穿过印面到下沿（120 × 120 坐标）。 */
const CRACK = 'M66 6L59 22L67 37L56 55L65 71L57 89L63 114';
const halves = [
  { key: 'left', clip: 'M0 0H66L59 22L67 37L56 55L65 71L57 89L63 114L63 120H0Z' },
  { key: 'right', clip: 'M66 0H120V120H63L63 114L57 89L65 71L56 55L67 37L59 22Z' },
] as const;

const holding = ref(false);
const broken = ref(false);
let timer: number | undefined;
let start: { x: number; y: number } | null = null;

const crack = () => {
  if (broken.value || props.still) return;
  window.clearTimeout(timer);
  holding.value = false;
  broken.value = true;
  playSealCrack();
  // 两半掉开一小会儿再通知外面打开信封：减少动态效果时立刻。
  window.setTimeout(() => emit('break'), lessMotion() ? 0 : 280);
};
const down = (event: PointerEvent) => {
  if (broken.value || props.still || event.button !== 0) return;
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
  <component :is="still ? 'span' : 'button'" :type="still ? undefined : 'button'" :class="['wax-seal', { holding, broken, still }]"
    :style="{ width: `${size}px`, height: `${size}px` }" :aria-label="still ? undefined : label" :aria-hidden="still || undefined"
    :disabled="still ? undefined : broken" @pointerdown="down" @pointermove="move" @pointerup="up" @pointercancel="up" @keydown="key">
    <svg class="defs" width="0" height="0" aria-hidden="true">
      <defs>
        <clipPath v-for="half in halves" :id="`${id}-${half.key}`" :key="half.key"><path :d="half.clip" /></clipPath>
      </defs>
    </svg>
    <svg v-for="half in halves" :key="half.key" :class="['wax', half.key]" viewBox="0 0 120 120" aria-hidden="true">
      <image :href="wax" width="120" height="120" :clip-path="`url(#${id}-${half.key})`" />
    </svg>
    <!-- 拆过的：一道细裂缝，暗线下面衬一道亮边，像蜡真的断开过。 -->
    <svg v-if="cracked || holding" :class="['crack', { growing: holding }]" viewBox="0 0 120 120" aria-hidden="true">
      <path class="crack-light" :d="CRACK" transform="translate(.8 .6)" pathLength="1" />
      <path class="crack-dark" :d="CRACK" pathLength="1" />
    </svg>
    <svg v-if="!still" class="hold-ring" viewBox="0 0 100 100" aria-hidden="true"><circle cx="50" cy="50" r="49" pathLength="1" /></svg>
  </component>
</template>

<style scoped>
.wax-seal {
  position: relative; display: block; padding: 0; border: 0; border-radius: 50%; background: none; cursor: grab; touch-action: none;
  /* 蜡是厚的：贴纸面一圈实的影子，再往下一层软的。 */
  filter: drop-shadow(1.2px 2px 1.2px rgb(50 10 10 / .42)) drop-shadow(4px 8px 9px rgb(40 15 10 / .26));
}
.wax-seal.still { cursor: default; }
.wax-seal:focus-visible { outline: 2px solid var(--focus); outline-offset: 4px; }
.wax-seal:disabled { cursor: default; }
.defs { position: absolute; }
.wax { position: absolute; inset: 0; width: 100%; height: 100%; overflow: visible; transition: transform 140ms ease; }
.holding .wax { transform: scale(.965); }
.crack { position: absolute; inset: 0; width: 100%; height: 100%; }
.crack path { fill: none; stroke-linejoin: round; stroke-linecap: round; }
.crack-dark { stroke: rgb(35 4 6 / .78); stroke-width: 1.3; }
.crack-light { stroke: rgb(255 190 175 / .35); stroke-width: .9; }
/* 按住时裂纹从上沿往下沿着印面慢慢长出来，长满就裂开（和 HOLD_MS 一样长）。 */
.crack.growing path { stroke-dasharray: 1; stroke-dashoffset: 1; animation: crack-grow 700ms cubic-bezier(.5, 0, .9, .6) forwards; }
@keyframes crack-grow { to { stroke-dashoffset: 0; } }
.hold-ring { position: absolute; inset: -6px; width: calc(100% + 12px); height: calc(100% + 12px); rotate: -90deg; pointer-events: none; }
.hold-ring circle { fill: none; stroke: rgb(255 236 228 / .85); stroke-width: 2.5; stroke-linecap: round; stroke-dasharray: 1; stroke-dashoffset: 1; opacity: 0; }
.holding .hold-ring circle { opacity: .9; stroke-dashoffset: 0; transition: stroke-dashoffset 700ms linear, opacity 120ms ease; }
.broken .hold-ring { display: none; }
.broken .wax.left { animation: wax-fall-left 640ms cubic-bezier(.3, .6, .4, 1) forwards; }
.broken .wax.right { animation: wax-fall-right 640ms cubic-bezier(.3, .6, .4, 1) forwards; }
@keyframes wax-fall-left { to { transform: translate(-24px, 30px) rotate(-26deg); opacity: 0; } }
@keyframes wax-fall-right { to { transform: translate(22px, 34px) rotate(22deg); opacity: 0; } }
@media (prefers-reduced-motion: reduce) {
  .broken .wax.left, .broken .wax.right { animation: none; opacity: 0; }
  .holding .hold-ring circle { transition: none; }
}
:root[data-effects='lite'] .broken .wax { animation: none; opacity: 0; }
</style>
