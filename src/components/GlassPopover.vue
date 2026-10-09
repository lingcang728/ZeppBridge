<script setup lang="ts">
/**
 * 贴着触发按钮的玻璃浮层（2026-10-07 第二轮，第三轮 A7 / A11 / A8）：从按钮里弹簧长出来，关的时候缩回按钮。
 *
 * - 背景：整屏一层 `backdrop-filter: blur(14px)` + 淡淡的暗色（第二轮只压暗、不模糊，用户 10-07 录屏要模糊）。
 *   只淡入淡出这层自己的 opacity，和面板弹出同起同止；祖先不做 opacity 动画（祖先一淡，它就成了取样边界，
 *   整段淡入期间看不见模糊，最后才「啪」地糊上）。面板自己的玻璃保留。
 * - 先有内容再弹出：等内容布局好（nextTick + 一帧）才起动画；面板弹出时内容已经在、只上浮 6px——
 *   第二轮内容逐项 delay 到 90ms 之后，先弹出一块空的暗色板（105619 f2550–f2566）。
 * - 只动 transform / opacity；弹簧曲线采样成 CSS linear()（lib/motion/cards/spring.ts），在合成器上放。
 * - 关：从此刻的计算样式缩回按钮（半路按 Esc 也是原路撤回，不先跳到「开好」，lib/motion/cards/reversible.ts）。
 *   放完才 emit('close')。父组件要关它（比如选了一项、马上切页）：调用暴露出来的 `close()`，它返回放完的 promise。
 * - 焦点：开了以后落在第一个可聚焦的东西上，Tab 在面板里循环，关了回到按钮。
 */
import { nextTick, onBeforeUnmount, onMounted, ref } from 'vue';
import { onMotionEscape } from '../lib/motion/interrupt';
import { SPRINGS, reducedMotion, springCurve } from '../lib/motion/cards/spring';
import { animateFromNow } from '../lib/motion/cards/reversible';
import { anchoredLeft } from '../lib/popoverPosition';

const props = withDefaults(defineProps<{ anchor: HTMLElement | null; labelledby?: string; width?: number }>(), { labelledby: undefined, width: 340 });
const emit = defineEmits<{ close: [] }>();
const panel = ref<HTMLElement | null>(null);
const veil = ref<HTMLElement | null>(null);
const style = ref<Record<string, string>>({});
/** 内容布局好、动画起好之前整块不画（不出现「空板」那一帧）。 */
const ready = ref(false);
const MARGIN = 20;
const GAP = 8;
let closing: Promise<void> | null = null;

/** 面板放在按钮下方，往空的那边展开（anchoredLeft）；下面放不下就放上面；左右夹在窗口里。缩放原点 = 按钮中心。 */
const place = () => {
  const box = props.anchor?.getBoundingClientRect();
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const width = Math.min(props.width, vw - MARGIN * 2);
  const height = panel.value?.offsetHeight ?? 220;
  const anchor = box ?? new DOMRect(vw / 2, vh / 2, 0, 0);
  const left = anchoredLeft(anchor, width, vw, MARGIN);
  const below = anchor.bottom + GAP + height <= vh - MARGIN;
  const top = below ? anchor.bottom + GAP : Math.max(MARGIN, anchor.top - GAP - height);
  const ox = anchor.left + anchor.width / 2 - left;
  const oy = anchor.top + anchor.height / 2 - top;
  style.value = { left: `${left}px`, top: `${top}px`, width: `${width}px`, transformOrigin: `${ox.toFixed(1)}px ${oy.toFixed(1)}px` };
};

const focusables = () => [...(panel.value?.querySelectorAll<HTMLElement>('button, a[href], input, textarea, [tabindex]:not([tabindex="-1"])') ?? [])]
  .filter((el) => !el.hasAttribute('disabled'));

