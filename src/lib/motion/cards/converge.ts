/**
 * 汇聚（2026-10-08 交给 AI 横向舞台）：左边的牌抖两下，沿各自那根线飞进中间的门锁；
 * 文件备好以后，一张牌从锁里沿右边那束线长出来，落成回执牌。
 *
 * 和 `gather.ts` 同一种做法：每张牌拷一份挂在 body 上、fixed 定在原位，真牌同一个任务里隐身；
 * 拷贝只动 transform / opacity。路径是线上取的点（`threads.ts` 的 `sampleStrand`），写成多段关键帧，
 * 不用 `offset-path`（上不了合成器）。
 * 半路收回 `scatter`：从此刻的计算样式原路飞回（`animateFromNow`），落定那一帧真牌露出来。
 * 减少动效时不飞：直接 resolve，回执牌淡入。
 */
import type { Pt } from '../../aiTask/threads';
import { CLOSE_EASE, OPEN_EASE } from '../timing';
import { animateFromNow } from './reversible';
import { lidClose, lidOpen } from './box';
import { reducedMotion, settled, SPRINGS, springCurve } from './spring';

const SHAKE_MS = 240;
const SHAKE_STAGGER = 40;
const FLY_MS = 640;
const FLY_STAGGER = 55;
const BACK_MS = 440;

export interface Convergence {
  /** 抖、飞进锁。被 `scatter` 打断时提前结束。 */
  gather: () => Promise<void>;
  /** 从此刻原路飞回，真牌露出来。 */
  scatter: () => Promise<void>;
  /** 汇聚成功：拷贝收掉、真牌在原位淡回来。 */
  finish: () => void;
}

/**
 * `cards`：要飞的牌（牌面元素）；`paths`：每张牌从它的牵引点到锁的点列（视口坐标，和 `cards` 一一对应）；
 * `lock`：锁（吸一下）。
 */
export const convergeCards = (cards: HTMLElement[], paths: Pt[][], lock: HTMLElement | null): Convergence => {
  if (reducedMotion() || !cards.length) return { gather: async () => undefined, scatter: async () => undefined, finish: () => undefined };
  const rects = cards.map((card) => card.getBoundingClientRect());
  const hidden = cards.map((card) => card.animate([{ opacity: 0 }, { opacity: 0 }], { duration: 1, fill: 'forwards' }));
  const clones = cards.map((card, i) => {
    const rect = rects[i]!;
    const clone = card.cloneNode(true) as HTMLElement;
    clone.setAttribute('aria-hidden', 'true');
    // 牌宽是外层牌位给的变量：拷贝脱离牌位后要自己带上，不然字号回落。
    clone.style.setProperty('--card-w', `${rect.width}px`);
    Object.assign(clone.style, {
      position: 'fixed', left: `${rect.left}px`, top: `${rect.top}px`, width: `${rect.width}px`, height: `${rect.height}px`,
      margin: '0', zIndex: String(1800 + i), pointerEvents: 'none', animation: 'none', transformOrigin: '100% 50%',
    });
    document.body.appendChild(clone);
    return clone;
  });
  let flying: Animation[] = [];
  let stopped = false;

  const flightFrames = (i: number): Keyframe[] => {
    const rect = rects[i]!;
    const points = paths[i] ?? [];
    const start = points[0] ?? { x: rect.right, y: rect.top + rect.height / 2 };
    const n = Math.max(1, points.length - 1);
    return points.map((p, k) => {
      const t = k / n;
      const scale = 1 - t * 0.86;
      return {
        offset: t,
        transform: `translate(${(p.x - start.x).toFixed(1)}px, ${(p.y - start.y).toFixed(1)}px) rotate(${(-6 * (1 - t)).toFixed(1)}deg) scale(${scale.toFixed(3)})`,
        opacity: t > 0.86 ? 1 - (t - 0.86) / 0.14 : 1,
      };
    });
  };

  const cleanup = () => {
    for (const clone of clones) clone.remove();
    for (const animation of hidden) animation.cancel();
  };

  return {
    gather: async () => {
      const shakes = clones.map((clone, i) => clone.animate(
        [{ transform: 'none' }, { transform: 'rotate(3deg)' }, { transform: 'rotate(-3deg)' }, { transform: 'rotate(2deg)' }, { transform: 'none' }],
        { duration: SHAKE_MS, delay: i * SHAKE_STAGGER, easing: 'ease-in-out' },
      ));
      flying = shakes;
      await settled(shakes);
      if (stopped) return;
      flying = clones.map((clone, i) => clone.animate(flightFrames(i), {
        duration: FLY_MS, delay: i * FLY_STAGGER, easing: CLOSE_EASE, fill: 'forwards',
      }));
      // 第一张到锁的时候，锁吸一下。
      if (lock) window.setTimeout(() => { if (!stopped) lock.animate([{ scale: '1' }, { scale: '.9' }, { scale: '1.04' }, { scale: '1' }], { duration: 520, easing: 'ease-out' }); }, FLY_MS * 0.8);
      await settled(flying);
    },
    scatter: async () => {
      stopped = true;
      const back = clones.map((clone, i) => animateFromNow(clone, { transform: 'none', opacity: 1 }, { duration: BACK_MS, delay: i * 30, easing: OPEN_EASE, fill: 'forwards' }));
      flying = back;
      await settled(back);
      cleanup();
    },
    finish: () => {
      stopped = true;
      cleanup();
      for (const card of cards) card.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 320, easing: 'ease-out' });
    },
  };
};

