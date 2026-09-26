import { nextTick } from 'vue';

type ViewTransitionDocument = Document & {
  startViewTransition?: (update: () => Promise<void> | void) => { finished: Promise<void> };
};

/**
 * 在支持 View Transitions 的环境里，把一次界面更新包成「同一个元素在两个位置之间形变」。
 * 不支持或用户开了减少动效时直接更新，不做任何动画。
 */
export const withViewTransition = async (update: () => Promise<unknown> | unknown): Promise<void> => {
  const doc = document as ViewTransitionDocument;
  const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  if (!doc.startViewTransition || reduced) {
    await update();
    return;
  }
  const transition = doc.startViewTransition(async () => {
    await update();
    await nextTick();
  });
  try {
    await transition.finished;
  } catch {
    // 过渡被打断（比如用户又点了一下）不影响状态本身。
  }
};
