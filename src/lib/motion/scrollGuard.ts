/**
 * 卡 ↔ 页形变期间锁住主滚动区（composables/usePageMorph.ts 用）。
 *
 * 形变的裁切锚点、垫底、来处页上的模糊都是按开跑那一刻的坐标钉在页面里的：途中一滚，整组错位，露出垫底和
 * 半张旧页，看上去就是「点开卡片马上滚一下就卡住」（10-28 录屏）。所以形变期间 #main-content 不滚
 * （overflow 收起，scrollbar-gutter: stable 保证宽度不跳），滚轮和翻页键在捕获阶段拦下来、记着攒了多少；
 * 第一次有人想滚就让形变加速落地（用户 2026-10-28 定「加速落地再滚」），落地后把攒下的量补给落地的那一页。
 */

/** 滚轮的一格换成像素：deltaMode 1 是行、2 是页（纯函数，方便测）。 */
export const wheelPixels = (deltaY: number, deltaMode: number, pageHeight: number): number => {
  if (deltaMode === 1) return deltaY * 16;
  if (deltaMode === 2) return deltaY * pageHeight;
  return deltaY;
};

/** 翻页键想滚多少；Home / End 是到顶 / 到底（±Infinity）；不是滚动键返回 0（纯函数，方便测）。 */
export const keyPixels = (key: string, shift: boolean, pageHeight: number): number => {
  const page = Math.max(40, pageHeight * 0.875);
  switch (key) {
    case 'PageDown': return page;
    case 'PageUp': return -page;
    case ' ': return shift ? -page : page;
    case 'ArrowDown': return 40;
    case 'ArrowUp': return -40;
    case 'End': return Number.POSITIVE_INFINITY;
    case 'Home': return Number.NEGATIVE_INFINITY;
    default: return 0;
  }
};

/** 攒下来的量：Home / End 盖掉之前的零碎滚动（纯函数，方便测）。 */
export const addScroll = (sum: number, next: number): number => {
  if (!Number.isFinite(next)) return next;
  return Number.isFinite(sum) ? sum + next : sum;
};

const editable = (target: EventTarget | null) =>
  target instanceof HTMLElement && (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName));

/** 万一形变没落地（被别的切页吞了、页面挂掉），锁也不能一直挂着。 */
const MAX_HOLD_MS = 4000;

export interface ScrollGuard {
  /** 放开滚动；`apply` 时把攒下的量补到滚动区此刻的位置上。 */
  release: (apply: boolean) => void;
}

/** 锁住 `root` 的滚动。`onInput`：形变期间第一次有人想滚（之后每次也调，调用方自己保证幂等）。 */
export const guardScroll = (root: HTMLElement, onInput: () => void): ScrollGuard => {
  let pending = 0;
  let released = false;
  const overflow = root.style.overflowY;
  root.style.overflowY = 'hidden';
  const take = (event: Event, pixels: number) => {
    event.preventDefault();
    pending = addScroll(pending, pixels);
    onInput();
  };
  const onWheel = (event: WheelEvent) => {
    if (event.ctrlKey || !(event.target instanceof Node) || !root.contains(event.target)) return;
    if (Math.abs(event.deltaY) < Math.abs(event.deltaX)) return;
    take(event, wheelPixels(event.deltaY, event.deltaMode, root.clientHeight));
  };
  const onKey = (event: KeyboardEvent) => {
    if (event.altKey || event.ctrlKey || event.metaKey || editable(event.target)) return;
    const pixels = keyPixels(event.key, event.shiftKey, root.clientHeight);
    if (pixels) take(event, pixels);
  };
  window.addEventListener('wheel', onWheel, { capture: true, passive: false });
  window.addEventListener('keydown', onKey, true);
  const timer = window.setTimeout(() => release(false), MAX_HOLD_MS);
  const release = (apply: boolean) => {
    if (released) return;
    released = true;
    window.clearTimeout(timer);
    window.removeEventListener('wheel', onWheel, true);
    window.removeEventListener('keydown', onKey, true);
    root.style.overflowY = overflow;
    if (!apply || !pending) return;
    if (pending === Number.POSITIVE_INFINITY) root.scrollTo({ top: root.scrollHeight });
    else if (pending === Number.NEGATIVE_INFINITY) root.scrollTo({ top: 0 });
    else root.scrollBy({ top: pending, behavior: 'smooth' });
  };
  return { release };
};
