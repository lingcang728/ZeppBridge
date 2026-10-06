/**
 * 收牌：一排卡按顺序收成一叠，再整叠飞进某个目标（送达动画，批次 4.4；批次 7 的扑克牌素材也用它）。
 *
 * 做法：给每张卡拷一份（cloneNode，挂在 body 上、fixed 定在原位），真卡先隐身；拷贝只动 transform / opacity
 * （合成器上跑）。三段：
 *   1. 收拢：按顺序（每张晚 45ms）滑到这一排的中心，叠成一叠，每张带一点点歪；
 *   2. 等结果：叠好的牌停在那里轻轻浮着（网络在跑）；
 *   3. 落地：成功整叠缩小飞进目标、淡掉；失败按原路发回各自的位置，真卡再露出来。
 * 减少动效时什么都不放，直接返回。
 */
import { CLOSE_EASE, OPEN_EASE } from '../timing';

const GATHER_MS = 460;
const STAGGER_MS = 45;
const FLY_MS = 520;
const RETURN_MS = 440;

export interface CardFlight {
  /** 成功：整叠飞进目标。 */
  land: (target: HTMLElement | null) => Promise<void>;
  /** 失败：牌按原路回到各自的位置。 */
  returnHome: () => Promise<void>;
}

const reduced = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
const finished = (animations: Animation[]) => Promise.all(animations.map((a) => a.finished.catch(() => undefined))).then(() => undefined);

export const gatherCards = (cards: HTMLElement[]): CardFlight => {
  if (reduced() || !cards.length) {
    return { land: async () => undefined, returnHome: async () => undefined };
  }
  const rects = cards.map((card) => card.getBoundingClientRect());
  const left = Math.min(...rects.map((r) => r.left));
  const right = Math.max(...rects.map((r) => r.right));
  const top = Math.min(...rects.map((r) => r.top));
  const bottom = Math.max(...rects.map((r) => r.bottom));
  const center = { x: (left + right) / 2, y: (top + bottom) / 2 };
  const hidden = cards.map((card) => card.animate([{ opacity: 0 }, { opacity: 0 }], { duration: 1, fill: 'forwards' }));
  const clones = cards.map((card, i) => {
    const rect = rects[i]!;
    const clone = card.cloneNode(true) as HTMLElement;
    clone.removeAttribute('href');
    clone.setAttribute('aria-hidden', 'true');
    Object.assign(clone.style, {
      position: 'fixed', left: `${rect.left}px`, top: `${rect.top}px`, width: `${rect.width}px`, height: `${rect.height}px`,
      margin: '0', zIndex: String(2000 + i), pointerEvents: 'none', translate: '', animation: 'none',
      background: 'var(--mat-raised)', boxShadow: 'var(--mat-raised-rim), 0 12px 26px -16px rgba(0,0,0,.6)', borderRadius: '12px',
    });
    document.body.appendChild(clone);
    return clone;
  });
  /** 叠里第 i 张的样子：在中心，略歪、略错开。 */
  const stacked = (i: number) => {
    const rect = rects[i]!;
    const dx = center.x - (rect.left + rect.width / 2) + (i - clones.length / 2) * 1.5;
    const dy = center.y - (rect.top + rect.height / 2) - i * 1.5;
    const tilt = ((i * 37) % 9) - 4;
    return `translate(${dx.toFixed(1)}px, ${dy.toFixed(1)}px) rotate(${tilt}deg) scale(.9)`;
  };
  const gathered = clones.map((clone, i) => clone.animate(
    [{ transform: 'none' }, { transform: stacked(i) }],
    { duration: GATHER_MS, delay: i * STAGGER_MS, easing: OPEN_EASE, fill: 'forwards' },
  ));
  const cleanup = () => {
    for (const clone of clones) clone.remove();
    for (const animation of hidden) animation.cancel();
  };

  return {
    land: async (target) => {
      await finished(gathered);
      const goal = target?.getBoundingClientRect();
      const flights = clones.map((clone, i) => {
        const rect = rects[i]!;
        const to = goal
          ? `translate(${(goal.left + goal.width / 2 - (rect.left + rect.width / 2)).toFixed(1)}px, ${(goal.top + goal.height / 2 - (rect.top + rect.height / 2)).toFixed(1)}px) rotate(0deg) scale(.12)`
          : `${stacked(i)} translateY(-40px)`;
        return clone.animate(
          [{ transform: stacked(i), opacity: 1 }, { transform: to, opacity: 0.9, offset: 0.8 }, { transform: to, opacity: 0 }],
          { duration: FLY_MS, delay: (clones.length - 1 - i) * 18, easing: CLOSE_EASE, fill: 'forwards' },
        );
      });
      await finished(flights);
      // 牌落进去以后，真卡淡回来（它们还在原位，只是刚才隐身了）。
      for (const card of cards) card.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 260, easing: 'ease-out' });
      cleanup();
    },
    returnHome: async () => {
      await finished(gathered);
      const back = clones.map((clone, i) => clone.animate(
        [{ transform: stacked(i) }, { transform: 'none' }],
        { duration: RETURN_MS, delay: i * STAGGER_MS, easing: OPEN_EASE, fill: 'forwards' },
      ));
      await finished(back);
      cleanup();
    },
  };
};