const open = async () => {
  place();
  await nextTick();
  place();
  await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
  const el = panel.value;
  if (!el || closing) return;
  place();
  const duration = reducedMotion() ? 140 : Math.max(380, springCurve(SPRINGS.pop).duration);
  if (reducedMotion()) {
    el.animate([{ opacity: 0 }, { opacity: 1 }], { duration, fill: 'backwards' });
  } else {
    const { easing } = springCurve(SPRINGS.pop);
    el.animate(
      [{ transform: 'scale(.18)', opacity: 0 }, { opacity: 1, offset: 0.3 }, { transform: 'none', opacity: 1 }],
      { duration, easing, fill: 'backwards' },
    );
    // 内容和面板同一帧出现，只是晚一点点落定：整体上浮 6px，不再逐项错开。
    for (const item of el.querySelectorAll<HTMLElement>('[data-pop-item]')) {
      item.animate([{ transform: 'translateY(6px)' }, { transform: 'none' }], { duration: 300, easing: 'cubic-bezier(.2, .9, .25, 1)', fill: 'backwards' });
    }
  }
  // 背景模糊和面板同起同止。
  veil.value?.animate([{ opacity: 0 }, { opacity: 1 }], { duration: Math.min(duration, 380), easing: 'cubic-bezier(.2, .8, .2, 1)', fill: 'backwards' });
  ready.value = true;
  focusables()[0]?.focus({ preventScroll: true });
};

/** 缩回按钮，放完才通知父组件卸载。 */
const close = (): Promise<void> => {
  if (closing) return closing;
  const el = panel.value;
  closing = (async () => {
    if (el && ready.value) {
      const duration = reducedMotion() ? 120 : 260;
      const shrink = animateFromNow(el, { transform: reducedMotion() ? 'none' : 'scale(.18)', opacity: 0 }, { duration, easing: 'cubic-bezier(.4, 0, .7, .2)', fill: 'forwards' });
      if (veil.value) animateFromNow(veil.value, { opacity: 0 }, { duration, easing: 'ease-in', fill: 'forwards' }, ['opacity']);
      await shrink.finished.catch(() => undefined);
    }
    props.anchor?.focus({ preventScroll: true });
    emit('close');
  })();
  return closing;
};

const onKey = (event: KeyboardEvent) => {
  if (event.key !== 'Tab') return;
  const items = focusables();
  if (!items.length) return;
  const first = items[0]!;
  const last = items[items.length - 1]!;
  if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
  else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
};

const releaseEscape = onMotionEscape(() => { void close(); return true; });
const onResize = () => place();
onMounted(() => {
  window.addEventListener('resize', onResize);
  void open();
});
onBeforeUnmount(() => {
  releaseEscape();
  window.removeEventListener('resize', onResize);
});
defineExpose({ close });
</script>

<template>
  <Teleport to="body">
    <div :class="['pop-layer', { ready }]">
      <div ref="veil" class="pop-veil" aria-hidden="true" @click="close"></div>
      <div ref="panel" class="pop-panel" role="dialog" aria-modal="true" :aria-labelledby="labelledby" :style="style" @keydown="onKey">
        <slot :close="close" />
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.pop-layer { position: fixed; inset: 0; z-index: 2100; }
.pop-layer:not(.ready) { visibility: hidden; }
/* 整屏一层静态模糊：只淡入淡出它自己（不逐帧改 blur）。 */
.pop-veil { position: absolute; inset: 0; background: color-mix(in srgb, #000 24%, transparent);
  -webkit-backdrop-filter: blur(14px) saturate(1.1); backdrop-filter: blur(14px) saturate(1.1); }
:root[data-theme='light'] .pop-veil { background: color-mix(in srgb, #0b1210 12%, transparent); }
/* 面板自己是一块玻璃：底色 + 背景模糊只在面板这一小块上取样。 */
.pop-panel { position: absolute; display: grid; gap: 8px; padding: 16px; border: 1px solid var(--mat-glass-line); border-radius: 22px;
  background: var(--mat-glass-strong); -webkit-backdrop-filter: var(--mat-glass-blur); backdrop-filter: var(--mat-glass-blur);
  box-shadow: var(--mat-glass-shadow), 0 30px 60px -30px rgba(0, 0, 0, .7); color: var(--ink); will-change: transform, opacity; }
</style>
