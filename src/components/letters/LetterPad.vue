<script setup lang="ts">
/**
 * 一沓信纸，一次只看一张（批次 6，2026-10-21 用户：别像卡片叠在一起、翻页也别像卡片）。
 *
 * 翻到下一页：当前这张被「掀起来」往左滑走（带一点转角和更深的影子），下面那张本来就在原地，阴影慢慢退掉。
 * 翻回上一页：上一张从左边滑回来盖住。可以直接拖着纸走，松手过 70px 或甩得够快就翻，不够就弹回。
 * 下面那张之外的纸都不画（不叠边、不露角）。只动 transform / opacity；减少动态效果时交叉淡入。
 * 只有当前那张能交互，别的 inert（读屏也只念当前那张）。
 */
import { computed, ref } from 'vue';
import { lessMotion } from '../../lib/motion/lessMotion';
import { playPaperSlide } from '../../lib/letters/sound';

const props = defineProps<{ count: number; index: number }>();
const emit = defineEmits<{ (event: 'update:index', index: number): void }>();

const root = ref<HTMLElement | null>(null);
const drag = ref(0);
const dragging = ref(false);
let start: { x: number; y: number; id: number; t: number } | null = null;
let horizontal = false;

const go = (next: number) => {
  if (next < 0 || next >= props.count || next === props.index) return;
  playPaperSlide();
  emit('update:index', next);
};
defineExpose({ go });

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
  // 第一页往右拖、最后一页往左拖：只给一点阻尼，不翻。
  const edge = (dx > 0 && props.index === 0) || (dx < 0 && props.index === props.count - 1);
  drag.value = edge ? dx * 0.18 : dx;
};
const up = (event: PointerEvent) => {
  if (horizontal && start) {
    const speed = drag.value / Math.max(1, performance.now() - start.t);
    if ((drag.value < -70 || speed < -0.6) && props.index < props.count - 1) go(props.index + 1);
    else if ((drag.value > 70 || speed > 0.6) && props.index > 0) go(props.index - 1);
    event.preventDefault();
  }
  start = null;
  horizontal = false;
  dragging.value = false;
  drag.value = 0;
};

const fade = computed(() => lessMotion());
/** 往右拖着上一页回来：上一页跟着手从左边进来。 */
const pullingBack = computed(() => drag.value > 0 && props.index > 0);

const leafState = (i: number) => {
  const offset = i - props.index;
  if (offset === 0) return 'current';
  if (offset === 1) return 'below';
  if (offset === -1) return 'gone near';
  return offset < 0 ? 'gone' : 'hidden';
};
const leafStyle = (i: number) => {
  const offset = i - props.index;
  if (fade.value) return undefined;
  if (offset === 0 && !pullingBack.value && drag.value) {
    return { transform: `translateX(${drag.value}px) rotate(${drag.value / 90}deg)`, transition: 'none' };
  }
  if (offset === -1 && pullingBack.value) {
    const width = root.value?.clientWidth || 640;
    const x = Math.min(0, -width * 1.08 + drag.value * 1.6);
    return { transform: `translateX(${x}px) rotate(${x / width * 6}deg)`, transition: 'none', visibility: 'visible' as const };
  }
  return undefined;
};
</script>

<template>
  <div ref="root" :class="['letter-pad', { 'is-fading': fade, dragging }]" @pointerdown="down" @pointermove="move" @pointerup="up" @pointercancel="up">
    <div v-for="i in count" :key="i - 1" :class="['leaf', leafState(i - 1)]" :style="leafStyle(i - 1)"
      :inert="i - 1 !== index || undefined" :aria-hidden="i - 1 !== index || undefined">
      <slot name="page" :i="i - 1" :active="i - 1 === index" />
    </div>
  </div>
</template>

<style scoped>
.letter-pad {
  position: relative; width: min(640px, calc(100vw / var(--ui-scale, 1) - 32px)); height: min(740px, calc(100vh / var(--ui-scale, 1) - 150px));
  touch-action: pan-y; user-select: none;
}
.leaf {
  position: absolute; inset: 0; transform-origin: 30% 100%;
  transition: transform 560ms cubic-bezier(.32, .72, .24, 1), opacity 300ms ease, visibility 0s 0s;
}
.leaf > :deep(*) { height: 100%; }
.leaf.current { z-index: 3; }
/* 下面那张：原地不动，盖着一层淡淡的影子，上面那张掀走时影子退掉。 */
.leaf.below { z-index: 2; }
.leaf.below::after {
  content: ''; position: absolute; inset: 0; border-radius: 3px; pointer-events: none;
  background: linear-gradient(100deg, rgb(0 0 0 / .1), rgb(0 0 0 / .03) 60%, transparent); opacity: 1; transition: opacity 560ms ease;
}
.leaf.hidden { z-index: 1; visibility: hidden; }
/* 掀走的：往左滑出、转一点角，滑完就不画了。 */
.leaf.gone {
  z-index: 4; transform: translateX(-112%) rotate(-6deg); opacity: 0;
  visibility: hidden; transition: transform 560ms cubic-bezier(.32, .72, .24, 1), opacity 420ms 140ms ease, visibility 0s 560ms;
}
.leaf.gone.near { z-index: 4; }
/* 掀起来的那一刻影子更深：给当前页一层更重的投影（在拖动时）。 */
.dragging .leaf.current > :deep(.paper) { box-shadow: 0 34px 60px -24px rgb(0 0 0 / .6), 0 4px 10px rgb(0 0 0 / .18); }

.is-fading .leaf { transform: none !important; transition: opacity 260ms ease, visibility 0s 0s; }
.is-fading .leaf.gone, .is-fading .leaf.hidden { opacity: 0; visibility: hidden; transition: opacity 260ms ease, visibility 0s 260ms; }
.is-fading .leaf.below { opacity: 0; }
.is-fading .leaf.below::after { display: none; }
</style>
