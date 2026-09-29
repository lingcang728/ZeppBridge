import { onBeforeUnmount, onMounted, ref, type Ref } from 'vue';
import {
  RISE_IN_FRAMES,
  dragFrame,
  flingOutFrames,
  releaseDirection,
} from '../lib/deck/physics';

/**
 * 卡叠展开态的手势状态机：拖动 → 跟手倾斜 → 松手判定 → 甩出 / 弹回 → 下一张浮上来。
 *
 * 照 MouseInsight 的做法管三件容易出错的事：
 *  - epoch：任何复位（失焦、改尺寸、切后台、按键）都让进行中的动画作废，
 *    旧动画的 finished 回来时发现 epoch 变了就什么都不做，不会把状态改回去；
 *  - 排队：动画进行中再按「下一张」只记一个方向，结束后接着翻，不会叠出一串；
 *  - 打断：甩出 / 浮上来的半路再按住卡头，动画立刻作废，卡回到手里接着拖；
 *  - 松手前先清掉 drag 再释放指针捕获，lostpointercapture 就不会把正常的松手当成取消。
 */
export interface CardDeckGesture {
  stage: Ref<HTMLElement | null>;
  card: Ref<HTMLElement | null>;
  /** 翻到相邻的一张：由调用方换内容（通常是改路由），返回时新内容已经渲染。 */
  step: (direction: -1 | 1) => Promise<void>;
  reducedMotion: () => boolean;
}

type Drag = { id: number; x: number; y: number; lastX: number; lastY: number; lastTime: number; velocity: number; dx: number; dy: number };

