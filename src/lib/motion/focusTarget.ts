import type { RouteLocationNormalized } from 'vue-router';

/**
 * 点概览上的小卡（置顶指标、「这一周」）进详情页时，直接停在对应的那张趋势卡上，并圈一下
 * （用户 2026-10-03：点「训练负荷」进了训练状态页，还得自己往下找那张卡）。
 *
 * 链接带 `?focus=指标名`，目标卡标着 `data-focus-key`（MetricTrendCard 用它的指标名）。从卡片展开时
 * usePageMorph 先把页面滚到那张卡、让窗口直接从小卡长成那张卡；没有形变（减少动效、数据还没到）时
 * 页面出来以后平滑滚过去。落定后圈一下。
 */
export const focusKeyOf = (route: RouteLocationNormalized): string | null =>
  (typeof route.query.focus === 'string' && route.query.focus ? route.query.focus : null);

export const findFocusTarget = (page: Element, key: string): HTMLElement | null =>
  page.querySelector<HTMLElement>(`[data-focus-key="${CSS.escape(key)}"]`);

/** 目标卡停在可视区里的位置：顶栏下面留一点（可视区包括顶栏那一条）。 */
const TOP_GAP = 96;

/**
 * 把目标卡滚到可视区上方要滚多少（正数往下）；已经在合适位置就是 0。
 *
 * 能滚多远按**这一页自己**的底算（`page`），不按滚动区的 scrollHeight：切页时离场的来处页还绝对定位地
 * 叠在里面（概览很长），scrollHeight 是两页里长的那个。按它滚到底，来处页一离场滚动区变短，浏览器把
 * scrollTop 夹回来——形变刚落定整页就往下一沉（用户 2026-10-04 录屏：睡眠 HRV、静息心率、训练负荷点进去都这样）。
 */
export const focusScrollDelta = (target: HTMLElement, scroller: HTMLElement, page?: HTMLElement): number => {
  const box = target.getBoundingClientRect();
  const view = scroller.getBoundingClientRect();
  const wanted = box.top - (view.top + TOP_GAP);
  let bottom = scroller.scrollHeight;
  if (page) {
    const pad = Number.parseFloat(getComputedStyle(scroller).paddingBottom) || 0;
    bottom = Math.min(bottom, page.getBoundingClientRect().bottom - view.top - scroller.clientTop + scroller.scrollTop + pad);
  }
  const max = Math.max(0, bottom - scroller.clientHeight - scroller.scrollTop);
  return Math.max(-scroller.scrollTop, Math.min(wanted, max));
};

const reducedMotion = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;

/**
 * 圈一下：卡上叠一层只有描边和光晕的框，淡入、停一下、再淡出（两拍）。只动这一层的透明度，不改卡的布局和样式。
 */
export const ringFocus = (target: HTMLElement): void => {
  const ring = document.createElement('span');
  ring.setAttribute('aria-hidden', 'true');
  ring.className = 'focus-ring';
  // 样式直接写在这一层上（只在定位时用一次，不占首屏样式表）：描边 + 一圈淡光晕。
  Object.assign(ring.style, {
    position: 'absolute',
    inset: '0',
    zIndex: '5',
    borderRadius: 'inherit',
    pointerEvents: 'none',
    opacity: '0',
    boxShadow: 'inset 0 0 0 2px var(--accent), 0 0 0 4px color-mix(in srgb, var(--accent) 22%, transparent), '
      + '0 0 28px color-mix(in srgb, var(--accent) 28%, transparent)',
  });
  if (getComputedStyle(target).position === 'static') target.style.position = 'relative';
  target.appendChild(ring);
  const frames: Keyframe[] = reducedMotion()
    ? [{ opacity: 1 }, { opacity: 1, offset: 0.85 }, { opacity: 0 }]
    : [{ opacity: 0 }, { opacity: 1, offset: 0.14 }, { opacity: 0.45, offset: 0.4 }, { opacity: 1, offset: 0.56 }, { opacity: 1, offset: 0.72 }, { opacity: 0 }];
  const animation = ring.animate(frames, { duration: 1700, easing: 'ease-in-out', fill: 'forwards' });
  const drop = () => ring.remove();
  animation.finished.then(drop, drop);
};

/**
 * 没有形变可以借（减少动效、目标卡要等数据才出现）：等目标出现（最多 `waitMs`），平滑滚过去再圈一下。
 */
export const revealFocusLater = (page: HTMLElement, key: string, waitMs = 1500): void => {
  const scroller = document.getElementById('main-content');
  const started = performance.now();
  const look = () => {
    if (!page.isConnected || !scroller) return;
    const target = findFocusTarget(page, key);
    if (!target) {
      if (performance.now() - started < waitMs) requestAnimationFrame(look);
      return;
    }
    const delta = focusScrollDelta(target, scroller, page);
    if (Math.abs(delta) > 4) scroller.scrollBy({ top: delta, behavior: reducedMotion() ? 'auto' : 'smooth' });
    window.setTimeout(() => ringFocus(target), Math.abs(delta) > 4 && !reducedMotion() ? 420 : 0);
  };
  requestAnimationFrame(look);
};
