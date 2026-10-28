<script setup lang="ts">
/**
 * 贴着触发按钮的玻璃浮层：指标的「?」、「问 AI」、洞察、计划状态胶囊都用它。
 *
 * - 背景：整屏一层 `backdrop-filter: blur(14px)` + 淡淡的暗色。只淡入淡出这层自己的 opacity，和面板形变同起同止；
 *   祖先不做 opacity 动画（祖先一淡，它就成了取样边界，整段淡入期间看不见模糊，最后才「啪」地糊上）。
 * - 焦点：开了以后落在第一个可聚焦的东西上，Tab 在面板里循环，关了回到按钮。
 * - 面板**永远整块在窗口里**：下面放不下放上面，上下都不够就贴着窗口摆、限高、里面自己滚；
 *   内容长大（「正在准备文件…」→ 文件卡）时跟着内容重新摆，位置滑过去。
 *
 * 10-28（用户录屏：开是 scale(.18) 一弹、关是缩小淡出，太生硬；拖开松手原地不动）——改成「胶囊形变 + 弹回」：
 * - **开**：面板摆在终点，裁切框（`clip-path: inset(… round 22px)`，半径全程不变、留在合成器上）从按钮的矩形长到
 *   面板，面板 1:1 跟着窗口的左上角滑过去（lib/motion/popoverMorph.ts，几何同卡 ↔ 页的窗口形变）。
 *   按钮的拷贝（lib/motion/replica.ts）前三成淡掉，内容四成起才淡入，两者不叠。先停在起点等画面跟得上（whenFramesSteady）再放。
 * - **关**：从此刻的样子（含拖开的位置、开到一半的裁切）裁回按钮**现在**的位置；按钮已经不在视口里就原地缩小淡出。
 *   放完才 emit('close')；父组件要关它就调暴露出来的 `close()`，它返回放完的 promise。
 * - **拖**：按住抓手跟手，越出窗口按橡皮筋收着；松手按最后 ~80ms 的速度弹回原位；往下拖过 140px 或往下甩就关。
 * - 少动效（lessMotion）：一律淡入淡出。
 */
import { nextTick, onBeforeUnmount, onMounted, ref } from 'vue';
import { exemptFromSettle, onMotionEscape } from '../lib/motion/interrupt';
import { SPRINGS } from '../lib/motion/cards/spring';
import { lessMotion } from '../lib/motion/lessMotion';
import { whenFramesSteady } from '../lib/motion/steady';
import { paced, OPEN_EASE } from '../lib/motion/timing';
import { cardReplica, visibleWindow } from '../lib/motion/window';
import {
  POPOVER_RADIUS, SHADOW_BLEED, bleedInset, elastic, popoverFrames, reachable, releaseVelocity, shouldDismiss, springBack,
  type DragSample,
} from '../lib/motion/popoverMorph';
import { anchoredLeft } from '../lib/popoverPosition';

const props = withDefaults(defineProps<{ anchor: HTMLElement | null; labelledby?: string; width?: number }>(), { labelledby: undefined, width: 340 });
const emit = defineEmits<{ close: [] }>();
const panel = ref<HTMLElement | null>(null);
const veil = ref<HTMLElement | null>(null);
const style = ref<Record<string, string>>({});
/** 内容布局好、动画起好之前整块不画（不出现「空板」那一帧）。 */
const ready = ref(false);
/** 开的形变放完了：之后内容变高、窗口变化时位置滑过去（形变途中不重摆，免得和裁切打架）。 */
const settled = ref(false);
/** 拖开的偏移（独立的 translate，不碰形变用的 transform / clip-path）。松手弹回 0。 */
const drag = ref({ x: 0, y: 0 });
const dragging = ref(false);
/** 形变途中：面板不按内边距盒裁子元素（裁切交给 clip-path），按钮拷贝的边框那一圈才不被切掉。 */
const morphing = ref(false);
const MARGIN = 20;
const GAP = 8;
const OPEN_MS = paced(420);
const CLOSE_MS = paced(360);
/** 起点不是 0：透明度为 0 的层 Chromium 可能不合成，第一帧可见时才去光栅化，又是一跳。 */
const NEARLY_HIDDEN = 0.001;
let closing: Promise<void> | null = null;
let placed = { left: 0, top: 0, width: 0, height: 0 };
let replica: HTMLElement | null = null;

/** 面板放在按钮下方，往空的那边展开（anchoredLeft）；下面放不下就放上面；都放不下就贴着窗口摆（限高、内部滚）。 */
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
  placed = { left, top, width, height };
  style.value = { left: `${left}px`, top: `${top}px`, width: `${width}px`, maxHeight: `${maxHeight}px` };
};

const focusables = () => [...(panel.value?.querySelectorAll<HTMLElement>('button, a[href], input, textarea, [tabindex]:not([tabindex="-1"])') ?? [])]
  .filter((el) => !el.hasAttribute('disabled'));

