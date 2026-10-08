/**
 * 舞台左边的牌可以拖（2026-10-08）：写法同收集箱的甩牌（useHandGestures）。
 *
 * - 按下后移动 > 6px 才算拖；没拖就是点（`onTap`）。拖着的牌跟手（rAF 里写 `translate`），按横向速度歪一点。
 * - 松手：往上甩（松手前 90ms 的竖直速度过阈值，或拖到撒牌区上沿外）且这张牌允许甩 = 甩出去（`onFlick`，
 *   牌接着往上飞出屏幕再算数）；否则就停在松手的地方（记下偏移，回来还在），歪角弹簧回正。
 * - Esc：拖到一半 = 原路放回。
 * 位置是「本来的牌位 + 偏移」，偏移按牌的 id 记在模块里（只在这次运行里记，不落库）。拖着时 `live`
 * 给出这张牌此刻的位置，线跟着重算；其余时候线不动。
 */
import { onBeforeUnmount, reactive, ref } from 'vue';
import { reducedMotion, SPRINGS, springCurve } from '../../lib/motion/cards';

const START_PX = 6;
const FLICK_VY = -0.55;
const MAX_TILT = 8;
const offsets = reactive(new Map<string, { x: number; y: number }>());

export interface CloudDragOptions {
  /** 牌位（拖的是它）。 */
  slotOf: (id: string) => HTMLElement | null;
  /** 牌的本来位置（舞台坐标，不含偏移）和撒牌区，用来夹住松手位置。 */
  restOf: (id: string) => { x: number; y: number } | null;
  bounds: () => { x: number; y: number; width: number; height: number; cardW: number; cardH: number };
  canFlick: (id: string) => boolean;
  onTap: (id: string, el: HTMLElement) => void;
  onFlick: (id: string) => void;
  /**
   * 松手后牌没停在手指的地方（出了撒牌区被夹回来、Esc 放回原处）：牌此刻比它要停的位置多出 (dx, dy)。
   * 舞台把这段差交给「力」（useCloudPhysics）弹回去，线跟着一起走；不给就用 WAAPI 补一段弹簧。
   */
  onLand?: (id: string, dx: number, dy: number) => void;
}

