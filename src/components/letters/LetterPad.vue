<script setup lang="ts">
/**
 * 一沓信纸，一次读最上面那张（批次 6；2026-10-21 用户：翻页别把纸飞走，要像读真信——读完一张叠到最后）。
 *
 * 整沓按「离最上面几张」排：最上面那张正着放，下面两张各错开一点、转一点角，露出纸边；更深的和第三张叠在一起。
 * 往后翻：最上面那张整张往左抽出来（抽到和整沓完全错开），再从后面滑回去、落到整沓底下——
 * 换层次的那一刻它和别的纸没有重叠，所以看不出「一跳」（2026-10-21 录屏：只抽出一半就换层，被压住的半张闪一下，用户说一顿一卡）。
 * 下一张本来就在下面，跟着慢慢浮上来摆正。往前翻反过来：最底下那张从后面往左抽出来，再盖到最上面。
 * 翻页：拖着最上面那张往左抽（松手过 70px 或甩得够快就翻，不够就弹回；往右拖翻回上一张）、鼠标滚轮、方向键。
 *
 * 只动 transform / opacity（层次靠 WAAPI 的 z-index 离散关键帧在抽到最远处换）。减少动态效果时交叉淡入。
 * 所有页的正文一开始就排好、画好（各自一层合成层），翻页时不再临时挂内容——以前等翻完才画下一页，字会晚一拍浮出来。
 * 只有最上面那张能交互，别的 inert（读屏也只念它）。
 */
import { computed, onBeforeUnmount, ref } from 'vue';
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
/* 抽出来最远的位置：整张抽到整沓左边、往上一点、转一点角（和整沓不再重叠，换层次看不出来）。 */
const OUT = 'translate(-112%, -3%) rotate(-7deg)';
const TURN_MS = 980;

const depth = (i: number) => (i - props.index + props.count) % props.count;
const pose = (i: number) => POSE[Math.min(depth(i), 2)]!;

/** 正在翻的几张（快速连翻时可以同时有两张在动）。 */
const moving = ref(new Set<number>());

/* 动的那张：往后翻是原来最上面那张（落到最底下），往前翻是最底下那张（盖到最上面）。起止各按它前后的层摆。 */
const turn = async (mover: number, forward: boolean, startPose: string) => {
  const leaf = leaves.value[mover];
  moving.value = new Set(moving.value).add(mover);
  const endPose = pose(mover);
  if (leaf && !lessMotion()) {
    const top = String(props.count + 2);
    const bottom = '0';
    const [from, to] = forward ? [top, bottom] : [bottom, top];
    await leaf.animate([
      { transform: startPose, zIndex: from, easing: 'cubic-bezier(.3, .55, .35, 1)' },
      { transform: OUT, zIndex: from, offset: .5 },
      { transform: OUT, zIndex: to, offset: .501, easing: 'cubic-bezier(.45, 0, .2, 1)' },
      { transform: endPose, zIndex: to },
    ], { duration: TURN_MS }).finished.catch(() => undefined);
  }
  const next = new Set(moving.value);
  next.delete(mover);
  moving.value = next;
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

/* 鼠标滚轮：往下滚翻下一页、往上滚翻上一页。触控板一下会来一串小增量，攒够一格再翻，翻了以后歇一会儿再认下一下。 */
let wheelSum = 0;
let wheelQuietUntil = 0;
let wheelReset: number | undefined;
const wheel = (event: WheelEvent) => {
  const box = (event.target as HTMLElement).closest('textarea');
  // 回信框里写多了可以在框里往下滚：框还能滚的方向交给它。
  if (box && (event.deltaY > 0 ? box.scrollTop + box.clientHeight < box.scrollHeight - 1 : box.scrollTop > 0)) return;
  event.preventDefault();
  const now = performance.now();
  if (now < wheelQuietUntil) return;
  wheelSum += Math.abs(event.deltaY) >= Math.abs(event.deltaX) ? event.deltaY : event.deltaX;
  window.clearTimeout(wheelReset);
  wheelReset = window.setTimeout(() => { wheelSum = 0; }, 220);
  if (Math.abs(wheelSum) < 40) return;
  const next = props.index + Math.sign(wheelSum);
  wheelSum = 0;
  if (next < 0 || next >= props.count) return;
  wheelQuietUntil = now + 420;
  go(next);
};

/* 以前第一次读到时最上面那张会往左探一下提示能拖；用户看来像手势识别出错的晃动（2026-10-21），去掉了。 */
defineExpose({ go, wheel });
onBeforeUnmount(() => window.clearTimeout(wheelReset));

const down = (event: PointerEvent) => {
  const target = event.target as HTMLElement;
  if (event.button !== 0 || target.closest('textarea, input, button, a, label, select')) return;
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
  if ((d === 0 && drag.value) || moving.value.has(i)) style.transition = 'none';
  return style;
};
</script>

<template>
  <div ref="root" :class="['letter-pad', { 'is-fading': fade, dragging }]" @pointerdown="down" @pointermove="move" @pointerup="up" @pointercancel="up">
    <div v-for="i in count" :key="i - 1" :ref="(el) => { if (el) leaves[i - 1] = el as HTMLElement; }"
      :class="['leaf', { current: i - 1 === index }]" :style="leafStyle(i - 1)"
      :inert="i - 1 !== index || undefined" :aria-hidden="i - 1 !== index || undefined">
      <slot name="page" :i="i - 1" :active="i - 1 === index" />
    </div>
  </div>
</template>

<style scoped>
.letter-pad {
  position: relative; width: min(640px, calc(100vw / var(--ui-scale, 1) - 32px)); height: min(740px, calc(100vh / var(--ui-scale, 1) - 170px));
  touch-action: pan-y; user-select: none; cursor: grab;
}
.letter-pad.dragging { cursor: grabbing; }
/* 每张一层合成层：画一次，之后翻页只动层，不重画字。下一张浮上来摆正比抽走那张稍慢一点、晚一点起步。 */
/* 透明度那条给拆信用：展开时底下几张先藏着，展开完淡出来。 */
.leaf { position: absolute; inset: 0; transform-origin: 50% 60%; will-change: transform; transition: transform 620ms 120ms cubic-bezier(.3, .7, .25, 1), opacity 420ms ease; }
.leaf > :deep(*) { height: 100%; }
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
