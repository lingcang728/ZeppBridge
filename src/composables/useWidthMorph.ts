import { nextTick, watch, type Ref, type WatchSource } from 'vue';

/**
 * 胶囊里的字一变，宽度就跟着平滑伸缩，而不是一帧跳过去。
 *
 * 在 DOM 更新之前量一次旧宽度，更新之后量新宽度，用 Web Animations 从旧宽度
 * 补间到新宽度；动画期间裁掉溢出，结束后撤掉内联宽度，布局回到内容决定。
 * 又变了一次就从当前画面上的宽度接着走，不会先跳回去。
 * 顶栏同步胶囊（「今天 10:30」→「数据已备好 · 交给 AI」）、交付坞、撤销胶囊都用它。
 */
export const useWidthMorph = (el: Ref<HTMLElement | null>, source: WatchSource<unknown>, duration = 420) => {
  let running: Animation | null = null;
  let from = 0;
  watch(source, async () => {
    const node = el.value;
    if (!node) return;
    from = node.getBoundingClientRect().width;
    running?.cancel();
    await nextTick();
    const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    const to = node.getBoundingClientRect().width;
    if (reduced || !from || Math.abs(to - from) < 1) return;
    const scale = node.offsetWidth ? node.getBoundingClientRect().width / node.offsetWidth : 1;
    running = node.animate(
      [
        { width: `${from / scale}px`, overflow: 'hidden' },
        { width: `${to / scale}px`, overflow: 'hidden' },
      ],
      { duration, easing: 'cubic-bezier(.3, 1.2, .4, 1)' },
    );
    running.onfinish = () => { running = null; };
  }, { flush: 'pre' });
};
