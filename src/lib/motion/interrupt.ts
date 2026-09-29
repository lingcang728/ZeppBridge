/**
 * 打断动效：动效放到一半按 Esc，所有正在放的过渡在很短的时间里快进到终点。
 *
 * 不是「跳」到终点：直接 finish() 会一帧换一屏，和卡顿分不出来。这里把每个动画剩下的
 * 部分压缩到 FAST_MS 里放完（改 playbackRate），看上去是「嗖」地一下落定。
 * CSS 过渡也在 document.getAnimations() 里，一样快进，Vue 的 <Transition> 照常收到 transitionend。
 *
 * 有些动效在「等」而不是在「放」（幽灵板长满后等新页数据、返回时等那张卡出现）：
 * 它们用 onMotionSkip 登记一个回调，打断时立刻结束等待。
 *
 * 切页时（AppShell 的 router.beforeEach）也调一次 settleMotion：上一段动效还没放完就又
 * 切页，先让它收尾，免得旧的幽灵板压在新页上。
 */
const FAST_MS = 90;

const waiting = new Set<() => void>();

/** 登记一段「在等」的动效；返回注销函数。打断时回调被调用一次并自动注销。 */
export const onMotionSkip = (skip: () => void): (() => void) => {
  waiting.add(skip);
  return () => { waiting.delete(skip); };
};

/** 还剩多少毫秒；无限循环（转圈、骨架屏微光）和已经停下的返回 0。 */
export const remainingMs = (animation: Animation): number => {
  if (animation.playState !== 'running' && !animation.pending) return 0;
  const timing = animation.effect?.getComputedTiming();
  const end = Number(timing?.endTime);
  const local = Number(timing?.localTime ?? 0);
  if (!Number.isFinite(end) || !Number.isFinite(local)) return 0;
  const rate = Math.abs(animation.playbackRate) || 1;
  return animation.playbackRate < 0 ? local / rate : (end - local) / rate;
};

/**
 * 值得打断的动效：切页、形变、弹窗这类「在走一段路」的。悬停、按下这种短过渡（不到
 * 300ms 的 CSS 过渡）和循环的装饰动画（呼吸点）不算——以前鼠标正好停在一张卡上，
 * 悬停过渡还没走完，按 Esc 就被当成「打断动效」吞掉了，看上去是 Esc 返回没反应。
 */
export const worthInterrupting = (animation: Animation): boolean => {
  const timing = animation.effect?.getComputedTiming();
  if (!timing || Number(timing.iterations) > 1) return false;
  const isTransition = typeof CSSTransition !== 'undefined' && animation instanceof CSSTransition;
  return !(isTransition && Number(timing.activeDuration) < 300);
};

const running = (): Animation[] =>
  typeof document !== 'undefined' && typeof document.getAnimations === 'function'
    ? document.getAnimations().filter((a) => remainingMs(a) > 0 && worthInterrupting(a))
    : [];

/**
 * 让所有正在进行的动效在 `ms` 内收尾。返回有没有东西被打断（没有的话 Esc 留给别人用，
 * 比如关弹窗、合上设置卡）。
 */
export const settleMotion = (ms = FAST_MS): boolean => {
  const hooks = [...waiting];
  waiting.clear();
  for (const hook of hooks) hook();
  const animations = running();
  for (const animation of animations) {
    const left = remainingMs(animation);
    if (left <= ms) continue;
    const next = animation.playbackRate * (left / Math.max(ms, 1));
    if (typeof animation.updatePlaybackRate === 'function') animation.updatePlaybackRate(next);
    else animation.playbackRate = next;
  }
  return hooks.length > 0 || animations.length > 0;
};

/** 全局 Esc：有动效在放就打断它，并吞掉这次按键；没有就什么都不做。 */
export const installMotionInterrupt = (): (() => void) => {
  const onKeydown = (event: KeyboardEvent) => {
    if (event.key !== 'Escape' || event.repeat || event.isComposing) return;
    if (!settleMotion()) return;
    event.preventDefault();
    event.stopImmediatePropagation();
  };
  // 挂在 window 的捕获阶段：比弹窗、设置卡叠挂在 document 上的 Esc 更早收到。
  window.addEventListener('keydown', onKeydown, true);
  return () => window.removeEventListener('keydown', onKeydown, true);
};
