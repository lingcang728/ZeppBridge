/**
 * 收集箱铺开后的一手牌：拖出去、抛走、补位（第三轮精修 A5，从 CollectionBox.vue 拆出来）。
 *
 * 用户 10-07 录屏：拖动时一帧动一帧不动（约 15 fps），松手后 260ms 往上淡掉，其余的牌下一帧瞬移补位。
 * - 拖：pointermove 只记坐标，rAF 里才写 `translate` + 按横向速度歪 ±8°（`rotate`）；拖着的牌放大一点、阴影抬高；
 *   往上越过 90px，牌变半透明、底下出现「松手拿出去」；没越过松手弹簧回位。
 * - 抛：越过阈值松手，按**松手速度**继续往上飞（惯性 + 旋转）、淡掉；×、整把移除也走这条。
 * - 补位：删之前记下每张牌的位置 / 角度 / 宽度，删之后用 FLIP 弹簧挪到新位置，不再瞬移。
 * 只动 translate / rotate / scale / transform / opacity。
 */
import { nextTick } from 'vue';
import { reducedMotion, settled, SPRINGS, springCurve } from '../lib/motion/cards';

const THRESHOLD = 90;
const MAX_TILT = 8;

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

  /** 往上抛走（带速度就接着这个速度飞），然后删掉、补位。 */
  const fling = async (els: HTMLElement[], ids: string[], velocity = { x: 0, y: -1.2 }, from = { x: 0, y: 0, tilt: 0 }) => {
    if (!reducedMotion()) {
      const vy = Math.min(-0.8, velocity.y);
      const flights = els.map((el, i) => {
        const dist = Math.max(260, -vy * 300);
        const tx = from.x + velocity.x * 180;
        const spin = from.tilt + Math.sign(velocity.x || 1) * 10;
        return el.animate(
          [{ translate: `${from.x}px ${from.y}px`, rotate: `${from.tilt}deg`, opacity: 1 },
            { translate: `${tx.toFixed(1)}px ${(from.y - dist).toFixed(1)}px`, rotate: `${spin.toFixed(1)}deg`, opacity: 0 }],
          { duration: 320, delay: i * 24, easing: 'cubic-bezier(.2, .6, .4, 1)', fill: 'both' },
        );
      });
      await settled(flights);
    }
    await removeWithFlip(ids);
  };

  /* ---------- 拖 ---------- */
  let drag: {
    el: HTMLElement; id: string; pointer: number; x0: number; y0: number; x: number; y: number;
    moved: boolean; frame: number; samples: Array<{ x: number; y: number; t: number }>; tilt: number;
  } | null = null;

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
    drag.el.classList.toggle('will-remove', -dy > THRESHOLD);
  };

  const dragStart = (event: PointerEvent, id: string) => {
    if (event.button !== 0 || options.blocked() || (event.target as Element).closest('.hand-remove')) return;
    const el = event.currentTarget as HTMLElement;
    drag = { el, id, pointer: event.pointerId, x0: event.clientX, y0: event.clientY, x: event.clientX, y: event.clientY, moved: false, frame: 0, samples: [{ x: event.clientX, y: event.clientY, t: event.timeStamp }], tilt: 0 };
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
  };
  const dragEnd = (event: PointerEvent) => {
    if (!drag || event.pointerId !== drag.pointer) return;
    const d = drag;
    drag = null;
    cancelAnimationFrame(d.frame);
    d.el.classList.remove('dragging');
    if (!d.moved) { d.el.style.translate = ''; d.el.style.rotate = ''; return; }
    const dx = event.clientX - d.x0;
    const dy = event.clientY - d.y0;
    const recent = d.samples.filter((s) => event.timeStamp - s.t < 90);
    const first = recent[0] ?? d.samples[0]!;
    const dt = Math.max(1, event.timeStamp - first.t);
    const velocity = { x: (event.clientX - first.x) / dt, y: (event.clientY - first.y) / dt };
    d.el.style.translate = '';
    d.el.style.rotate = '';
    if (-dy > THRESHOLD) {
      void fling([d.el], [d.id], velocity, { x: dx, y: dy, tilt: d.tilt });
      return;
    }
    d.el.classList.remove('will-remove');
    const { easing, duration } = springCurve(SPRINGS.settle);
    d.el.animate([{ translate: `${dx}px ${dy}px`, rotate: `${d.tilt}deg` }, { translate: '0px 0px', rotate: '0deg' }], { duration, easing });
  };

  return { dragStart, dragMove, dragEnd, fling, removeWithFlip };
};