export const useCloudDrag = (options: CloudDragOptions) => {
  /** 正在拖的那张：此刻相对本来牌位的偏移（线跟着它重算）。 */
  const live = ref<{ id: string; x: number; y: number } | null>(null);
  let start: { id: string; px: number; py: number; ox: number; oy: number; el: HTMLElement } | null = null;
  let dragging = false;
  let frame = 0;
  let pending = { x: 0, y: 0 };
  let trail: Array<{ t: number; x: number; y: number }> = [];

  const offsetOf = (id: string) => offsets.get(id) ?? { x: 0, y: 0 };

  const write = () => {
    frame = 0;
    if (!start) return;
    const vx = trail.length > 1 ? (trail[trail.length - 1]!.x - trail[0]!.x) / Math.max(1, trail[trail.length - 1]!.t - trail[0]!.t) : 0;
    start.el.style.translate = `${pending.x}px ${pending.y}px`;
    start.el.style.rotate = `${Math.max(-MAX_TILT, Math.min(MAX_TILT, vx * 6))}deg`;
    live.value = { id: start.id, x: pending.x, y: pending.y };
  };

  const onMove = (event: PointerEvent) => {
    if (!start) return;
    const dx = event.clientX - start.px;
    const dy = event.clientY - start.py;
    if (!dragging && Math.hypot(dx, dy) < START_PX) return;
    if (!dragging) {
      dragging = true;
      start.el.classList.add('is-dragging');
    }
    const now = performance.now();
    trail = [...trail.filter((p) => now - p.t < 90), { t: now, x: event.clientX, y: event.clientY }];
    pending = { x: start.ox + dx, y: start.oy + dy };
    if (!frame) frame = requestAnimationFrame(write);
  };

  /** 牌从 `from` 落到 `to`（都是相对牌位的偏移）。 */
  const land = (id: string, el: HTMLElement, from: { x: number; y: number }, to: { x: number; y: number }) => {
    el.style.translate = `${to.x}px ${to.y}px`;
    const dx = from.x - to.x;
    const dy = from.y - to.y;
    if (reducedMotion() || (Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5)) return;
    if (options.onLand) { options.onLand(id, dx, dy); return; }
    const { easing, duration } = springCurve(SPRINGS.settle);
    el.animate([{ translate: `${from.x}px ${from.y}px` }, { translate: `${to.x}px ${to.y}px` }], { duration, easing });
  };

  const settleTilt = (el: HTMLElement) => {
    const tilt = el.style.rotate || '0deg';
    el.style.rotate = '';
    if (reducedMotion()) return;
    const { easing, duration } = springCurve(SPRINGS.settle);
    el.animate([{ rotate: tilt }, { rotate: '0deg' }], { duration, easing });
  };

  const end = (event: PointerEvent | null, cancelled: boolean) => {
    window.removeEventListener('pointermove', onMove);
    window.removeEventListener('pointerup', onUp);
    window.removeEventListener('pointercancel', onCancel);
    window.removeEventListener('keydown', onKey, true);
    cancelAnimationFrame(frame);
    frame = 0;
    const s = start;
    start = null;
    if (!s) return;
    if (!dragging) {
      if (!cancelled && event) options.onTap(s.id, s.el);
      return;
    }
    dragging = false;
    s.el.classList.remove('is-dragging');
    const vy = trail.length > 1 ? (trail[trail.length - 1]!.y - trail[0]!.y) / Math.max(1, trail[trail.length - 1]!.t - trail[0]!.t) : 0;
    const rest = options.restOf(s.id);
    const b = options.bounds();
    const top = (rest?.y ?? 0) + pending.y;
    if (!cancelled && options.canFlick(s.id) && (vy < FLICK_VY || top < b.y - b.cardH * 0.4)) {
      live.value = null;
      const fly = reducedMotion() ? null : s.el.animate(
        [{ translate: `${pending.x}px ${pending.y}px`, rotate: s.el.style.rotate || '0deg', opacity: 1 },
          { translate: `${pending.x + (trail.length ? 40 : 0)}px ${pending.y - window.innerHeight}px`, rotate: '-18deg', opacity: 0 }],
        { duration: 420, easing: 'cubic-bezier(.3, .2, .6, 1)', fill: 'forwards' },
      );
      void (fly?.finished.catch(() => undefined) ?? Promise.resolve()).then(() => {
        offsets.delete(s.id);
        s.el.style.translate = '';
        s.el.style.rotate = '';
        options.onFlick(s.id);
        fly?.cancel();
      });
      return;
    }
    if (cancelled) {
      land(s.id, s.el, pending, { x: s.ox, y: s.oy });
      live.value = null;
      settleTilt(s.el);
      return;
    }
    // 停在松手的地方：夹在撒牌区里（留半张牌的余量）。
    const x = Math.min(b.x + b.width - b.cardW * 0.5, Math.max(b.x - b.cardW * 0.5, (rest?.x ?? 0) + pending.x)) - (rest?.x ?? 0);
    const y = Math.min(b.y + b.height - b.cardH * 0.5, Math.max(b.y - b.cardH * 0.2, top)) - (rest?.y ?? 0);
    offsets.set(s.id, { x, y });
    // 松手的地方出了撒牌区：从松手处弹回夹住的位置，不一下跳过去（10-08 H14「拖动是突变的」）。
    land(s.id, s.el, pending, { x, y });
    live.value = null;
    settleTilt(s.el);
  };
  const onUp = (event: PointerEvent) => end(event, false);
  const onCancel = () => end(null, true);
  const onKey = (event: KeyboardEvent) => {
    if (event.key !== 'Escape' || !dragging) return;
    event.preventDefault();
    event.stopPropagation();
    end(null, true);
  };

  const onDown = (event: PointerEvent, id: string) => {
    if (event.button !== 0 || start) return;
    const el = options.slotOf(id);
    if (!el) return;
    const o = offsetOf(id);
    start = { id, px: event.clientX, py: event.clientY, ox: o.x, oy: o.y, el };
    pending = { x: o.x, y: o.y };
    trail = [{ t: performance.now(), x: event.clientX, y: event.clientY }];
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onCancel);
    window.addEventListener('keydown', onKey, true);
  };

  onBeforeUnmount(() => end(null, true));

  /** 牌的多少变了（甩掉一张、加回一类）：重新撒一遍，拖过的位置作废（由调用方用 FLIP 挪过去）。 */
  const resetOffsets = () => offsets.clear();

  return { live, offsetOf, onDown, resetOffsets, dragging: () => dragging };
};
