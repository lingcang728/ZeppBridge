<script setup lang="ts">
/**
 * 一沓信纸，一次读最上面那张（批次 6；2026-10-21 用户：翻页别把纸飞走，要像读真信——读完一张叠到最后）。
 *
 * 整沓按「离最上面几张」排：最上面那张正着放，下面两张各错开一点、转一点角，露出纸边；更深的和第三张叠在一起。
 * 往后翻：最上面那张往左抽出来一截（转一点角），过了一半落到整沓底下，再推回去对齐——下一张本来就在下面，自然露出来。
 * 往前翻：最底下那张从左边抽出来，盖到最上面。读完最后一张往前翻，顺序也还是对的（整沓是一个圈）。
 * 可以拖着最上面那张往左抽，松手过 70px 或甩得够快就翻，不够就弹回；往右拖翻回上一张。
 *
 * 只动 transform / opacity（层次靠 WAAPI 的 z-index 离散关键帧在抽出最远处换）。减少动态效果时交叉淡入。
 * 只有最上面那张能交互，别的 inert（读屏也只念它）。正文只画最上面、紧挨着的上下各一张和正在动的那张（`live`），
 * 其余是空白的纸——新挂上去的正文等翻完再画，翻页那一帧不排版。
 */
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue';
import { lessMotion } from '../../lib/motion/lessMotion';
import { playPaperSlide } from '../../lib/letters/sound';

const props = defineProps<{ count: number; index: number }>();
const emit = defineEmits<{ (event: 'update:index', index: number): void }>();

const root = ref<HTMLElement | null>(null);
const leaves = ref<HTMLElement[]>([]);
const drag = ref(0);
const dragging = ref(false);
let start: { x: number; y: number; id: number; t: number } | null = null;
let horizontal = false;

/* 每一层的摆法：0 最上面，1、2 往下错开；更深的都摆成 2。 */
const POSE = ['translate(0px, 0px) rotate(0deg)', 'translate(4px, 5px) rotate(.8deg)', 'translate(-5px, 9px) rotate(-1deg)'];
/* 抽出来最远的位置：往左一截、往上一点、转一点角。 */
const OUT = 'translate(-58%, -2%) rotate(-6deg)';
const TURN_MS = 760;

const depth = (i: number) => (i - props.index + props.count) % props.count;
const pose = (i: number) => POSE[Math.min(depth(i), 2)]!;

/** 正在翻的那张（翻完才清掉）；它的正文要一直在。 */
const moving = ref<number | null>(null);
/** 已经画了正文的几张：翻页那一刻先不加新的，翻完再补上下一张 / 上一张。 */
const settled = ref(props.index);
const live = (i: number) => i === props.index || i === moving.value || Math.abs(i - settled.value) <= 1;
let settleTimer: number | undefined;
onBeforeUnmount(() => window.clearTimeout(settleTimer));

/* 动的那张：往后翻是原来最上面那张（落到最底下），往前翻是最底下那张（盖到最上面）。起止各按它前后的层摆。 */
const turn = async (mover: number, forward: boolean, startPose: string) => {
  const leaf = leaves.value[mover];
  moving.value = mover;
  await nextTick();
  const endPose = pose(mover);
  if (leaf && !lessMotion()) {
    const top = String(props.count + 2);
    const bottom = '0';
    const frames: Keyframe[] = forward
      ? [
        { transform: startPose, zIndex: top, easing: 'cubic-bezier(.3, .6, .4, 1)' },
        { transform: OUT, zIndex: top, offset: .46 },
        { transform: OUT, zIndex: bottom, offset: .47, easing: 'cubic-bezier(.35, 0, .2, 1)' },
        { transform: endPose, zIndex: bottom },
      ]
      : [
        { transform: startPose, zIndex: bottom, easing: 'cubic-bezier(.3, .6, .4, 1)' },
        { transform: OUT, zIndex: bottom, offset: .46 },
        { transform: OUT, zIndex: top, offset: .47, easing: 'cubic-bezier(.35, 0, .2, 1)' },
        { transform: endPose, zIndex: top },
      ];
    await leaf.animate(frames, { duration: TURN_MS }).finished.catch(() => undefined);
  }
  if (moving.value === mover) moving.value = null;
  window.clearTimeout(settleTimer);
  settleTimer = window.setTimeout(() => { settled.value = props.index; }, 60);
};

const go = (next: number, startTransform?: string) => {
  if (next < 0 || next >= props.count || next === props.index) return;
  const forward = next > props.index;
  const mover = forward ? props.index : next;
  const startPose = forward ? startTransform ?? pose(mover) : pose(mover);
  playPaperSlide();
  emit('update:index', next);
  void turn(mover, forward, startPose);
};
defineExpose({ go });
watch(() => props.count, () => { settled.value = props.index; });

