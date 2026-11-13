/**
 * 「来处」藏起来（2026-11-13 用户录屏：点「?」、挑日子发牌、长按信件……原位那颗按钮一直在，收回时两份叠成重影）。
 *
 * 规则（全应用一条，ui-guidelines 第 8 条）：
 * 1. 浮层 / 页面 / 牌从某个元素长出来，窗口里放的是它的拷贝——**拷贝出现的同一帧，真元素藏起来**；
 * 2. 收回时真元素**在窗口底下**提前亮好（被窗口盖着，看不出它在亮），窗口最后一段淡掉，露出来的就是它；
 * 3. 任何一帧画面上同一个元素只有一份。打断、卸载、出错都要放开，不许把按钮永久藏掉。
 *
 * 用属性不用行内样式 / 类名：来处多半有 Vue 绑着的 class 和 style，补丁时会被冲掉。
 * 同一个元素可能被几处同时按住（弹窗关到一半又点开），所以按住是计数的，最后一个放开才露出来。
 * 样式在 styles/material.css 的 `[data-source-hold]` 两条。属性名别和卡↔页形变的 data-morph-source 共用（2026-11-13：
 * 共用时按住会把卡的形变 id 改成 held，放开又整个删掉，返回时 currentCard() 就找不到那张卡）。
 */
import { exemptFromSettle } from './interrupt';

const ATTR = 'data-source-hold';
const holds = new WeakMap<HTMLElement, number>();
const fades = new WeakMap<HTMLElement, Animation>();

const mark = (el: HTMLElement) => {
  // 正在淡回来的那一段归它自己管：再被按住就撤掉淡入，回到全藏。
  if (fades.has(el)) { fades.get(el)?.cancel(); fades.delete(el); }
  el.setAttribute(ATTR, 'held');
};

/** 藏起来，返回放开的函数（只生效一次）。元素不在文档里就什么都不做。 */
export function holdSource(el: HTMLElement | null | undefined): () => void {
  if (!el?.isConnected) return () => undefined;
  holds.set(el, (holds.get(el) ?? 0) + 1);
  mark(el);
  let released = false;
  return () => {
    if (released) return;
    released = true;
    const left = (holds.get(el) ?? 1) - 1;
    if (left > 0) { holds.set(el, left); return; }
    holds.delete(el);
    fades.get(el)?.cancel();
    fades.delete(el);
    el.removeAttribute(ATTR);
  };
}

/**
 * 收回途中让真元素在窗口底下亮起来：透明度交给这段动画（属性换成 `fading`，样式表不再压成 0）。
 * 时间轴跟收回的那组动画对齐（同一个 duration，从此刻起放）；放完保持全亮，最后由 holdSource 返回的函数撤掉。
 */
export function fadeSourceIn(el: HTMLElement | null | undefined, frames: Keyframe[], timing: KeyframeAnimationOptions): Animation | null {
  if (!el?.isConnected || !holds.has(el)) return null;
  fades.get(el)?.cancel();
  el.setAttribute(ATTR, 'fading');
  const animation = exemptFromSettle(el.animate(frames, { fill: 'both', ...timing }));
  fades.set(el, animation);
  return animation;
}

/** 测试与排查用：这个元素此刻是不是被按着。 */
export const isSourceHeld = (el: HTMLElement): boolean => holds.has(el);

/**
 * 「收回时真元素提前亮好」的标准一段：线性时间轴上 `from`–`to` 从 0 亮到 1（前后保持）。
 * 和 dialogFlight 的 SOURCE_IN 同一个意思，只是这里是往终点放的方向。
 */
export const sourceInFrames = (from: number, to: number): Keyframe[] => [
  { opacity: 0 }, { opacity: 0, offset: from }, { opacity: 1, offset: to }, { opacity: 1 },
];
