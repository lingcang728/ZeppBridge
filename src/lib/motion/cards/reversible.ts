/**
 * 可撤回的动效（第三轮精修 A8）：牌桌、收集箱、「问 AI」浮层共用的打断规则。
 *
 * 动画放到一半来了一个反向操作（Esc、再点一下按钮、点空白），一律**从此刻的计算样式**原路放回：
 * 读出元素这一帧的 transform / opacity（带着正在放的动画值），取消它身上的动画，新动画首帧就用这些值。
 * 取消与新建在同一个任务里，中间不出帧。不用 `reverse()`：倒放一段已经放完、没有 forwards fill 的动画，
 * Chromium 下一帧才掉头，中间一帧动画全不生效，会闪一下。
 *
 * `sequence()` 给一段多步编排（理牌 → 放回 → 淡回）发号：每开始一次新动作就换一个号，
 * 旧编排在下一个 await 之后看到号变了就自己停下，不会和新动作抢同一批元素。
 */

/** 元素这一帧的样子（含正在放的动画）。 */
export const fromNow = (el: Element, props: Array<'transform' | 'opacity' | 'translate' | 'scale' | 'rotate'> = ['transform', 'opacity']): Keyframe => {
  const style = getComputedStyle(el);
  const frame: Keyframe = {};
  for (const prop of props) {
    const value = style.getPropertyValue(prop);
    frame[prop] = value || (prop === 'opacity' ? '1' : 'none');
  }
  return frame;
};

/** 取消元素身上（不含子元素）的 Web Animations。CSS 过渡也会一起取消，它们本来就要被新动画接管。 */
export const cancelOn = (el: Element): void => {
  for (const animation of el.getAnimations()) animation.cancel();
};

/**
 * 从此刻起放到 `to`：先读计算样式，再取消旧动画，最后起新动画——三步在同一个任务里。
 * `props` 决定读哪几项（默认 transform + opacity），`to` 里没写的项保持此刻的值。
 */
export const animateFromNow = (
  el: Element,
  to: Keyframe | Keyframe[],
  options: KeyframeAnimationOptions,
  props: Array<'transform' | 'opacity' | 'translate' | 'scale' | 'rotate'> = ['transform', 'opacity'],
): Animation => {
  const from = fromNow(el, props);
  cancelOn(el);
  const rest = (Array.isArray(to) ? to : [to]).map((frame) => ({ ...frame }));
  // 终点没写的项保持此刻的值：不写的话 WAAPI 拿样式表的值当终点，牌会边淡边扇回原位。
  const last = rest[rest.length - 1]!;
  for (const prop of props) if (!(prop in last)) last[prop] = from[prop];
  // 有延迟时延迟期间也停在此刻的样子（只写 forwards 的话，延迟那几十毫秒会闪回样式表的值）。
  const fill = options.fill === 'forwards' && options.delay ? 'both' : options.fill;
  return el.animate([from, ...rest], { ...options, fill });
};

/** 一段编排的号：`next()` 开始新的一次动作，`live(id)` 问这一次是不是还作数。 */
export interface Sequence {
  next: () => number;
  live: (id: number) => boolean;
  readonly current: number;
}

export const sequence = (): Sequence => {
  let id = 0;
  return {
    next: () => (id += 1),
    live: (n) => n === id,
    get current() { return id; },
  };
};