/** 按钮此刻的矩形；不在视口里（滚走了、卸载了）就是 null。 */
const anchorRect = (): DOMRect | null => {
  const el = props.anchor;
  if (!el?.isConnected || !el.getClientRects().length) return null;
  const rect = el.getBoundingClientRect();
  return reachable(rect, { width: window.innerWidth, height: window.innerHeight }) ? rect : null;
};

/** 面板里随形变淡入淡出的两层：抓手和内容（面板自己是毛玻璃，不淡它）。 */
const layers = (el: HTMLElement) => [...el.querySelectorAll<HTMLElement>(':scope > .pop-grip, :scope > .pop-body')];

/** 按钮的拷贝：盖在窗口起点 / 终点上，和真按钮逐像素一致（lib/motion/replica.ts）。 */
const attachReplica = (el: HTMLElement, frames: Keyframe[], timing: KeyframeAnimationOptions) => {
  replica?.remove();
  replica = null;
  if (!props.anchor?.isConnected) return;
  const copy = cardReplica(props.anchor).el;
  // 面板的定位参照是内边距盒：往外挪一个边框宽，拷贝的左上角才和窗口（边框盒）的左上角对齐。
  Object.assign(copy.style, { left: `${-el.clientLeft}px`, top: `${-el.clientTop}px`, zIndex: '4' });
  el.appendChild(copy);
  replica = copy;
  copy.animate(frames, { ...timing, easing: 'linear', fill: 'both' });
};

let resizer: ResizeObserver | null = null;
const open = async () => {
  place();
  await nextTick();
  place();
  await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
  const el = panel.value;
  if (!el || closing) return;
  place();
  const parts = layers(el);
  let morph: Animation;
  if (lessMotion()) {
    morph = el.animate([{ opacity: NEARLY_HIDDEN }, { opacity: 1 }], { duration: 160, easing: 'ease-out', fill: 'backwards' });
    veil.value?.animate([{ opacity: NEARLY_HIDDEN }, { opacity: 1 }], { duration: 160, easing: 'ease-out', fill: 'backwards' });
  } else {
    const from = anchorRect() ?? { left: placed.left + placed.width / 2 - 20, top: placed.top, width: 40, height: 40 };
    const timing = { duration: OPEN_MS, fill: 'backwards' as const };
    morph = el.animate(popoverFrames(from, placed, placed, POPOVER_RADIUS, SHADOW_BLEED), { ...timing, easing: OPEN_EASE });
    // 拷贝前三成淡掉、内容四成起淡入：中间只有一块玻璃在长，字不在小框里和按钮叠成重影。
    attachReplica(el, [{ opacity: 1 }, { opacity: 0, offset: 0.3 }, { opacity: 0 }], timing);
    for (const part of parts) part.animate([{ opacity: NEARLY_HIDDEN }, { opacity: NEARLY_HIDDEN, offset: 0.4 }, { opacity: 1 }], { ...timing, easing: 'ease-out' });
    // 内容落定时整体上浮 6px（和淡入同一段）。
    for (const item of el.querySelectorAll<HTMLElement>('[data-pop-item]')) {
      item.animate([{ transform: 'translateY(6px)' }, { transform: 'translateY(6px)', offset: 0.4 }, { transform: 'none' }],
        { ...timing, easing: 'cubic-bezier(.2, .9, .25, 1)' });
    }
    veil.value?.animate([{ opacity: NEARLY_HIDDEN }, { opacity: 1 }], { ...timing, easing: 'ease-out' });
  }
  // 停在起点（画面上就是那颗按钮）等画面跟得上再放：浮层多半是刚挂上的，第一帧 GPU 正忙，放着的话第一段被吞掉。
  const held = [...el.getAnimations({ subtree: true }), ...(veil.value?.getAnimations() ?? [])];
  for (const animation of held) animation.pause();
  morphing.value = !lessMotion();
  ready.value = true;
  focusables()[0]?.focus({ preventScroll: true });
  await whenFramesSteady(160);
  for (const animation of held) if (animation.playState === 'paused') animation.play();
  void morph.finished.then(() => {
    replica?.remove();
    replica = null;
    morphing.value = false;
    settled.value = true;
    place();
    // 内容长大 / 缩小（准备文件 → 文件卡）：重新摆，位置滑过去。
    resizer = new ResizeObserver(() => { if (!closing && !dragging.value) place(); });
    for (const child of el.children) resizer.observe(child);
  }, () => undefined);
};

