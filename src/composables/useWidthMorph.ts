import { nextTick, watch, type Ref, type WatchSource } from 'vue';

/**
 * 胶囊里的字一变，宽度就跟着平滑伸缩，而不是一帧跳过去。
 *
 * 在 DOM 更新之前量一次旧宽度，更新之后量新宽度，用 Web Animations 从旧宽度
 * 补间到新宽度；动画期间裁掉溢出，结束后撤掉内联宽度，布局回到内容决定。
 * 又变了一次就从当前画面上的宽度接着走，不会先跳回去。
 * 顶栏同步胶囊（「今天 10:30」→「数据已备好 · 交给 AI」）、交付坞、撤销胶囊都用它。
 */
/**
 * @param onSettled 宽度落定（伸缩放完，或者根本没补间）时调。顶栏据此重新量一次放不放得下——
 *   以前是一个按「420ms」写死的定时器，动效改成 260ms 后它还在等，胶囊收窄后顶栏多停两百毫秒在紧凑档。
 */
export const useWidthMorph = (
  el: Ref<HTMLElement | null>,
  source: WatchSource<unknown>,
  duration = 260,
  onSettled?: () => void,
) => {
  let running: Animation | null = null;
  let from = 0;
  const settleWith = (animation: Animation) => {
    animation.finished.then(() => {
      if (running === animation) running = null;
      onSettled?.();
    }, () => undefined);
  };
  watch(source, async () => {
    const node = el.value;
    if (!node) return;
    from = node.getBoundingClientRect().width;
    running?.cancel();
    await nextTick();
    const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    const to = node.getBoundingClientRect().width;
    if (reduced || !from || Math.abs(to - from) < 1) {
      onSettled?.();
      return;
    }
    // 逐帧动 width 每帧都要重排、重画（D-6）：变化大（超过三成）时不补间宽度，直接到位、内容淡入一下；
    // 小变化才补间，而且短、不回弹。
    if (Math.abs(to - from) / Math.max(from, to) > 0.3) {
      running = node.animate([{ opacity: 0.4 }, { opacity: 1 }], { duration: 140, easing: 'ease-out' });
      // 宽度已经直接到位：不必等淡入放完。
      running.onfinish = () => { running = null; };
      onSettled?.();
      return;
    }
    const scale = node.offsetWidth ? node.getBoundingClientRect().width / node.offsetWidth : 1;
    running = node.animate(
      [
        { width: `${from / scale}px`, overflow: 'hidden' },
        { width: `${to / scale}px`, overflow: 'hidden' },
      ],
      { duration, easing: 'cubic-bezier(.2, .9, .25, 1)' },
    );
    settleWith(running);
  }, { flush: 'pre' });
};
