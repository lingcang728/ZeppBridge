/**
 * 收集箱铺开后的一手牌：甩出去、补位（第三轮精修 A5 拆出来；第四轮 1A·A12 改成「甩牌」）。
 *
 * - 拖：pointermove 只记坐标，rAF 里才写 `translate` + 按横向速度歪 ±8°（`rotate`）；拖着的牌放大一点、投影加深；
 *   动得快时加一点运动模糊（只分两档、只在动的那张牌上开，停下就清——不逐帧改模糊半径）。
 * - 甩：松手时**往上的速度**过阈值（或已经拖到屏幕上沿附近）= 拿出去：按松手速度接着往上飞出屏幕、带旋转，
 *   离屏后才删（用户 10-07 拍板，替代第三轮「拖过 90px 松手拿出去」）；没甩出去弹簧回位。
 * - 补位：删之前记下每张牌的位置 / 角度 / 宽度，删之后用 FLIP 弹簧挪到新位置，不再瞬移。
 * 只动 translate / rotate / scale / transform / opacity（模糊只在动的那一张上、两档静态值）。
 */
import { nextTick } from 'vue';
import { reducedMotion, settled, SPRINGS, springCurve } from '../lib/motion/cards';

/** 往上甩：松手前 90ms 的竖直速度（px/ms，负 = 往上）。 */
const FLICK_VY = -0.55;
/** 拖到离屏幕上沿这么近也算拿出去（慢慢拖出去的人）。 */
const TOP_EDGE = 56;
const MAX_TILT = 8;
/** 运动模糊两档：速度（px/ms）过这两个值分别开 0.6px / 1.2px。 */
const BLUR_STEPS: Array<[number, string]> = [[2.2, 'blur(1.2px)'], [1.1, 'blur(.6px)']];

interface Placed { left: number; top: number; width: number; deg: number }

const placedOf = (el: HTMLElement): Placed => ({
  left: Number.parseFloat(el.style.left) || 0,
  top: Number.parseFloat(el.style.top) || 0,
  width: Number.parseFloat(el.style.width) || el.offsetWidth,
  deg: Number(/rotate\(([-\d.]+)deg\)/.exec(el.style.transform)?.[1] ?? 0),
});