/**
 * 收集箱倒进舞台左边的牌（2026-10-08）：盖子弹开，每一类蹦出几张小牌，沿往上拱的弧线飞进那一类的牌，
 * 落进去那一下牌顶一下。小牌是临时画的一块板（这一类的颜色），不拷贝箱子里的真牌——铺开层这时是收着的。
 */
export const pourFromBox = async (source: HTMLElement | null, targets: Array<{ el: HTMLElement; tint: string; count: number }>): Promise<void> => {
  if (!source || reducedMotion() || !targets.length) return;
  const from = source.querySelector('.jack')?.getBoundingClientRect() ?? source.getBoundingClientRect();
  const start = { x: from.left + from.width / 2, y: from.top + from.height / 2 };
  lidOpen(source);
  const flights: Animation[] = [];
  const chips: HTMLElement[] = [];
  targets.forEach((target, t) => {
    const goal = target.el.getBoundingClientRect();
    const dx = goal.left + goal.width / 2 - start.x;
    const dy = goal.top + goal.height / 2 - start.y;
    const arc = Math.min(160, 60 + Math.hypot(dx, dy) * 0.16);
    for (let k = 0; k < Math.min(3, Math.max(1, target.count)); k += 1) {
      const chip = document.createElement('div');
      chip.setAttribute('aria-hidden', 'true');
      Object.assign(chip.style, {
        position: 'fixed', left: `${start.x - 14}px`, top: `${start.y - 19}px`, width: '28px', height: '38px', borderRadius: '6px', zIndex: '1900', pointerEvents: 'none',
        background: `radial-gradient(120% 70% at 50% 0%, color-mix(in srgb, ${target.tint} 40%, transparent), transparent 70%), var(--mat-raised)`,
        boxShadow: 'var(--mat-raised-rim), 0 8px 18px -10px rgba(0,0,0,.7)',
      });
      document.body.appendChild(chip);
      chips.push(chip);
      const delay = t * 90 + k * 50;
      const spin = (k - 1) * 9;
      const flight = chip.animate([
        { transform: 'translate(0, 6px) scale(.5)', opacity: 0 },
        { transform: 'translate(0, -26px) scale(.9)', opacity: 1, offset: 0.18 },
        { transform: `translate(${(dx * 0.5).toFixed(1)}px, ${(dy * 0.5 - arc).toFixed(1)}px) rotate(${spin}deg) scale(1)`, opacity: 1, offset: 0.55 },
        { transform: `translate(${dx.toFixed(1)}px, ${dy.toFixed(1)}px) rotate(0deg) scale(.7)`, opacity: 0 },
      ], { duration: 640, delay, easing: CLOSE_EASE, fill: 'both' });
      flights.push(flight);
      if (k === 0) void flight.finished.then(() => bumpCard(target.el)).catch(() => undefined);
    }
  });
  lidClose(source, 420);
  await settled(flights);
  for (const chip of chips) chip.remove();
};

const bumpCard = (el: HTMLElement) => {
  const { easing, duration } = springCurve(SPRINGS.pop);
  el.animate([{ scale: '1.08' }, { scale: '1' }], { duration, easing });
};

/** 回执牌从锁里长出来：起点在锁心，缩得很小，弹簧落到原位。 */
export const emergeFrom = async (card: HTMLElement | null, lock: HTMLElement | null): Promise<void> => {
  if (!card) return;
  if (reducedMotion() || !lock) {
    await card.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 200, easing: 'ease-out' }).finished.catch(() => undefined);
    return;
  }
  const c = card.getBoundingClientRect();
  const l = lock.getBoundingClientRect();
  const dx = l.left + l.width / 2 - (c.left + c.width / 2);
  const dy = l.top + l.height / 2 - (c.top + c.height / 2);
  const { easing, duration } = springCurve(SPRINGS.settle);
  const grow = card.animate(
    [{ transform: `translate(${dx.toFixed(1)}px, ${dy.toFixed(1)}px) scale(.12)`, opacity: 0 }, { transform: 'none', opacity: 1 }],
    { duration: Math.max(560, duration), easing },
  );
  await grow.finished.catch(() => undefined);
};
