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
 *
 * 10-13（运动页「问 AI」录屏）：
 * - 面板**永远整块在窗口里**：下面放不下放上面，上下都不够就贴着窗口摆、限高、里面自己滚（以前按钮靠下时
 *   面板长到窗口外，滚也滚不到，只能关掉重来）；
 * - 内容长大（「正在准备文件…」→ 文件卡）时**跟着内容重新摆**，位置滑过去，不是一跳；
 * - 顶上一条抓手：按住可以上下左右拖开（看被挡住的那部分页面），拖到哪都不出窗口。
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
/** 弹出放完了：之后内容变高、窗口变化时位置滑过去（弹出途中不加过渡，免得和弹簧打架）。 */
const settled = ref(false);
/** 拖开的偏移（独立的 translate，不碰弹出 / 缩回用的 transform）。 */
const drag = ref({ x: 0, y: 0 });
const dragging = ref(false);
const MARGIN = 20;
const GAP = 8;
let closing: Promise<void> | null = null;
let placed = { left: 0, top: 0, width: 0, height: 0 };

/** 面板放在按钮下方，往空的那边展开（anchoredLeft）；下面放不下就放上面；都放不下就贴着窗口摆（限高、内部滚）。
    缩放原点 = 按钮中心。 */
const place = () => {
  const box = props.anchor?.isConnected ? props.anchor.getBoundingClientRect() : null;
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const width = Math.min(props.width, vw - MARGIN * 2);
  const maxHeight = vh - MARGIN * 2;
  const height = Math.min(panel.value?.scrollHeight ?? 220, maxHeight);
  const anchor = box ?? new DOMRect(vw / 2, vh / 2, 0, 0);
  const left = anchoredLeft(anchor, width, vw, MARGIN);
  let top: number;
  if (anchor.bottom + GAP + height <= vh - MARGIN) top = anchor.bottom + GAP;
  else if (anchor.top - GAP - height >= MARGIN) top = anchor.top - GAP - height;
  else top = Math.min(Math.max(MARGIN, anchor.bottom + GAP), vh - MARGIN - height);
  const ox = anchor.left + anchor.width / 2 - left;
  const oy = anchor.top + anchor.height / 2 - top;
  placed = { left, top, width, height };
  style.value = {
    left: `${left}px`, top: `${top}px`, width: `${width}px`, maxHeight: `${maxHeight}px`,
    transformOrigin: `${ox.toFixed(1)}px ${oy.toFixed(1)}px`,
  };
  clampDrag();
};

/** 拖开的偏移夹在窗口里。 */
const clampDrag = () => {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const { left, top, width, height } = placed;
  const x = Math.min(Math.max(drag.value.x, MARGIN - left), vw - MARGIN - width - left);
  const y = Math.min(Math.max(drag.value.y, MARGIN - top), vh - MARGIN - height - top);
  if (x !== drag.value.x || y !== drag.value.y) drag.value = { x, y };
};

const focusables = () => [...(panel.value?.querySelectorAll<HTMLElement>('button, a[href], input, textarea, [tabindex]:not([tabindex="-1"])') ?? [])]
  .filter((el) => !el.hasAttribute('disabled'));