const down = (event: PointerEvent) => {
  const target = event.target as HTMLElement;
  if (event.button !== 0 || moving.value !== null || target.closest('textarea, input, button, a, label, select')) return;
  start = { x: event.clientX, y: event.clientY, id: event.pointerId, t: performance.now() };
  horizontal = false;
};
const move = (event: PointerEvent) => {
  if (!start || event.pointerId !== start.id) return;
  const dx = event.clientX - start.x;
  const dy = event.clientY - start.y;
  if (!horizontal && Math.abs(dx) > 8 && Math.abs(dx) > Math.abs(dy) * 1.4) {
    horizontal = true;
    dragging.value = true;
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
  }
  if (!horizontal) return;
  // 往左抽：跟手；往右（翻回上一页）和最后一页往左：只给一点阻尼。
  const edge = dx < 0 && props.index === props.count - 1;
  drag.value = dx > 0 ? dx * 0.3 : edge ? dx * 0.18 : dx;
};
const up = (event: PointerEvent) => {
  if (horizontal && start) {
    const speed = (event.clientX - start.x) / Math.max(1, performance.now() - start.t);
    const held = dragTransform.value;
    if ((drag.value < -70 || speed < -0.6) && props.index < props.count - 1) go(props.index + 1, held);
    else if ((drag.value > 20 || speed > 0.6) && props.index > 0) go(props.index - 1);
    event.preventDefault();
  }
  start = null;
  horizontal = false;
  dragging.value = false;
  drag.value = 0;
};

const fade = computed(() => lessMotion());
const dragTransform = computed(() => {
  const width = root.value?.clientWidth || 640;
  return `translate(${drag.value}px, ${Math.min(0, drag.value) * 0.02}px) rotate(${(drag.value / width) * 10}deg)`;
});
const leafStyle = (i: number) => {
  if (fade.value) return undefined;
  const d = depth(i);
  const style: Record<string, string> = { zIndex: String(props.count - d) };
  style.transform = d === 0 && drag.value ? dragTransform.value : pose(i);
  if (d === 0 && drag.value) style.transition = 'none';
  if (i === moving.value) style.transition = 'none';
  return style;
};
</script>

<template>
  <div ref="root" :class="['letter-pad', { 'is-fading': fade, dragging }]" @pointerdown="down" @pointermove="move" @pointerup="up" @pointercancel="up">
    <div v-for="i in count" :key="i - 1" :ref="(el) => { if (el) leaves[i - 1] = el as HTMLElement; }"
      :class="['leaf', { current: i - 1 === index, deep: depth(i - 1) > 2 && i - 1 !== moving }]" :style="leafStyle(i - 1)"
      :inert="i - 1 !== index || undefined" :aria-hidden="i - 1 !== index || undefined">
      <slot name="page" :i="i - 1" :active="i - 1 === index" :live="live(i - 1)" />
    </div>
  </div>
</template>

<style scoped>
.letter-pad {
  position: relative; width: min(640px, calc(100vw / var(--ui-scale, 1) - 32px)); height: min(740px, calc(100vh / var(--ui-scale, 1) - 150px));
  touch-action: pan-y; user-select: none;
}
.leaf { position: absolute; inset: 0; transform-origin: 50% 60%; transition: transform 480ms cubic-bezier(.3, .7, .25, 1); }
.leaf > :deep(*) { height: 100%; }
/* 第三张以下和第三张叠在一起，看不见，省得每张都画一层投影。 */
.leaf.deep { visibility: hidden; }
/* 下面的纸：一层淡淡的影子，翻上来时退掉。 */
.leaf:not(.current)::after {
  content: ''; position: absolute; inset: 0; border-radius: 3px; pointer-events: none;
  background: linear-gradient(100deg, rgb(0 0 0 / .08), rgb(0 0 0 / .02) 60%, transparent);
}
/* 拖着抽出来时影子更深。 */
.dragging .leaf.current > :deep(.paper) { box-shadow: 0 34px 60px -24px rgb(0 0 0 / .6), 0 4px 10px rgb(0 0 0 / .18); }

.is-fading .leaf { transform: none !important; transition: opacity 260ms ease, visibility 0s 0s; }
.is-fading .leaf:not(.current) { opacity: 0; visibility: hidden; transition: opacity 260ms ease, visibility 0s 260ms; }
.is-fading .leaf::after { display: none; }
</style>
