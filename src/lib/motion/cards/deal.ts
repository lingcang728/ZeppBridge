/**
 * 发牌 / 收牌（精修批次 7.1）。
 *
 * 发牌：牌从来处（被点的那叠、那张卡）一张接一张向上扇出，落到各自的位置——起点叠在来处中心、缩小、
 * 按位置歪一点，弹簧落定。收牌是倒过来：一张接一张收回来处、缩小淡掉。
 * 只动 transform / opacity；减少动效时退化成短短的淡入淡出。
 */
import { centerOf, reducedMotion, settled, SPRINGS, springCurve } from './spring';

const STAGGER_MS = 38;
const COLLECT_MS = 360;
const FADE_MS = 160;

/** 来处 → 第 i 张牌的位置，牌在来处时的样子。 */
const fromOrigin = (card: HTMLElement, origin: DOMRect, i: number, count: number): string => {
  const rect = card.getBoundingClientRect();
  const from = centerOf(origin);
  const to = centerOf(rect);
  const tilt = (i - (count - 1) / 2) * 5;
  const scale = Math.max(0.35, Math.min(1, origin.width / Math.max(rect.width, 1)));
  return `translate(${(from.x - to.x).toFixed(1)}px, ${(from.y - to.y).toFixed(1)}px) rotate(${tilt.toFixed(1)}deg) scale(${scale.toFixed(3)})`;
};

/** 发牌。`origin` 为空时从牌桌底部中间发出。 */
export const dealCards = async (cards: HTMLElement[], origin: DOMRect | null): Promise<void> => {
  if (!cards.length) return;
  if (reducedMotion()) {
    await settled(cards.map((card) => card.animate([{ opacity: 0 }, { opacity: 1 }], { duration: FADE_MS, fill: 'backwards' })));
    return;
  }
  const source = origin ?? new DOMRect(window.innerWidth / 2 - 40, window.innerHeight - 40, 80, 110);
  const { easing, duration } = springCurve(SPRINGS.deal);
  const count = cards.length;
  await settled(cards.map((card, i) => card.animate(
    [
      { transform: fromOrigin(card, source, i, count), opacity: 0 },
      { opacity: 1, offset: 0.2 },
      { transform: 'none', opacity: 1 },
    ],
    // 发牌从中间往两边：离中间近的先出。
    { duration, delay: Math.abs(i - (count - 1) / 2) * STAGGER_MS, easing, fill: 'backwards' },
  )));
};

/**
 * 收牌：收回来处（目标为空时原地缩小淡掉）。牌停在收好的样子（fill forwards），调用方随后把它们移除；
 * 要是又不收了，`cancel()` 返回的动画即可。
 */
export const collectCards = async (cards: HTMLElement[], target: DOMRect | null): Promise<Animation[]> => {
  if (!cards.length) return [];
  if (reducedMotion()) {
    const fades = cards.map((card) => card.animate([{ opacity: 1 }, { opacity: 0 }], { duration: FADE_MS, fill: 'forwards' }));
    await settled(fades);
    return fades;
  }
  const count = cards.length;
  const animations = cards.map((card, i) => {
    const end = target ? fromOrigin(card, target, i, count) : 'scale(.6)';
    return card.animate(
      [{ transform: 'none', opacity: 1 }, { opacity: 1, offset: 0.7 }, { transform: end, opacity: 0 }],
      { duration: COLLECT_MS, delay: (count - 1 - Math.abs(i - (count - 1) / 2)) * 18, easing: 'cubic-bezier(.4, 0, .2, 1)', fill: 'forwards' },
    );
  });
  await settled(animations);
  return animations;
};