/** 拖开的偏移此刻是多少（弹回途中读动画值），并把它定住成行内值、停掉弹回。 */
const freezeDrag = (el: HTMLElement) => {
  const [x = 0, y = 0] = getComputedStyle(el).translate.split(/\s+/).map((v) => Number.parseFloat(v) || 0);
  for (const animation of el.getAnimations()) {
    if ((animation.effect as KeyframeEffect | null)?.getKeyframes().some((frame) => 'translate' in frame)) animation.cancel();
  }
  el.style.translate = `${x}px ${y}px`;
  drag.value = { x, y };
  return { x, y };
};

/** 缩回按钮，放完才通知父组件卸载。 */
const close = (): Promise<void> => {
  if (closing) return closing;
  const el = panel.value;
  closing = (async () => {
    resizer?.disconnect();
    dragging.value = false;
    if (el && ready.value) {
      const offset = freezeDrag(el);
      const timing = { duration: CLOSE_MS, fill: 'forwards' as const };
      const veilNow = veil.value ? Number(getComputedStyle(veil.value).opacity) : 1;
      const parts = layers(el);
      const partsNow = parts.map((part) => Number(getComputedStyle(part).opacity));
      const to = anchorRect();
      const duration = lessMotion() ? 140 : to ? CLOSE_MS : 220;
      let shrink: Animation;
      if (lessMotion() || !to) {
        // 少动效：淡出；按钮不在视口里了：就在最后的位置缩小淡出。
        const { transform, opacity, clipPath } = getComputedStyle(el);
        const now = { transform, opacity, clipPath };
        const frames: Keyframe[] = [{ transform: now.transform, opacity: now.opacity, ...(now.clipPath === 'none' ? {} : { clipPath: now.clipPath }) },
          { transform: lessMotion() ? now.transform : 'scale(.94)', opacity: 0, ...(now.clipPath === 'none' ? {} : { clipPath: now.clipPath }) }];
        for (const animation of el.getAnimations({ subtree: true })) animation.cancel();
        replica?.remove();
        shrink = exemptFromSettle(el.animate(frames, { ...timing, duration, easing: 'ease-in' }));
      } else {
        // 从此刻的样子收：开到一半就是此刻的裁切框，开好了就是整块面板（连投影）。
        // 先抄下值再取消动画：getComputedStyle 是活的，取消以后再读就成了 none（开到一半按 Esc 会先闪一下整块面板）。
        const { transform, clipPath } = getComputedStyle(el);
        const now = { transform, clipPath };
        const seen = now.clipPath === 'none' ? null : visibleWindow(el);
        for (const animation of el.getAnimations({ subtree: true })) animation.cancel();
        replica?.remove();
        replica = null;
        morphing.value = true;
        const box = { ...placed, left: placed.left + offset.x, top: placed.top + offset.y };
        const frames = popoverFrames(seen ?? box, to, box);
        frames[0] = { ...frames[0], transform: now.transform === 'none' ? 'translate(0px, 0px)' : now.transform, clipPath: seen ? now.clipPath : bleedInset() };
        shrink = exemptFromSettle(el.animate(frames, { ...timing, easing: OPEN_EASE }));
        // 收：字先淡掉（前三成），剩一块玻璃缩回去，后半程换成按钮的拷贝。
        parts.forEach((part, i) => exemptFromSettle(part.animate([{ opacity: partsNow[i] }, { opacity: 0, offset: 0.3 }, { opacity: 0 }], { ...timing, easing: 'linear' })));
        attachReplica(el, [{ opacity: 0 }, { opacity: 0, offset: 0.4 }, { opacity: 1, offset: 0.8 }, { opacity: 1 }], timing);
      }
      if (veil.value) {
        for (const animation of veil.value.getAnimations()) animation.cancel();
        exemptFromSettle(veil.value.animate([{ opacity: veilNow }, { opacity: veilNow * 0.88, offset: 0.4 }, { opacity: 0 }], { ...timing, duration, easing: 'linear' }));
      }
      await shrink.finished.catch(() => undefined);
    }
    props.anchor?.focus({ preventScroll: true });
    emit('close');
  })();
  return closing;
};

