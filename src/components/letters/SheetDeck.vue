<script setup lang="ts" generic="T">
/**
 * 抽出来的一叠信纸：当前那张在最上面，后面的错开一点露个边，读过的往左上方滑走。
 * 左右拖动翻页（拖过 60px），只动 transform / opacity；减少动态效果时改成交叉淡入。
 * 只有当前那张能交互，别的用 inert 挡住（读屏也只念当前那张）。
 */
import { computed, ref } from 'vue';
import { lessMotion } from '../../lib/motion/lessMotion';

const props = defineProps<{ sheets: T[]; index: number }>();
const emit = defineEmits<{ (event: 'update:index', index: number): void }>();

const drag = ref(0);
let start: { x: number; y: number; id: number } | null = null;
let horizontal = false;

const down = (event: PointerEvent) => {
  const target = event.target as HTMLElement;
  // 在输入框、按钮、链接上按下不算翻页。
  if (event.button !== 0 || target.closest('textarea, input, button, a, label, select')) return;
  start = { x: event.clientX, y: event.clientY, id: event.pointerId };
  horizontal = false;
};
const move = (event: PointerEvent) => {
  if (!start || event.pointerId !== start.id) return;
  const dx = event.clientX - start.x;
  const dy = event.clientY - start.y;
  if (!horizontal && Math.abs(dx) > 8 && Math.abs(dx) > Math.abs(dy) * 1.4) {
    horizontal = true;
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
  }
  if (horizontal) drag.value = dx;
};
const up = () => {
  if (horizontal) {
    if (drag.value < -60 && props.index < props.sheets.length - 1) emit('update:index', props.index + 1);
    else if (drag.value > 60 && props.index > 0) emit('update:index', props.index - 1);
  }
  start = null;
  horizontal = false;
  drag.value = 0;
};

const fade = computed(() => lessMotion());
const slotStyle = (i: number) => {
  const offset = i - props.index;
  if (fade.value) return { opacity: offset === 0 ? 1 : 0, zIndex: 10 - Math.abs(offset) };
  if (offset < 0) return { transform: 'translate(-58%, -6%) rotate(-7deg)', opacity: 0, zIndex: 20 + offset };
  const lift = offset === 0 ? drag.value : 0;
  const depth = Math.min(offset, 3);
  return {
    transform: `translate(${lift}px, ${depth * 12}px) rotate(${offset === 0 ? lift / 40 : depth * 0.8}deg) scale(${1 - depth * 0.035})`,
    opacity: offset > 2 ? 0 : 1,
    zIndex: 10 - offset,
    transition: offset === 0 && drag.value ? 'none' : undefined,
  };
};
</script>

<template>
  <div :class="['sheet-deck', { 'is-fading': fade }]" @pointerdown="down" @pointermove="move" @pointerup="up" @pointercancel="up">
    <div v-for="(sheet, i) in sheets" :key="i" class="sheet-slot" :style="slotStyle(i)" :inert="i !== index || undefined" :aria-hidden="i !== index || undefined">
      <div class="sheet-scroll"><slot name="sheet" :sheet="sheet" :active="i === index" /></div>
    </div>
  </div>
</template>

<style scoped>
.sheet-deck { position: relative; width: min(600px, calc(100vw / var(--ui-scale, 1) - 40px)); height: min(560px, calc(100vh / var(--ui-scale, 1) - 170px)); touch-action: pan-y; }
.sheet-slot { position: absolute; inset: 0; transform-origin: 50% 100%; transition: transform 460ms cubic-bezier(.22, .8, .24, 1), opacity 360ms ease; will-change: transform; }
.is-fading .sheet-slot { transition: opacity 260ms ease; }
.sheet-scroll { height: 100%; overflow-y: auto; overscroll-behavior: contain; border-radius: 6px; box-shadow: 0 22px 44px -20px rgb(0 0 0 / .55), 0 2px 6px rgb(0 0 0 / .14); }
/* 阴影画在滚动框上：画在信纸上会被滚动框裁掉。 */
.sheet-scroll > :deep(.paper) { min-height: 100%; padding: 30px clamp(20px, 5vw, 44px) 28px; box-sizing: border-box; box-shadow: none; }
</style>
