/**
 * 发牌 / 理牌 / 放回（第三轮精修 A1，取代第二轮「每张各自缩回来处、七成处淡掉」的 collectCards）。
 *
 * 用户 10-07 录屏：收牌时七张牌 200ms 内乱成一团冲向按钮、在按钮处直接没了；发牌是从按钮炸出一团乱歪的牌。
 * 真的扑克牌是「先理成一叠、再放回去」「先抽出一叠、再扇开」，这里照这个分两段：
 *
 * - 发牌 `dealCards`：一叠牌先从来处**抽出来**（0.12s，整叠一起、从来处的大小长大一点），再弹簧扇开到各自位置，
 *   离中间近的先落；`fromStack` 时（换范围）起点就是停在正中的那一叠，不再抽。
 * - 理牌 `stackCards`：从此刻的样子起，从边上往中间依次滑到正中叠成一叠，每张歪 1–4°、错开 1.5px，**全程不透明**。
 * - 放回 `returnStack`：整叠沿一条往上拱的弧线缩回去——
 *   `button`：缩进按钮，最后三成淡掉（按钮那边由 `receive` 接住）；
 *   `pile`：落进被点的那一叠，最后一帧与它的位置、大小、角度完全重合，再淡掉露出底下那一叠（交叉淡化，不是凭空消失）。
 * 每一段都从此刻的计算样式起放（半路被打断也是原路），只动 transform / opacity；减少动效时退化成短淡入淡出。
 */
import { CLOSE_EASE } from '../timing';
import { animateFromNow } from './reversible';
import { centroid, poseTransform, restOf, stackPose, type Point, type Rest } from './pose';
import { reducedMotion, settled, SPRINGS, springCurve } from './spring';

const STAGGER_MS = 34;
const DRAW_MS = 120;
const STACK_STAGGER_MS = 26;
/** 理牌：~360ms 利落叠齐。弹簧的尾巴太长（叠好了还要再等三四百毫秒才算放完），这里用一条前快后稳的曲线。 */
const STACK_MS = 320;
const STACK_EASE = 'cubic-bezier(.25, .8, .25, 1)';
const RETURN_MS = 440;
const CROSSFADE_MS = 100;
const FADE_MS = 160;

/** 来处：被点的按钮 / 格子（`button`），或者一叠牌（`pile`，带它的角度和布局宽度）。 */
export interface Landing {
  rect: DOMRect;
  kind: 'button' | 'pile';
  /** 一叠牌的屏幕角度（度）。 */
  angle?: number;
  /** 一叠牌的布局宽度（不含缩放）；不给就用 rect 的宽。 */
  width?: number;
}

const centerOf = (rect: DOMRect): Point => ({ x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 });

/** 牌缩到来处时的缩放：叠 = 宽度之比；按钮 = 塞得进按钮的大小。 */
const landingScale = (landing: Landing, cardWidth: number): number => {
  const w = Math.max(cardWidth, 1);
  if (landing.kind === 'pile') return (landing.width ?? landing.rect.width) / w;
  return Math.max(0.06, Math.min(landing.rect.width / w, landing.rect.height / (w * 1.4), 0.5));
};

export interface DealOptions {
  /** 起点就是此刻停在 `origin` 的一叠（换范围）：不抽、不淡入。 */
  fromStack?: boolean;
}

/** 发牌。`origin` 为空时从牌桌下沿中间发出。 */
export const dealCards = async (cards: HTMLElement[], origin: Landing | null, options: DealOptions = {}): Promise<void> => {
  if (!cards.length) return;
  if (reducedMotion()) {
    await settled(cards.map((card) => card.animate([{ opacity: 0 }, { opacity: 1 }], { duration: FADE_MS, fill: 'backwards' })));
    return;
  }
  const rests = cards.map(restOf);
  const middle = centroid(rests);
  const source: Landing = origin ?? { rect: new DOMRect(middle.x - 40, window.innerHeight - 60, 80, 110), kind: 'button' };
  const from = centerOf(source.rect);
  const n = cards.length;
  const { easing, duration } = springCurve(SPRINGS.deal);
  // 抽出：整叠从来处往牌桌中间挪三成多、长到来处大小和半张牌之间。
  const startScale = landingScale(source, rests[0]!.width);
  const drawn: Point = options.fromStack ? from : { x: from.x + (middle.x - from.x) * 0.34, y: from.y + (middle.y - from.y) * 0.34 };
  const drawnScale = options.fromStack ? startScale : Math.max(startScale, Math.min(0.62, startScale * 2.4 + 0.18));
  const baseAngle = source.kind === 'pile' ? source.angle ?? 0 : 0;
  const start = (rest: Rest, i: number) => poseTransform(rest, stackPose(from, i, n, startScale, baseAngle));
  const pulled = (rest: Rest, i: number) => poseTransform(rest, stackPose(drawn, i, n, drawnScale, baseAngle));
  const fan = (card: HTMLElement, i: number, rest: Rest) => card.animate(
    [{ transform: pulled(rest, i), opacity: 1 }, { transform: 'none', opacity: 1 }],
    { duration, delay: Math.abs(i - (n - 1) / 2) * STAGGER_MS, easing, fill: 'backwards' },
  );
  if (options.fromStack) {
    await settled(cards.map((card, i) => fan(card, i, rests[i]!)));
    return;
  }
  const draws = cards.map((card, i) => card.animate(
    [{ transform: start(rests[i]!, i), opacity: 0 }, { opacity: 1, offset: 0.45 }, { transform: pulled(rests[i]!, i), opacity: 1 }],
    { duration: DRAW_MS, easing: 'cubic-bezier(.2, .7, .3, 1)', fill: 'both' },
  ));
  await settled(draws);
  if (draws.some((a) => a.playState !== 'finished')) return;
  // 新动画先起、旧的再取消：同一个任务里，中间不出帧。
  const fans = cards.map((card, i) => fan(card, i, rests[i]!));
  for (const a of draws) a.cancel();
  await settled(fans);
};

