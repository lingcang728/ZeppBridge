<script setup lang="ts">
/**
 * 封口的火漆印（批次 6；2026-10-21 用户嫌矢量画的像橡皮泥、没有庄重感，改用参考图里那颗真火漆：
 * assets/letters/wax-seal.webp，从用户给的参考图抠出来、摆正，带蜡面的高光和压印的叶枝）。
 *
 * 交互：点一下，或者按下去随手一划（动过 8px），裂缝一下子长满，两半往划的方向掉开；键盘 Enter / 空格同样拆开。
 * （2026-10-21 用户：拆封不用长按，鼠标按住随便划一下就该开了。原先的按住 0.7 秒 / 掰出 32px 都去掉。）
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

const SNAP_PX = 8;
const id = `seal-${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`;
/* 裂缝从上沿斜着穿过印面到下沿（120 × 120 坐标）。 */
const CRACK = 'M66 6L59 22L67 37L56 55L65 71L57 89L63 114';
const halves = [
  { key: 'left', clip: 'M0 0H66L59 22L67 37L56 55L65 71L57 89L63 114L63 120H0Z' },
  { key: 'right', clip: 'M66 0H120V120H63L63 114L57 89L65 71L56 55L67 37L59 22Z' },
] as const;

const pressed = ref(false);
const broken = ref(false);
/* 两半往哪边掉：跟着划的方向（-1 往左偏、1 往右偏），点一下就各往两边。 */
const lean = ref(0);
let timer: number | undefined;
let start: { x: number; y: number; id: number } | null = null;

const crack = () => {
  if (broken.value || props.still) return;
  pressed.value = false;
  broken.value = true;
  playSealCrack();
  // 裂缝长满、两半掉开一小会儿再通知外面打开信封：减少动态效果时立刻。
  timer = window.setTimeout(() => emit('break'), lessMotion() ? 0 : 300);
};
const down = (event: PointerEvent) => {
  if (broken.value || props.still || event.button !== 0) return;
  (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
  start = { x: event.clientX, y: event.clientY, id: event.pointerId };
  pressed.value = true;
};
const move = (event: PointerEvent) => {
  if (!start || event.pointerId !== start.id || broken.value) return;
  const dx = event.clientX - start.x;
  if (Math.hypot(dx, event.clientY - start.y) < SNAP_PX) return;
  lean.value = Math.sign(dx);
  crack();
};
/* 没划、只是点了一下：松手就开。 */
const up = (event: PointerEvent) => {
  if (start && event.pointerId === start.id && !broken.value) crack();
  start = null;
  pressed.value = false;
};
const cancel = () => { start = null; pressed.value = false; };
const key = (event: KeyboardEvent) => {
  if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); crack(); }
};
onBeforeUnmount(() => window.clearTimeout(timer));
</script>

<template>
  <component :is="still ? 'span' : 'button'" :type="still ? undefined : 'button'" :class="['wax-seal', { pressed, broken, still }]"
    :style="{ width: `${size}px`, height: `${size}px`, '--lean': lean }" :aria-label="still ? undefined : label" :aria-hidden="still || undefined"
    :disabled="still ? undefined : broken" @pointerdown="down" @pointermove="move" @pointerup="up" @pointercancel="cancel" @keydown="key">
    <svg class="defs" width="0" height="0" aria-hidden="true">
      <defs>
        <clipPath v-for="half in halves" :id="`${id}-${half.key}`" :key="half.key"><path :d="half.clip" /></clipPath>
      </defs>
    </svg>
    <svg v-for="half in halves" :key="half.key" :class="['wax', half.key]" viewBox="0 0 120 120" aria-hidden="true">
      <image :href="wax" width="120" height="120" :clip-path="`url(#${id}-${half.key})`" />
    </svg>
    <!-- 拆过的：一道细裂缝，暗线下面衬一道亮边，像蜡真的断开过。 -->
    <svg v-if="cracked || broken" :class="['crack', { growing: broken }]" viewBox="0 0 120 120" aria-hidden="true">
      <path class="crack-light" :d="CRACK" transform="translate(.8 .6)" pathLength="1" />
      <path class="crack-dark" :d="CRACK" pathLength="1" />
    </svg>
  </component>
</template>

<style scoped>
.wax-seal {
  position: relative; display: block; padding: 0; border: 0; border-radius: 50%; background: none; cursor: grab; touch-action: none;
  /* 蜡是厚的：贴纸面一圈实的影子，再往下一层软的。 */
  filter: drop-shadow(1.2px 2px 1.2px rgb(50 10 10 / .42)) drop-shadow(4px 8px 9px rgb(40 15 10 / .26));
}
.wax-seal.still { cursor: default; }
.wax-seal:not(.still):not(:disabled) { cursor: pointer; }
.wax-seal:focus-visible { outline: 2px solid var(--focus); outline-offset: 4px; }
.wax-seal:disabled { cursor: default; }
.defs { position: absolute; }
.wax { position: absolute; inset: 0; width: 100%; height: 100%; overflow: visible; transition: transform 140ms ease; }
.pressed .wax { transform: scale(.965); }
.crack { position: absolute; inset: 0; width: 100%; height: 100%; }
.crack path { fill: none; stroke-linejoin: round; stroke-linecap: round; }
.crack-dark { stroke: rgb(35 4 6 / .78); stroke-width: 1.3; }
.crack-light { stroke: rgb(255 190 175 / .35); stroke-width: .9; }
/* 裂开那一下：裂纹从上沿一口气长到下沿（130ms），两半接着往两边掉——往划的方向多偏一点。 */
.crack.growing { animation: crack-fade 640ms 120ms ease forwards; }
.crack.growing path { stroke-dasharray: 1; stroke-dashoffset: 1; animation: crack-grow 130ms cubic-bezier(.3, 0, .6, 1) forwards; }
@keyframes crack-grow { to { stroke-dashoffset: 0; } }
@keyframes crack-fade { to { opacity: 0; } }
.broken .wax.left { animation: wax-fall-left 620ms 90ms cubic-bezier(.3, .6, .4, 1) forwards; }
.broken .wax.right { animation: wax-fall-right 620ms 90ms cubic-bezier(.3, .6, .4, 1) forwards; }
@keyframes wax-fall-left { to { transform: translate(calc(-24px + var(--lean) * 14px), 30px) rotate(-26deg); opacity: 0; } }
@keyframes wax-fall-right { to { transform: translate(calc(22px + var(--lean) * 14px), 34px) rotate(22deg); opacity: 0; } }
@media (prefers-reduced-motion: reduce) {
  .broken .wax.left, .broken .wax.right, .crack.growing { animation: none; opacity: 0; }
}
:root[data-effects='lite'] .broken .wax { animation: none; opacity: 0; }
</style>