/* ---------- 抓手：按住拖开，松手弹回 ---------- */
let start = { x: 0, y: 0, dx: 0, dy: 0 };
/** 手指拖出来的偏移（未经橡皮筋）：判断「拖够远 / 甩够快」看的是手，不是被橡皮筋收住的面板。 */
let samples: DragSample[] = [];
const onGripDown = (event: PointerEvent) => {
  const el = panel.value;
  if (event.button !== 0 || closing || !el || !settled.value) return;
  event.preventDefault();
  (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
  // 弹回途中又抓住：从此刻的位置接着拖。
  const now = freezeDrag(el);
  dragging.value = true;
  start = { x: event.clientX, y: event.clientY, dx: now.x, dy: now.y };
  samples = [{ t: event.timeStamp, x: now.x, y: now.y }];
};
const onGripMove = (event: PointerEvent) => {
  if (!dragging.value) return;
  const { left, top, width, height } = placed;
  // 整块留在窗口里的范围内跟手，越出去的部分走橡皮筋。
  const raw = { x: start.dx + event.clientX - start.x, y: start.dy + event.clientY - start.y };
  const x = elastic(raw.x, MARGIN - left, Math.max(MARGIN - left, window.innerWidth - MARGIN - width - left));
  const y = elastic(raw.y, MARGIN - top, Math.max(MARGIN - top, window.innerHeight - MARGIN - height - top));
  drag.value = { x, y };
  samples.push({ t: event.timeStamp, ...raw });
  if (samples.length > 24) samples.splice(0, samples.length - 24);
};
const onGripUp = (event: PointerEvent) => {
  if (!dragging.value) return;
  dragging.value = false;
  (event.currentTarget as HTMLElement).releasePointerCapture?.(event.pointerId);
  const el = panel.value;
  if (!el) return;
  const offset = { ...drag.value };
  const pulled = samples[samples.length - 1]?.y ?? offset.y;
  const velocity = releaseVelocity(samples, event.timeStamp);
  samples = [];
  if (shouldDismiss(pulled, velocity.y)) { void close(); return; }
  if (Math.hypot(offset.x, offset.y) < 0.5) return;
  drag.value = { x: 0, y: 0 };
  el.style.translate = '0px 0px';
  if (lessMotion()) return;
  const { easing, duration } = springBack(SPRINGS.settle, offset, velocity);
  el.animate([{ translate: `${offset.x}px ${offset.y}px` }, { translate: '0px 0px' }], { duration, easing });
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
const onResize = () => { if (settled.value && !closing) place(); };
onMounted(() => {
  window.addEventListener('resize', onResize);
  void open();
});
onBeforeUnmount(() => {
  releaseEscape();
  resizer?.disconnect();
  replica?.remove();
  window.removeEventListener('resize', onResize);
});
defineExpose({ close });
</script>

<template>
  <Teleport to="body">
    <div :class="['pop-layer', { ready }]">
      <div ref="veil" class="pop-veil" aria-hidden="true" @click="close"></div>
      <div ref="panel" :class="['pop-panel', { settled, dragging, morphing }]" role="dialog" aria-modal="true" :aria-labelledby="labelledby"
        :style="{ ...style, translate: `${drag.x}px ${drag.y}px` }" @keydown="onKey">
        <div class="pop-grip" aria-hidden="true"
          @pointerdown="onGripDown" @pointermove="onGripMove" @pointerup="onGripUp" @pointercancel="onGripUp"><i></i></div>
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
/* 面板自己是一块玻璃：底色 + 背景模糊只在面板这一小块上取样。限高，放不下时里面自己滚。
   圆角和 lib/motion/popoverMorph.ts 的 POPOVER_RADIUS 一致：形变的裁切用同一个半径，落地不跳。 */
.pop-panel { position: absolute; display: grid; grid-template-rows: auto minmax(0, 1fr); padding: 0; border: 1px solid var(--mat-glass-line); border-radius: 22px;
  background: var(--mat-glass-strong); -webkit-backdrop-filter: var(--mat-glass-blur); backdrop-filter: var(--mat-glass-blur);
  box-shadow: var(--mat-glass-shadow), 0 30px 60px -30px rgba(0, 0, 0, .7); color: var(--ink); will-change: transform, clip-path; overflow: hidden; }
/* 开好以后，内容变高 / 窗口变化引起的重摆滑过去（拖着的时候不滑）。拖开的 translate 不走过渡：弹回是 WAAPI 的弹簧，
   过渡在层叠里排在动画前面，会把弹簧盖掉。 */
.pop-panel.settled:not(.dragging) { transition: left 340ms cubic-bezier(.2, .8, .2, 1), top 340ms cubic-bezier(.2, .8, .2, 1); }
.pop-panel.morphing { overflow: visible; }
.pop-body { display: grid; gap: 8px; min-height: 0; padding: 2px 16px 16px; overflow: auto; overscroll-behavior: contain; scrollbar-width: thin; }
/* 抓手：顶上一条短横杠，按住拖；悬停时亮一点、光标变成可抓。 */
.pop-grip { display: grid; place-items: center; height: 16px; cursor: grab; touch-action: none; }
.pop-grip i { width: 38px; height: 4px; border-radius: 999px; background: color-mix(in srgb, var(--ink) 18%, transparent); transition: background 160ms ease, width 200ms ease; }
.pop-grip:hover i { width: 46px; background: color-mix(in srgb, var(--ink) 34%, transparent); }
.pop-panel.dragging .pop-grip { cursor: grabbing; }
.pop-panel.dragging .pop-grip i { width: 46px; background: var(--accent); }
@media (prefers-reduced-motion: reduce) { .pop-panel.settled:not(.dragging) { transition: none; } }
</style>