/** 理牌：从此刻的样子起，从边上往中间依次滑到 `center`（默认这一层的重心）叠成一叠；`angle` 是整叠的屏幕角度。 */
export const stackCards = async (cards: HTMLElement[], center?: Point, angle = 0): Promise<Animation[]> => {
  if (!cards.length) return [];
  if (reducedMotion()) return [];
  const rests = cards.map(restOf);
  const at = center ?? centroid(rests);
  const n = cards.length;
  const mid = (n - 1) / 2;
  const animations = cards.map((card, i) => animateFromNow(
    card,
    { transform: poseTransform(rests[i]!, stackPose(at, i, n, 1, angle)), opacity: 1 },
    { duration: STACK_MS, delay: (mid - Math.abs(i - mid)) * STACK_STAGGER_MS, easing: STACK_EASE, fill: 'forwards' },
  ));
  // 叠到七成多（看上去已经齐了）就交给下一段：缓动的尾巴只是在毫米级地挪，等它放完会像停住了一拍。
  const longest = (mid > 0 ? mid * STACK_STAGGER_MS : 0) + STACK_MS * 0.72;
  await Promise.race([settled(animations), new Promise<void>((resolve) => window.setTimeout(resolve, longest))]);
  return animations;
};

/**
 * 放回：整叠（此刻叠在哪就从哪起）沿弧线缩回 `landing`。按钮：最后三成淡掉；一叠：落定后再淡掉露出底下那一叠。
 * 牌停在放回的样子（fill forwards），调用方随后把它们移除。
 */
export const returnStack = async (cards: HTMLElement[], landing: Landing | null): Promise<Animation[]> => {
  if (!cards.length) return [];
  if (reducedMotion() || !landing) {
    const fades = cards.map((card) => animateFromNow(card, { opacity: 0 }, { duration: FADE_MS, fill: 'forwards' }));
    await settled(fades);
    return fades;
  }
  const rests = cards.map(restOf);
  const n = cards.length;
  const to = centerOf(landing.rect);
  const scale = landingScale(landing, rests[0]!.width);
  const baseAngle = landing.kind === 'pile' ? landing.angle ?? 0 : 0;
  const now = centroid(rests.map((rest, i) => ({ ...rest, center: currentCenter(cards[i]!) ?? rest.center })));
  const lift = Math.min(90, 24 + Math.hypot(to.x - now.x, to.y - now.y) * 0.12);
  const animations = cards.map((card, i) => {
    const rest = rests[i]!;
    const end = poseTransform(rest, landing.kind === 'pile'
      ? { center: to, angle: baseAngle, scale }
      : stackPose(to, i, n, scale));
    const midPose = stackPose({ x: (now.x + to.x) / 2, y: (now.y + to.y) / 2 - lift }, i, n, (1 + scale) / 2, baseAngle / 2);
    const keys: Keyframe[] = [
      { transform: poseTransform(rest, midPose), opacity: 1, offset: 0.5 },
      ...(landing.kind === 'button' ? [{ opacity: 1, offset: 0.7 }] : []),
      { transform: end, opacity: landing.kind === 'button' ? 0 : 1 },
    ];
    return animateFromNow(card, keys, { duration: RETURN_MS, delay: (n - 1 - i) * 6, easing: CLOSE_EASE, fill: 'forwards' });
  });
  await settled(animations);
  if (landing.kind === 'pile' && animations.every((a) => a.playState === 'finished')) {
    const fades = cards.map((card) => animateFromNow(card, { opacity: 0 }, { duration: CROSSFADE_MS, easing: 'ease-out', fill: 'forwards' }));
    await settled(fades);
    return fades;
  }
  return animations;
};

/** 牌此刻（带动画）的屏幕中心。 */
const currentCenter = (card: HTMLElement): Point | null => {
  const rect = card.getBoundingClientRect();
  return rect.width ? centerOf(rect) : null;
};

/** 理牌 + 放回，一口气。 */
export const stackAndReturn = async (cards: HTMLElement[], landing: Landing | null, center?: Point): Promise<void> => {
  await stackCards(cards, center);
  await returnStack(cards, landing);
};

/** 扇回原位（收到一半又不收了）：从此刻起弹簧落回各自的位置。 */
export const fanBack = async (cards: HTMLElement[]): Promise<void> => {
  const { easing, duration } = springCurve(SPRINGS.settle);
  await settled(cards.map((card) => animateFromNow(card, { transform: 'none', opacity: 1 }, { duration, easing })));
};
