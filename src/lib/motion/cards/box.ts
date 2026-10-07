/**
 * 小丑盒（第四轮 1B·B1，用户 10-07 拍板）：收集箱是一只合盖的小盒子，侧面印着数量。
 *
 * - 牌飞进来：盖子弹开接住 → 落进去 → 合上（`catchCard`）；
 * - 点开铺开：盖子弹起（开得更大），牌像弹簧一样从盒口蹦出来再扇开；收起反过来（`lidOpen(…, 'wide')` / `lidClose`）。
 * 盖子是 `.box-lid`，铰链在左下角；只动它自己的 transform，弹簧走 `springCurve`，每段都从此刻的样子起放（半路反向不跳）。
 */
import { animateFromNow } from './reversible';
import { reducedMotion, SPRINGS, springCurve } from './spring';

const lidOf = (box: Element | null | undefined) => box?.querySelector<HTMLElement>('.box-lid') ?? null;

const OPEN_POSE = { small: 'translate(-1px, -5px) rotate(-26deg)', wide: 'translate(-2px, -9px) rotate(-62deg)' } as const;

export const lidOpen = (box: Element | null | undefined, how: keyof typeof OPEN_POSE = 'small'): Animation | null => {
  const lid = lidOf(box);
  if (!lid || reducedMotion()) return null;
  const { easing, duration } = springCurve(SPRINGS.pop);
  return animateFromNow(lid, { transform: OPEN_POSE[how] }, { duration, easing, fill: 'forwards' }, ['transform']);
};

export const lidClose = (box: Element | null | undefined, delay = 0): Animation | null => {
  const lid = lidOf(box);
  if (!lid || reducedMotion()) return null;
  const { easing, duration } = springCurve(SPRINGS.settle);
  return animateFromNow(lid, { transform: 'none' }, { duration, delay, easing, fill: 'forwards' }, ['transform']);
};

/**
 * 一张牌要飞进来：飞到快一半时盖子弹开，落地（`landed`）后合上；飞行被取消也合上。
 * 返回落地时调用的收尾函数。
 */
export const catchCard = (box: Element | null | undefined, flightMs: number): ((landed: boolean) => void) => {
  if (!lidOf(box) || reducedMotion()) return () => undefined;
  const timer = window.setTimeout(() => lidOpen(box), Math.max(0, flightMs * 0.42));
  return () => {
    window.clearTimeout(timer);
    lidClose(box, 60);
  };
};
