/** Mouse swipes only navigate when they start in page chrome, not in a control. */
export const PAGE_SWIPE_ROUTES = ['/', '/ai', '/settings'] as const;

export function canStartPageSwipe(target: EventTarget | null, scrollRoot: HTMLElement): boolean {
  if (!(target instanceof Element)) return false;
  if (target.closest('button, a, input, textarea, select, label, ul, ol, table, [contenteditable], [role="button"], [role="slider"], [role="listbox"], [role="list"], [draggable="true"], canvas, svg, .echarts, .orbit-host, .orbit-canvas, .workout-list, .source-list, .task-list, .list-card, [data-no-page-swipe]')) return false;
  for (let node = target.parentElement; node && node !== scrollRoot; node = node.parentElement) {
    const style = getComputedStyle(node);
    if (/(auto|scroll)/.test(style.overflowX) && node.scrollWidth > node.clientWidth) return false;
    if (/(auto|scroll)/.test(style.overflowY) && node.scrollHeight > node.clientHeight) return false;
  }
  return true;
}

export function swipeDestination(path: string, dx: number, dy: number): string | null {
  const index = PAGE_SWIPE_ROUTES.indexOf(path as typeof PAGE_SWIPE_ROUTES[number]);
  if (index < 0 || Math.abs(dx) < 72 || Math.abs(dx) < Math.abs(dy) * 1.35) return null;
  return PAGE_SWIPE_ROUTES[index + (dx < 0 ? 1 : -1)] ?? null;
}