let resizer: ResizeObserver | null = null;
const open = async () => {
  place();
  await nextTick();
  place();
  await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
  const el = panel.value;
  if (!el || closing) return;
  place();
  const duration = reducedMotion() ? 140 : Math.max(380, springCurve(SPRINGS.pop).duration);
  let pop: Animation;
  if (reducedMotion()) {
    pop = el.animate([{ opacity: 0 }, { opacity: 1 }], { duration, fill: 'backwards' });
  } else {
    const { easing } = springCurve(SPRINGS.pop);
    pop = el.animate(
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
  // 内容长大 / 缩小（准备文件 → 文件卡）：重新摆，位置滑过去。
  resizer = new ResizeObserver(() => { if (!closing && !dragging.value) place(); });
  for (const child of el.children) resizer.observe(child);
  void pop.finished.then(() => { settled.value = true; }, () => undefined);
};

/** 缩回按钮，放完才通知父组件卸载。 */
const close = (): Promise<void> => {
  if (closing) return closing;
  const el = panel.value;
  closing = (async () => {
    resizer?.disconnect();
    if (el && ready.value) {
      const duration = reducedMotion() ? 120 : 260;
      // 拖开过：缩回的原点按此刻的位置算，还是缩进按钮里。
      if (drag.value.x || drag.value.y) {
        const box = props.anchor?.isConnected ? props.anchor.getBoundingClientRect() : null;
        if (box) el.style.transformOrigin = `${(box.left + box.width / 2 - placed.left - drag.value.x).toFixed(1)}px ${(box.top + box.height / 2 - placed.top - drag.value.y).toFixed(1)}px`;
      }
      const shrink = animateFromNow(el, { transform: reducedMotion() ? 'none' : 'scale(.18)', opacity: 0 }, { duration, easing: 'cubic-bezier(.4, 0, .7, .2)', fill: 'forwards' });
      if (veil.value) animateFromNow(veil.value, { opacity: 0 }, { duration, easing: 'ease-in', fill: 'forwards' }, ['opacity']);
      await shrink.finished.catch(() => undefined);
    }
    props.anchor?.focus({ preventScroll: true });
    emit('close');
  })();
  return closing;
};

/* ---------- 抓手：按住拖开 ---------- */
let start = { x: 0, y: 0, dx: 0, dy: 0 };
const onGripDown = (event: PointerEvent) => {
  if (event.button !== 0) return;
  event.preventDefault();
  (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
  dragging.value = true;
  start = { x: event.clientX, y: event.clientY, dx: drag.value.x, dy: drag.value.y };
};
const onGripMove = (event: PointerEvent) => {
  if (!dragging.value) return;
  drag.value = { x: start.dx + event.clientX - start.x, y: start.dy + event.clientY - start.y };
  clampDrag();
};
const onGripUp = (event: PointerEvent) => {
  if (!dragging.value) return;
  dragging.value = false;
  (event.currentTarget as HTMLElement).releasePointerCapture?.(event.pointerId);
};
/** 键盘也能挪：抓手聚焦时方向键一次 24px。 */
const onGripKey = (event: KeyboardEvent) => {
  const step = 24;
  const move = { ArrowUp: [0, -step], ArrowDown: [0, step], ArrowLeft: [-step, 0], ArrowRight: [step, 0] }[event.key];
  if (!move) return;
  event.preventDefault();
  drag.value = { x: drag.value.x + move[0]!, y: drag.value.y + move[1]! };
  clampDrag();
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
  resizer?.disconnect();
  window.removeEventListener('resize', onResize);
});
defineExpose({ close });
</script>

<template>
  <Teleport to="body">
    <div :class="['pop-layer', { ready }]">
      <div ref="veil" class="pop-veil" aria-hidden="true" @click="close"></div>
      <div ref="panel" :class="['pop-panel', { settled, dragging }]" role="dialog" aria-modal="true" :aria-labelledby="labelledby"
        :style="{ ...style, translate: `${drag.x}px ${drag.y}px` }" @keydown="onKey">
        <div class="pop-grip" role="separator" aria-orientation="horizontal" tabindex="-1" aria-hidden="true"
          @pointerdown="onGripDown" @pointermove="onGripMove" @pointerup="onGripUp" @pointercancel="onGripUp" @keydown="onGripKey"><i></i></div>
        <div class="pop-body">
          <slot :close="close" />
        </div>
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
/* 面板自己是一块玻璃：底色 + 背景模糊只在面板这一小块上取样。限高，放不下时里面自己滚。 */
.pop-panel { position: absolute; display: grid; grid-template-rows: auto minmax(0, 1fr); padding: 0; border: 1px solid var(--mat-glass-line); border-radius: 22px;
  background: var(--mat-glass-strong); -webkit-backdrop-filter: var(--mat-glass-blur); backdrop-filter: var(--mat-glass-blur);
  box-shadow: var(--mat-glass-shadow), 0 30px 60px -30px rgba(0, 0, 0, .7); color: var(--ink); will-change: transform, opacity; overflow: hidden; }
/* 弹出放完以后，内容变高 / 窗口变化引起的重摆滑过去（拖着的时候不滑）。 */
.pop-panel.settled:not(.dragging) { transition: left 340ms cubic-bezier(.2, .8, .2, 1), top 340ms cubic-bezier(.2, .8, .2, 1), translate 240ms cubic-bezier(.2, .8, .2, 1); }
.pop-body { display: grid; gap: 8px; min-height: 0; padding: 2px 16px 16px; overflow: auto; overscroll-behavior: contain; scrollbar-width: thin; }
/* 抓手：顶上一条短横杠，按住拖；悬停时亮一点、光标变成可抓。 */
.pop-grip { display: grid; place-items: center; height: 16px; cursor: grab; touch-action: none; }
.pop-grip i { width: 38px; height: 4px; border-radius: 999px; background: color-mix(in srgb, var(--ink) 18%, transparent); transition: background 160ms ease, width 200ms ease; }
.pop-grip:hover i { width: 46px; background: color-mix(in srgb, var(--ink) 34%, transparent); }
.pop-panel.dragging .pop-grip { cursor: grabbing; }
.pop-panel.dragging .pop-grip i { width: 46px; background: var(--accent); }
@media (prefers-reduced-motion: reduce) { .pop-panel.settled:not(.dragging) { transition: none; } }
</style>
