<script setup lang="ts">
/**
 * 玻璃组合并样机（2026-11-10，计划 D2，挂在 Beta 实验室「玻璃组合并动效」开关后面，默认关）：
 * 两块挨得很近的玻璃之间长出一截「颈」，连上就是一块，掐断又是两块。
 *
 * - `connected`：连着（比如气泡开着的时候）。变真时从 `from` 那边长出来，变假时从中间掐断。
 * - `pulse`：每变一次就连一下再分开（比如刚保存了一个任务）。
 *
 * 颈本身**不带背景滤镜**：只是和玻璃同色的底 + 边，藏在两块成员的圆角底下，所以同时重建的
 * 滤镜数和以前一样（D3 要量的就是这个）。只动 transform / opacity；矩形在动之前量一次，不逐帧量。
 * 几何在 lib/glassGroup.ts 的 `bridgeRect`。减少动效时什么都不画。
 */
import { nextTick, onBeforeUnmount, ref, watch } from 'vue';
import { bridgeRect } from '../../lib/glassGroup';
import type { LensRect } from '../../lib/segmentGlass';
import { lessMotion } from '../../lib/motion/lessMotion';

const props = withDefaults(defineProps<{
  from: HTMLElement | null;
  to: HTMLElement | null;
  axis: 'x' | 'y';
  connected?: boolean;
  pulse?: number;
  /** 缝比这个宽就不连（像素，我们自己调的）。 */
  reach?: number;
}>(), { connected: false, pulse: 0, reach: 24 });

const neck = ref<HTMLElement | null>(null);
const box = ref<LensRect | null>(null);
/** 从哪一端长出来：颈的 transform-origin。 */
const origin = ref('center');
let running: Animation | null = null;

const SPRING = 'cubic-bezier(.2, .9, .25, 1.15)';
const PINCH = 'cubic-bezier(.4, 0, .7, .2)';

/** 成员相对颈的定位父元素的矩形。同一个定位父元素时用布局盒（offset*）：不算 transform，
    气泡正处在入场的位移 / 缩放起点时量出来的也是它落定后的位置。 */
const relative = (el: HTMLElement, parent: HTMLElement): LensRect => {
  if (el.offsetParent === parent) return { x: el.offsetLeft, y: el.offsetTop, w: el.offsetWidth, h: el.offsetHeight };
  const r = el.getBoundingClientRect();
  const base = parent.getBoundingClientRect();
  return { x: r.left - base.left, y: r.top - base.top, w: r.width, h: r.height };
};

/** 量一次：两块成员相对颈的定位父元素的矩形 → 颈的位置。量不到或离太远就是 null。 */
const measure = (): boolean => {
  const el = neck.value;
  const parent = el?.offsetParent as HTMLElement | null;
  if (!el || !parent || !props.from?.isConnected || !props.to?.isConnected) return false;
  const a = relative(props.from, parent);
  const b = relative(props.to, parent);
  box.value = bridgeRect(a, b, props.axis, props.reach, { max: 56 });
  const fromFirst = props.axis === 'y' ? a.y <= b.y : a.x <= b.x;
  origin.value = props.axis === 'y' ? (fromFirst ? 'center top' : 'center bottom') : (fromFirst ? 'left center' : 'right center');
  return box.value !== null;
};

const grow = (): Keyframe[] => {
  const prop = props.axis === 'y' ? 'scaleY' : 'scaleX';
  return [{ transform: `${prop}(0)`, opacity: 0.4 }, { transform: `${prop}(1)`, opacity: 1 }];
};
const pinch = (): Keyframe[] => {
  const cross = props.axis === 'y' ? 'scaleX' : 'scaleY';
  return [{ transform: `${cross}(1)`, opacity: 1 }, { transform: `${cross}(.15)`, opacity: 0 }];
};

const play = (frames: Keyframe[], duration: number, easing: string, delay = 0): Animation | null => {
  const el = neck.value;
  if (!el) return null;
  running?.cancel();
  running = el.animate(frames, { duration, easing, delay, fill: 'both' });
  return running;
};

const connect = async () => {
  if (lessMotion()) return;
  await nextTick();
  if (!measure()) return;
  play(grow(), 380, SPRING);
};

const disconnect = () => {
  if (!box.value || lessMotion()) { box.value = null; return; }
  const done = play(pinch(), 240, PINCH);
  void done?.finished.then(() => { box.value = null; }).catch(() => undefined);
};

/** 连一下再分开：长出来 → 停一拍 → 掐断。 */
const blink = async () => {
  if (lessMotion()) return;
  await nextTick();
  if (!measure()) return;
  const grown = play(grow(), 340, SPRING);
  await grown?.finished.catch(() => undefined);
  if (running !== grown) return;
  const cut = play(pinch(), 260, PINCH, 180);
  await cut?.finished.catch(() => undefined);
  if (running === cut && !props.connected) box.value = null;
};

watch(() => props.connected, (on) => { if (on) void connect(); else disconnect(); }, { immediate: true });
watch(() => props.pulse, () => { if (!props.connected) void blink(); });
onBeforeUnmount(() => running?.cancel());
</script>

<template>
  <span ref="neck" class="glass-neck" aria-hidden="true" :class="[`axis-${axis}`, { shown: box }]"
    :style="box ? { left: `${box.x}px`, top: `${box.y}px`, width: `${box.w}px`, height: `${box.h}px`, transformOrigin: origin } : undefined" />
</template>

<style scoped>
/* 和玻璃同色的底，没有 backdrop-filter；两端藏在成员底下。
   收腰的形状是静态遮罩（两侧各挖掉半个椭圆）：中间细、两头张开，像两滴水拉出来的那截。动画只动 transform / opacity。 */
.glass-neck { position: absolute; left: 0; top: 0; width: 0; height: 0; z-index: 0; pointer-events: none; visibility: hidden;
  background: var(--mat-glass); will-change: transform, opacity; }
.glass-neck.axis-y {
  -webkit-mask: radial-gradient(ellipse 50% 50% at 0 50%, transparent 98%, #000) left / 50% 100% no-repeat,
    radial-gradient(ellipse 50% 50% at 100% 50%, transparent 98%, #000) right / 50% 100% no-repeat;
  mask: radial-gradient(ellipse 50% 50% at 0 50%, transparent 98%, #000) left / 50% 100% no-repeat,
    radial-gradient(ellipse 50% 50% at 100% 50%, transparent 98%, #000) right / 50% 100% no-repeat; }
.glass-neck.axis-x {
  -webkit-mask: radial-gradient(ellipse 50% 50% at 50% 0, transparent 98%, #000) top / 100% 50% no-repeat,
    radial-gradient(ellipse 50% 50% at 50% 100%, transparent 98%, #000) bottom / 100% 50% no-repeat;
  mask: radial-gradient(ellipse 50% 50% at 50% 0, transparent 98%, #000) top / 100% 50% no-repeat,
    radial-gradient(ellipse 50% 50% at 50% 100%, transparent 98%, #000) bottom / 100% 50% no-repeat; }
.glass-neck.shown { visibility: visible; }
</style>
