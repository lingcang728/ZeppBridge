<script setup lang="ts">
/**
 * 贴着触发按钮的玻璃浮层（2026-10-07 第二轮）：从按钮里弹簧长出来，关的时候缩回按钮。
 *
 * 和 ModalDialog 的区别：不铺整屏毛玻璃，只把面板自己做成玻璃、整屏只压一层淡淡的暗色。整屏背景模糊在
 * 一页十几张图表上、DPR 2 下每帧都要重新取样，「问 AI」弹出时的掉帧主要就是它（用户 10-07 录屏）。
 *
 * - 只动 transform / opacity；弹簧曲线采样成 CSS linear()（lib/motion/cards/spring.ts），在合成器上放。
 * - 关：从此刻的计算样式缩回按钮（半路按 Esc 也是原路撤回，不先跳到「开好」）。放完才 emit('close')。
 * - 父组件要关它（比如选了一项、马上切页）：调用暴露出来的 `close()`，它返回放完的 promise。
 * - 焦点：开了以后落在第一个可聚焦的东西上，Tab 在面板里循环，关了回到按钮。
 */
import { nextTick, onBeforeUnmount, onMounted, ref } from 'vue';
import { onMotionEscape } from '../lib/motion/interrupt';
import { SPRINGS, reducedMotion, springCurve } from '../lib/motion/cards/spring';

const props = withDefaults(defineProps<{ anchor: HTMLElement | null; labelledby?: string; width?: number }>(), { labelledby: undefined, width: 340 });
const emit = defineEmits<{ close: [] }>();
const panel = ref<HTMLElement | null>(null);
const veil = ref<HTMLElement | null>(null);
const style = ref<Record<string, string>>({});
const MARGIN = 12;
const GAP = 8;
let opening: Animation | null = null;
let veilIn: Animation | null = null;
let closing: Promise<void> | null = null;

/** 面板放在按钮下方、右边对齐按钮；下面放不下就放上面；左右夹在窗口里。缩放原点 = 按钮中心。 */
const place = () => {
  const box = props.anchor?.getBoundingClientRect();
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const width = Math.min(props.width, vw - MARGIN * 2);
  const height = panel.value?.offsetHeight ?? 220;
  const anchor = box ?? new DOMRect(vw / 2, vh / 2, 0, 0);
  const left = Math.min(Math.max(MARGIN, anchor.right - width), vw - width - MARGIN);
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
  const el = panel.value;
  if (!el) return;
  if (reducedMotion()) {
    opening = el.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 140, fill: 'backwards' });
  } else {
    const { easing, duration } = springCurve(SPRINGS.pop);
    opening = el.animate(
      [{ transform: 'scale(.18)', opacity: 0 }, { opacity: 1, offset: 0.35 }, { transform: 'none', opacity: 1 }],
      { duration: Math.max(380, duration), easing, fill: 'backwards' },
    );
    // 面板里的几行跟着先后浮上来，像从按钮里倒出来。
    [...el.querySelectorAll<HTMLElement>('[data-pop-item]')].forEach((item, i) => item.animate(
      [{ transform: 'translateY(8px)', opacity: 0 }, { transform: 'none', opacity: 1 }],
      { duration: 280, delay: 90 + i * 45, easing: 'cubic-bezier(.2, .9, .25, 1)', fill: 'backwards' },
    ));
  }
  veilIn = veil.value?.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 220, easing: 'ease-out', fill: 'backwards' }) ?? null;
  focusables()[0]?.focus({ preventScroll: true });
};

/** 缩回按钮，放完才通知父组件卸载。 */
const close = (): Promise<void> => {
  if (closing) return closing;
  const el = panel.value;
  closing = (async () => {
    if (el) {
      const now = getComputedStyle(el);
      const from = { transform: now.transform === 'none' ? 'none' : now.transform, opacity: now.opacity };
      opening?.cancel();
      const duration = reducedMotion() ? 120 : 260;
      const shrink = el.animate([from, { transform: reducedMotion() ? 'none' : 'scale(.18)', opacity: 0 }], { duration, easing: 'cubic-bezier(.4, 0, .7, .2)', fill: 'forwards' });
      const v = veil.value;
      if (v) {
        const vNow = getComputedStyle(v).opacity;
        veilIn?.cancel();
        v.animate([{ opacity: vNow }, { opacity: 0 }], { duration, easing: 'ease-in', fill: 'forwards' });
      }
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
    <div class="pop-layer">
      <div ref="veil" class="pop-veil" aria-hidden="true" @click="close"></div>
      <div ref="panel" class="pop-panel" role="dialog" aria-modal="true" :aria-labelledby="labelledby" :style="style" @keydown="onKey">
        <slot :close="close" />
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.pop-layer { position: fixed; inset: 0; z-index: 2100; }
.pop-veil { position: absolute; inset: 0; background: color-mix(in srgb, #000 26%, transparent); }
/* 面板自己是一块玻璃：底色 + 背景模糊只在面板这一小块上取样。 */
.pop-panel { position: absolute; display: grid; gap: 8px; padding: 16px; border: 1px solid var(--mat-glass-line); border-radius: 22px;
  background: var(--mat-glass-strong); -webkit-backdrop-filter: var(--mat-glass-blur); backdrop-filter: var(--mat-glass-blur);
  box-shadow: var(--mat-glass-shadow), 0 30px 60px -30px rgba(0, 0, 0, .7); color: var(--ink); will-change: transform, opacity; }
</style>
