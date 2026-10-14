/**
 * 舞台左边的牌可以拖（2026-10-08）：写法同收集箱的甩牌（useHandGestures）。
 *
 * - 按下后移动 > 6px 才算拖；没拖就是点（`onTap`）。拖着的牌跟手（rAF 里写 `translate`），按横向速度歪一点。
 *   没有边界：牌跟手指走，拖到锁上、拖出舞台都行（10-09：虚线撒牌区去掉了）。
 * - 松手：往上甩（松手前 90ms 的竖直速度过阈值）且这张牌允许甩 = 甩出去（`onFlick`，
 *   牌接着往上飞出屏幕再算数）。除此之外无论停在哪，都弹回本来的牌位——拖得越远，弹回去越过头的幅度越大
 *   （那段差交给 `onLand` / useCloudPhysics 的 `bounce`）。歪角弹簧回正。
 * - Esc：拖到一半 = 同样弹回牌位。
 * 拖着时 `live` 给出这张牌此刻的位置，线跟着重算。弹回途中的位置不记在这里（记了会和弹簧的位移加两次）。
 */
import { computed, onBeforeUnmount, reactive, ref } from 'vue';
import { reducedMotion, SPRINGS, springCurve } from '../../lib/motion/cards';

const START_PX = 6;
const FLICK_VY = -0.55;
const MAX_TILT = 8;
const offsets = reactive(new Map<string, { x: number; y: number }>());

export interface CloudDragOptions {
  /** 牌位（拖的是它）。 */
  slotOf: (id: string) => HTMLElement | null;
  canFlick: (id: string) => boolean;
  onTap: (id: string, el: HTMLElement) => void;
  onFlick: (id: string) => void;
  /**
   * 松手后牌要回到牌位，此刻比牌位多出 (dx, dy)。舞台把这段差交给「力」（useCloudPhysics）弹回去，
   * 线跟着一起走；不给就用 WAAPI 补一段弹簧。拖得越远，这段差越大，回弹越过头越多。
   */
  onLand?: (id: string, dx: number, dy: number) => void;
  /**
   * 按下时牌如果正弹在半路：把这段位移并进这次拖的起点，免得一按牌就跳回牌位。
   * 真正拖起来的那一帧再 `onTake`，把弹簧位移清掉（已经算进起点了，不能再加一次）。
   */
  grabAt?: (id: string) => { x: number; y: number };
  onTake?: (id: string) => void;
}

export const useCloudDrag = (options: CloudDragOptions) => {
  /** 正在拖的那张：此刻相对本来牌位的偏移（线跟着它重算）。 */
  const live = ref<{ id: string; x: number; y: number } | null>(null);
  /** 最后拖过的那张（压在别的牌上面）。 */
  const lastId = ref<string | null>(null);
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
    const now = performance.now();
    trail = [...trail.filter((p) => now - p.t < 90), { t: now, x: event.clientX, y: event.clientY }];
    pending = { x: start.ox + dx, y: start.oy + dy };
    if (!dragging) {
      dragging = true;
      start.el.classList.add('is-dragging');
      // 和 live 同一轮写上：先清弹簧再公布手指位置，Vue 一次渲染，牌不跳。
      options.onTake?.(start.id);
      write();
      return;
    }
    if (!frame) frame = requestAnimationFrame(write);
  };

  /** 牌从 `from` 落到 `to`（都是相对牌位的偏移）。有 `onLand` 时不把 DOM 先写成终点：Vue 的 translate 若和上一帧相同就不会再写，牌会闪到终点。 */
  const land = (id: string, el: HTMLElement, from: { x: number; y: number }, to: { x: number; y: number }) => {
    const dx = from.x - to.x;
    const dy = from.y - to.y;
    const home = reducedMotion() || (Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5);
    if (home || !options.onLand) el.style.translate = `${to.x}px ${to.y}px`;
    if (home) return;
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
    const at = pending;
    // 只有往上甩才算丢掉这一类。拖到上面再松开，跟拖到别处一样弹回来。
    if (!cancelled && options.canFlick(s.id) && vy < FLICK_VY) {
      live.value = null;
      const fly = reducedMotion() ? null : s.el.animate(
        [{ translate: `${at.x}px ${at.y}px`, rotate: s.el.style.rotate || '0deg', opacity: 1 },
          { translate: `${at.x + (trail.length ? 40 : 0)}px ${at.y - window.innerHeight}px`, rotate: '-18deg', opacity: 0 }],
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
    keepOnTop(s.id, s.el);
    // 松手、Esc 都回本来的牌位。不把停点记下来：记了下一帧会和弹簧位移叠成两倍，牌还会留在外面。
    offsets.delete(s.id);
    land(s.id, s.el, at, { x: 0, y: 0 });
    live.value = null;
    settleTilt(s.el);
  };
  /** 最后拖过的那张压在别的牌上面（弹回的途中也是），直到下一次拖别的牌。 */
  const keepOnTop = (id: string, el: HTMLElement) => {
    lastId.value = id;
    el.classList.add('is-landing');
    window.setTimeout(() => el.classList.remove('is-landing'), 700);
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
    const grabbed = options.grabAt?.(id) ?? { x: 0, y: 0 };
    start = { id, px: event.clientX, py: event.clientY, ox: o.x + grabbed.x, oy: o.y + grabbed.y, el };
    pending = { x: start.ox, y: start.oy };
    trail = [{ t: performance.now(), x: event.clientX, y: event.clientY }];
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onCancel);
    window.addEventListener('keydown', onKey, true);
  };

  onBeforeUnmount(() => end(null, true));

  /** 牌的多少变了（甩掉一张、加回一类）：重新撒一遍，拖过的位置作废（由调用方用 FLIP 挪过去）。 */
  const resetOffsets = () => { offsets.clear(); lastId.value = null; };
  /** 有没有哪张牌被拖离了本来的牌位（舞台据此显示「复原」）。 */
  const moved = computed(() => [...offsets.values()].some((o) => Math.abs(o.x) + Math.abs(o.y) > 1));

  return { live, lastId, moved, offsetOf, onDown, resetOffsets, dragging: () => dragging };
};
