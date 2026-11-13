/**
 * 「重新挂上 / 拷贝出来的 DOM 一律停在终态」（ui-guidelines 第 8 条）。
 *
 * 一个元素每次插进文档（KeepAlive 缓存页插回、关弹窗时把面板挂回 body 缩回去、cloneNode 出来的卡拷贝），
 * 它身上的 CSS 入场动画都会从头再放一遍：2026-11-13 用户录屏里履历「单月最多里程」一关，十二根条形从 0
 * 重新长了一遍才缩回去（YearDetailDialog 的 bar-grow）；卡拷贝里的描线、淡入也一样，落地换回已经停在终态的
 * 真卡时就是一闪。所以这些 DOM 挂上去的同一刻，有限次的 CSS 动画直接放完；循环的（转圈、呼吸点）不动。
 * WAAPI 动画不归它管：那些是飞行自己的时间轴。
 */
export const settleCssAnimations = (root: Element | null | undefined): void => {
  if (!root?.isConnected || typeof CSSAnimation === 'undefined' || typeof root.getAnimations !== 'function') return;
  for (const animation of root.getAnimations({ subtree: true })) {
    if (animation instanceof CSSAnimation && Number.isFinite(animation.effect?.getTiming().iterations ?? 1)) animation.finish();
  }
};
