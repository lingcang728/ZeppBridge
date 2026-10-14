import type { RouteLocationNormalized } from 'vue-router';

/**
 * 点概览上的小卡（置顶指标、「这一周」）进详情页时，直接停在对应的那张趋势卡上，并圈一下
 * （用户 2026-10-03：点「训练负荷」进了训练状态页，还得自己往下找那张卡）。
 *
 * 链接带 `?focus=指标名`，目标卡标着 `data-focus-key`（MetricTrendCard 用它的指标名）。从卡片展开时
 * usePageMorph 先把页面滚到那张卡、让窗口直接从小卡长成那张卡；没有形变（减少动效、数据还没到）时
 * 页面出来以后平滑滚过去。落定后圈一下。
 *
 * 没有卡的指标（近 6 个月一条读数都没有，收进了「近 6 个月没有读数」那一行，或者整组只剩一句说明）：
 * 那一行 / 那句话标着 `data-focus-keys="指标名 指标名…"`，定位到它（用户 2026-10-04：体重、体脂率、BMI
 * 没有数据，点进去停在页顶不动）。
 */
export const focusKeyOf = (route: RouteLocationNormalized): string | null =>
  (typeof route.query.focus === 'string' && route.query.focus ? route.query.focus : null);

export const findFocusTarget = (page: Element, key: string): HTMLElement | null =>
  page.querySelector<HTMLElement>(`[data-focus-key="${CSS.escape(key)}"]`)
  ?? page.querySelector<HTMLElement>(`[data-focus-keys~="${CSS.escape(key)}"]`);

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

/** 页面高度连续这么多帧不变，才算排版落定。 */
const STEADY_FRAMES = 6;
/** 平滑滚动最多等这么久再圈（没有 scrollend 的情况）。 */
const SCROLL_SETTLE_MS = 700;

/**
 * 等目标出现、页面排版落定，再平滑滚过去、圈一下。形变落地后也走这里补一次。
 *
 * 不能在页面刚挂上时量一次就算：形变放完以后图表才一帧挂一张、每小时步数卡读完数据才从一行长成
 * 一整块（高四百多像素），那一刻量的「能滚多远」只有最后的一半。以前按那时的高度算出来要滚 0，
 * 日常活动页的步数 / 活动热量点进去就停在页顶不动（用户 2026-10-04 录屏）。
 *
 * 等待期间用户自己动了滚动条，就不替他滚了（只圈一下）。
 */
export const revealFocusLater = (page: HTMLElement, key: string, waitMs = 2500): void => {
  const scroller = document.getElementById('main-content');
  if (!scroller) return;
  const started = performance.now();
  const startTop = scroller.scrollTop;
  let lastHeight = -1;
  let steady = 0;
  let opened = false;
  const look = () => {
    if (!page.isConnected) return;
    const late = performance.now() - started > waitMs;
    const target = findFocusTarget(page, key);
    if (!target) {
      if (!late) requestAnimationFrame(look);
      return;
    }
    // 收起来的「没有读数」那一行：展开，让人直接看到这项为什么没有。
    if (!opened && target instanceof HTMLDetailsElement) target.open = true;
    opened = true;
    const height = page.getBoundingClientRect().height;
    steady = Math.abs(height - lastHeight) < 1 ? steady + 1 : 0;
    lastHeight = height;
    if (steady < STEADY_FRAMES && !late) {
      requestAnimationFrame(look);
      return;
    }
    const userScrolled = Math.abs(scroller.scrollTop - startTop) > 4;
    const delta = userScrolled ? 0 : focusScrollDelta(target, scroller, page);
    if (Math.abs(delta) <= 4) {
      ringFocus(target);
      return;
    }
    const smooth = !reducedMotion();
    let rung = false;
    const ring = () => {
      if (rung) return;
      rung = true;
      scroller.removeEventListener('scrollend', ring);
      if (target.isConnected) ringFocus(target);
    };
    if (smooth) {
      scroller.addEventListener('scrollend', ring, { once: true });
      window.setTimeout(ring, SCROLL_SETTLE_MS);
    }
    scroller.scrollBy({ top: delta, behavior: smooth ? 'smooth' : 'auto' });
    if (!smooth) ring();
  };
  requestAnimationFrame(look);
};