export const useHandGestures = (options: {
  cards: () => HTMLElement[];
  /** 真的从箱子里删掉这几张（`id` = `key@date`）。 */
  remove: (ids: string[]) => void;
  /** 删完以后（箱子空了就收起铺开层）。 */
  afterRemove: () => void;
  blocked: () => boolean;
}) => {
  /** 删之前记下位置，删之后从旧位置弹簧挪到新位置。 */
  const removeWithFlip = async (ids: string[]) => {
    const before = new Map(options.cards().map((el) => [el.dataset.id!, placedOf(el)]));
    options.remove(ids);
    await nextTick();
    options.afterRemove();
    if (reducedMotion()) return;
    const { easing, duration } = springCurve(SPRINGS.settle);
    for (const el of options.cards()) {
      const old = before.get(el.dataset.id!);
      if (!old) continue;
      const now = placedOf(el);
      const dx = old.left + old.width / 2 - (now.left + now.width / 2);
      const dy = old.top - now.top + (old.width - now.width) * 0.7;
      if (Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5 && Math.abs(old.deg - now.deg) < 0.05) continue;
      el.animate(
        [{ translate: `${dx.toFixed(1)}px ${dy.toFixed(1)}px`, scale: String((old.width / Math.max(now.width, 1)).toFixed(3)), transform: `rotate(${old.deg}deg)` },
          { translate: '0px 0px', scale: '1', transform: `rotate(${now.deg}deg)` }],
        { duration, easing },
      );
    }
  };

  /** 往上甩出屏幕（带速度就接着这个速度飞，离屏才算完），然后删掉、补位。 */
  const fling = async (els: HTMLElement[], ids: string[], velocity = { x: 0, y: -1.2 }, from = { x: 0, y: 0, tilt: 0 }) => {
    if (!reducedMotion()) {
      const vy = Math.min(-0.9, velocity.y);
      const flights = els.map((el, i) => {
        // 飞到牌的下沿越过屏幕上沿再多一点：真的「出去了」。
        const bottom = el.getBoundingClientRect().bottom;
        const dist = Math.max(bottom + 40, -vy * 260);
        const duration = Math.max(260, Math.min(520, dist / Math.max(1.4, -vy)));
        const tx = from.x + velocity.x * duration * 0.6;
        const spin = from.tilt + Math.sign(velocity.x || (i % 2 ? -1 : 1)) * (14 + Math.min(16, Math.abs(velocity.x) * 12));
        return el.animate(
          [{ translate: `${from.x}px ${from.y}px`, rotate: `${from.tilt}deg`, opacity: 1 },
            { opacity: 1, offset: 0.8 },
            { translate: `${tx.toFixed(1)}px ${(from.y - dist).toFixed(1)}px`, rotate: `${spin.toFixed(1)}deg`, opacity: 0 }],
          { duration, delay: i * 24, easing: 'cubic-bezier(.2, .55, .35, 1)', fill: 'both' },
        );
      });
      await settled(flights);
    }
    await removeWithFlip(ids);
  };

  /* ---------- 拖 ---------- */
  let drag: {
    el: HTMLElement; id: string; pointer: number; x0: number; y0: number; x: number; y: number;
    moved: boolean; frame: number; samples: Array<{ x: number; y: number; t: number }>; tilt: number; blur: string; idle: number;
  } | null = null;
  /** 刚松手的那一下是不是拖（拖完浏览器还会补一个 click，别把它当成「点开」）。 */
  let dragged = false;
  const consumeDrag = (): boolean => { const was = dragged; dragged = false; return was; };

  const paint = () => {
    if (!drag) return;
    drag.frame = 0;
    const dx = drag.x - drag.x0;
    const dy = drag.y - drag.y0;
    const s = drag.samples;
    const a = s[Math.max(0, s.length - 4)]!;
    const b = s[s.length - 1]!;
    const vx = b.t > a.t ? (b.x - a.x) / (b.t - a.t) : 0;
    drag.tilt = Math.max(-MAX_TILT, Math.min(MAX_TILT, vx * 9));
    drag.el.style.translate = `${dx.toFixed(1)}px ${dy.toFixed(1)}px`;
    drag.el.style.rotate = `${drag.tilt.toFixed(2)}deg`;
    const vy = b.t > a.t ? (b.y - a.y) / (b.t - a.t) : 0;
    const speed = Math.hypot(vx, vy);
    const blur = BLUR_STEPS.find(([min]) => speed >= min)?.[1] ?? '';
    if (drag.blur !== blur) { drag.blur = blur; drag.el.style.setProperty('--motion-blur', blur || 'none'); }
  };

  const dragStart = (event: PointerEvent, id: string) => {
    if (event.button !== 0 || options.blocked() || (event.target as Element).closest('.hand-remove')) return;
    const el = event.currentTarget as HTMLElement;
    dragged = false;
    drag = { el, id, pointer: event.pointerId, x0: event.clientX, y0: event.clientY, x: event.clientX, y: event.clientY, moved: false, frame: 0, samples: [{ x: event.clientX, y: event.clientY, t: event.timeStamp }], tilt: 0, blur: '', idle: 0 };
    el.setPointerCapture(event.pointerId);
  };
  const dragMove = (event: PointerEvent) => {
    if (!drag || event.pointerId !== drag.pointer) return;
    drag.x = event.clientX;
    drag.y = event.clientY;
    drag.samples.push({ x: event.clientX, y: event.clientY, t: event.timeStamp });
    if (drag.samples.length > 8) drag.samples.shift();
    if (!drag.moved) {
      if (Math.hypot(drag.x - drag.x0, drag.y - drag.y0) < 6) return;
      drag.moved = true;
      drag.el.classList.add('dragging');
    }
    if (!drag.frame) drag.frame = requestAnimationFrame(paint);
    // 手停住了（不再有 pointermove）：90ms 后把运动模糊清掉。
    clearTimeout(drag.idle);
    const d = drag;
    d.idle = window.setTimeout(() => { if (drag === d && d.blur) { d.blur = ''; d.el.style.setProperty('--motion-blur', 'none'); } }, 90);
  };
  const dragEnd = (event: PointerEvent) => {
    if (!drag || event.pointerId !== drag.pointer) return;
    const d = drag;
    drag = null;
    cancelAnimationFrame(d.frame);
    clearTimeout(d.idle);
    d.el.classList.remove('dragging');
    d.el.style.removeProperty('--motion-blur');
    if (!d.moved) { d.el.style.translate = ''; d.el.style.rotate = ''; return; }
    dragged = true;
    const dx = event.clientX - d.x0;
    const dy = event.clientY - d.y0;
    const recent = d.samples.filter((s) => event.timeStamp - s.t < 90);
    const first = recent[0] ?? d.samples[0]!;
    const dt = Math.max(1, event.timeStamp - first.t);
    const velocity = { x: (event.clientX - first.x) / dt, y: (event.clientY - first.y) / dt };
    const nearTop = dy < 0 && d.el.getBoundingClientRect().top < TOP_EDGE;
    d.el.style.translate = '';
    d.el.style.rotate = '';
    if (velocity.y < FLICK_VY || nearTop) {
      void fling([d.el], [d.id], velocity, { x: dx, y: dy, tilt: d.tilt });
      return;
    }
    const { easing, duration } = springCurve(SPRINGS.settle);
    d.el.animate([{ translate: `${dx}px ${dy}px`, rotate: `${d.tilt}deg` }, { translate: '0px 0px', rotate: '0deg' }], { duration, easing });
  };

  return { dragStart, dragMove, dragEnd, fling, removeWithFlip, consumeDrag };
};
