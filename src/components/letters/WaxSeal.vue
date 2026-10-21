<script setup lang="ts">
/**
 * 封口的火漆印（批次 6；参考图里那颗真火漆：assets/letters/wax-seal.webp，带蜡面高光和压印的叶枝）。
 *
 * 交互：点一下，或者按下去随手一划（动过 8px），就裂开；键盘 Enter / 空格同样拆开（2026-10-21 用户：拆封不用长按）。
 * 怎么裂（2026-10-21 用户嫌原来两半半透明地飘走、裂缝线悬在空中）：裂缝沿着封盖的边走（火漆正压在封盖尖上，
 * 封盖边在这里是一个往下的 V）——上半块粘在封盖上，拆开时跟着封盖翻上去（EnvelopeArt 让 .wax.top 跟封盖同一个动画），
 * 下半块留在信封上。两半都不透明，各自带着自己那一侧的断口，没有单独飘着的裂缝线。
 * `still`：只是摆着看，不能按；`cracked`：画成拆过的样子（两半合着，断口可见）。
 * 只动 transform / opacity；减少动态效果时直接拆开。
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
/* 裂缝：沿封盖边的 V（120 × 120 坐标，封盖尖在中心偏下），带一点碎齿。 */
const POINTS: Array<[number, number]> = [[-2, 12], [10, 21], [18, 26], [27, 35], [34, 39], [43, 48], [50, 52], [56, 60], [61, 63],
  [66, 59], [72, 55], [79, 47], [86, 42], [94, 34], [101, 29], [110, 20], [122, 12]];
const CRACK = `M${POINTS.map(([x, y]) => `${x} ${y}`).join('L')}`;
const halves = [
  { key: 'top', clip: `${CRACK}V-2H-2Z` },
  { key: 'bottom', clip: `${CRACK}V122H-2Z` },
] as const;

const pressed = ref(false);
const broken = ref(false);
let timer: number | undefined;
let start: { x: number; y: number; id: number } | null = null;

const crack = () => {
  if (broken.value || props.still) return;
  pressed.value = false;
  broken.value = true;
  playSealCrack();
  // 断口露出来一下，再通知外面翻开封盖（上半块跟着走）：减少动态效果时立刻。
  timer = window.setTimeout(() => emit('break'), lessMotion() ? 0 : 160);
};
const down = (event: PointerEvent) => {
  if (broken.value || props.still || event.button !== 0) return;
  // 别让外面的信封把这一下当成拖着转。
  event.stopPropagation();
  (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
  start = { x: event.clientX, y: event.clientY, id: event.pointerId };
  pressed.value = true;
};
const move = (event: PointerEvent) => {
  if (!start || event.pointerId !== start.id || broken.value) return;
  if (Math.hypot(event.clientX - start.x, event.clientY - start.y) >= SNAP_PX) crack();
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
  <component :is="still ? 'span' : 'button'" :type="still ? undefined : 'button'" :class="['wax-seal', { pressed, broken: broken || cracked, still }]"
    :style="{ width: `${size}px`, height: `${size}px`, '--seal-size': `${size}px` }" :aria-label="still ? undefined : label" :aria-hidden="still || undefined"
    :disabled="still ? undefined : broken" @pointerdown="down" @pointermove="move" @pointerup="up" @pointercancel="cancel" @keydown="key">
    <svg class="defs" width="0" height="0" aria-hidden="true">
      <defs>
        <clipPath v-for="half in halves" :id="`${id}-${half.key}`" :key="half.key"><path :d="half.clip" /></clipPath>
        <!-- 断口线只画在蜡上：按蜡块图片的透明度遮住，蜡外面那截（裂缝是贯穿整个方框的折线）不露出来。 -->
        <mask :id="`${id}-wax`" class="wax-mask" maskUnits="userSpaceOnUse" x="0" y="0" width="120" height="120"><image :href="wax" width="120" height="120" /></mask>
      </defs>
    </svg>
    <svg v-for="half in halves" :key="half.key" :class="['wax', half.key]" viewBox="0 0 120 120" aria-hidden="true">
      <g :clip-path="`url(#${id}-${half.key})`">
        <image :href="wax" width="120" height="120" />
        <!-- 这一半的断口：一道暗缝、贴着一道亮边（蜡断开处的厚度），只在裂开后出现。 -->
        <g :mask="`url(#${id}-wax)`">
          <path class="edge-dark" :d="CRACK" />
          <path class="edge-light" :d="CRACK" :transform="half.key === 'top' ? 'translate(0 -1.6)' : 'translate(0 1.6)'" />
        </g>
      </g>
    </svg>
  </component>
</template>

<style scoped>
.wax-seal {
  position: relative; display: block; padding: 0; border: 0; border-radius: 50%; background: none; touch-action: none;
  /* 蜡是厚的：贴纸面一圈实的影子，再往下一层软的（火漆本身小，这两层影子很便宜）。 */
  filter: drop-shadow(0 2px 1.2px rgb(50 10 10 / .42)) drop-shadow(0 7px 8px rgb(40 15 10 / .24));
  transition: scale 140ms ease;
}
.wax-seal:not(.still):not(:disabled) { cursor: pointer; }
.wax-seal.still { cursor: default; }
.wax-seal:focus-visible { outline: 2px solid var(--focus); outline-offset: 4px; }
.wax-seal:disabled { cursor: default; }
.wax-seal.pressed { scale: .965; }
.defs { position: absolute; }
.wax-mask { mask-type: alpha; }
.wax { position: absolute; inset: 0; width: 100%; height: 100%; overflow: visible; transition: transform 160ms cubic-bezier(.3, .7, .3, 1); }
.edge-dark, .edge-light { fill: none; stroke-linejoin: round; opacity: 0; transition: opacity 90ms ease; }
.edge-dark { stroke: rgb(30 4 6 / .85); stroke-width: 2.4; }
.edge-light { stroke: rgb(255 170 150 / .4); stroke-width: 1; }
.broken .edge-dark, .broken .edge-light { opacity: 1; }
/* 裂开那一下：上半块微微翘起、下半块往下沉一点，断口张开。 */
.broken .wax.top { transform: translate(-.4px, -1.6px) rotate(-1deg); }
.broken .wax.bottom { transform: translate(.3px, 1.2px) rotate(.6deg); }
@media (prefers-reduced-motion: reduce) { .wax { transition: none; } }
</style>