export const useCardDeck = ({ stage, card, step, reducedMotion }: CardDeckGesture) => {
  const dragging = ref(false);
  const busy = ref(false);
  let drag: Drag | null = null;
  let frame = 0;
  let epoch = 0;
  let queued: -1 | 0 | 1 = 0;
  const animations = new Set<Animation>();

  const setVars = (dx: number, dy: number, progress: number) => {
    const el = stage.value;
    if (!el) return;
    el.style.setProperty('--deck-dx', `${dx}px`);
    el.style.setProperty('--deck-dy', `${dy}px`);
    el.style.setProperty('--deck-p', String(progress));
  };

  const clearInline = () => {
    const el = card.value;
    if (el) {
      el.style.removeProperty('transform');
      el.style.removeProperty('filter');
      el.style.removeProperty('opacity');
    }
    const host = stage.value;
    if (host) {
      host.style.removeProperty('--deck-dx');
      host.style.removeProperty('--deck-dy');
      host.style.removeProperty('--deck-p');
    }
  };

  const reset = () => {
    epoch += 1;
    const previous = drag;
    drag = null;
    dragging.value = false;
    if (previous && card.value?.hasPointerCapture(previous.id)) card.value.releasePointerCapture(previous.id);
    cancelAnimationFrame(frame);
    frame = 0;
    for (const animation of animations) animation.cancel();
    animations.clear();
    clearInline();
    busy.value = false;
    queued = 0;
  };

  const animate = async (el: HTMLElement | null, frames: Keyframe[], duration: number) => {
    if (!el || reducedMotion()) return;
    const animation = el.animate(frames, { duration, easing: 'cubic-bezier(.22,.75,.25,1)', fill: 'forwards' });
    animations.add(animation);
    try {
      await animation.finished;
    } catch {
      // 被复位取消。
    }
  };

  const width = () => card.value?.clientWidth ?? stage.value?.clientWidth ?? 800;

  const paint = () => {
    frame = 0;
    if (!drag || !card.value) return;
    const next = dragFrame(drag, width(), reducedMotion());
    card.value.style.transform = next.transform;
    card.value.style.filter = next.filter;
    setVars(next.dx, next.dy, next.progress);
  };

  const cycle = async (direction: -1 | 1, fromDrag = false, vertical = false) => {
    if (busy.value) {
      queued = direction;
      return;
    }
    busy.value = true;
    const current = epoch;
    const from = fromDrag ? card.value?.style.transform ?? '' : 'none';
    await animate(card.value, flingOutFrames(direction, width(), from, vertical), 220);
    if (current !== epoch) return;
    for (const animation of animations) animation.cancel();
    animations.clear();
    clearInline();
    await step(direction);
    if (current !== epoch) return;
    await animate(card.value, RISE_IN_FRAMES, 240);
    if (current !== epoch) return;
    for (const animation of animations) animation.cancel();
    animations.clear();
    busy.value = false;
    const follow = queued;
    queued = 0;
    if (follow) void cycle(follow);
  };

  const INTERACTIVE = 'button, a, input, select, textarea, [role="switch"], [role="radiogroup"], [role="combobox"], [contenteditable]';

  const onPointerDown = (event: PointerEvent) => {
    if (event.button !== 0 || !event.isPrimary || !card.value) return;
    if ((event.target as Element).closest(INTERACTIVE)) return;
    reset();
    drag = {
      id: event.pointerId, x: event.clientX, y: event.clientY, lastX: event.clientX, lastY: event.clientY,
      lastTime: event.timeStamp, velocity: 0, dx: 0, dy: 0,
    };
    // 按住卡头拖的时候不许顺带选中字：没有这一句，拖出卡头以后页面标题会被刷成一片蓝。
    event.preventDefault();
    card.value.setPointerCapture(event.pointerId);
  };

  const onPointerMove = (event: PointerEvent) => {
    if (!drag || event.pointerId !== drag.id) return;
    if (!(event.buttons & 1)) { reset(); return; }
    const elapsed = event.timeStamp - drag.lastTime;
    if (elapsed > 0) {
      const signed = Math.abs(event.clientX - drag.lastX) >= Math.abs(event.clientY - drag.lastY)
        ? event.clientX - drag.lastX
        : event.clientY - drag.lastY;
      drag.velocity = signed / elapsed;
    }
    drag.lastX = event.clientX;
    drag.lastY = event.clientY;
    drag.lastTime = event.timeStamp;
    drag.dx = event.clientX - drag.x;
    drag.dy = event.clientY - drag.y;
    if (!dragging.value && Math.hypot(drag.dx, drag.dy) > 4) dragging.value = true;
    if (!frame) frame = requestAnimationFrame(paint);
  };

  const onPointerUp = (event: PointerEvent) => {
    if (!drag || event.pointerId !== drag.id) return;
    cancelAnimationFrame(frame);
    drag.dx = event.clientX - drag.x;
    drag.dy = event.clientY - drag.y;
    paint();
    const finished = drag;
    drag = null; // 先清掉，释放捕获时的 lostpointercapture 才不会被当成取消。
    dragging.value = false;
    if (card.value?.hasPointerCapture(event.pointerId)) card.value.releasePointerCapture(event.pointerId);
    const direction = releaseDirection({
      dx: finished.dx,
      dy: finished.dy,
      velocity: finished.velocity,
      sinceLastMove: event.timeStamp - finished.lastTime,
      width: width(),
    });
    if (direction !== 0) {
      void cycle(direction, true, Math.abs(finished.dy) > Math.abs(finished.dx));
      return;
    }
    const current = epoch;
    busy.value = true;
    void animate(card.value, [
      { transform: card.value?.style.transform || 'none' },
      { transform: 'none' },
    ], 160).then(() => {
      if (current !== epoch) return;
      for (const animation of animations) animation.cancel();
      animations.clear();
      clearInline();
      busy.value = false;
    });
  };

  const onPointerCancel = () => { if (drag) reset(); };

  const onVisibility = () => { if (document.hidden) reset(); };
  onMounted(() => {
    window.addEventListener('blur', reset);
    window.addEventListener('resize', reset);
    document.addEventListener('visibilitychange', onVisibility);
  });
  onBeforeUnmount(() => {
    reset();
    window.removeEventListener('blur', reset);
    window.removeEventListener('resize', reset);
    document.removeEventListener('visibilitychange', onVisibility);
  });

  return { dragging, busy, cycle, reset, onPointerDown, onPointerMove, onPointerUp, onPointerCancel };
};
