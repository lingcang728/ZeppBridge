/**
 * 从哪里来回哪里去：返回时回到原来的滚动位置。
 *
 * 以前还会给当初点进去的那张卡描一圈绿框「亮一下」，那是卡片形变还不会「回到原卡」时用来定位的；
 * 现在窗口形变本身就落回那张卡，绿框只显得突兀（用户 2026-09-30），已删。
 *
 * 滚动容器是 #main-content 而不是 window，vue-router 的 scrollBehavior 管不到它；以前
 * 每次切页都滚回顶部——从概览中段的 HRV 点进详情，返回时回到概览最上面，还得重新往下找。
 *
 * 做法：每条历史记录（history.state.position）离开时记下滚动距离和「是点了哪个东西
 * 离开的」（最近一次按下的链接 href，或带 data-return-key 的元素）；回到这条记录时
 * 恢复滚动。详情页的数据是异步来的、页面会慢慢变高，
 * 所以恢复滚动会在 1.5 秒内多试几帧，直到页面够高。
 */
import type { Router } from 'vue-router';

type Memory = { top: number; key: string | null };

const main = () => document.getElementById('main-content');
const positionOf = (): number | null => {
  const value = (window.history.state as { position?: unknown } | null)?.position;
  return typeof value === 'number' ? value : null;
};

/** 触发离开的元素的标识：优先 data-return-key，其次链接的 href。 */
const keyOf = (target: EventTarget | null): string | null => {
  const el = target instanceof Element ? target : null;
  const keyed = el?.closest<HTMLElement>('[data-return-key]');
  if (keyed?.dataset.returnKey) return `key:${keyed.dataset.returnKey}`;
  const link = el?.closest('a[href]');
  const href = link?.getAttribute('href');
  return href ? `href:${href}` : null;
};

export const installReturnScroll = (router: Router) => {
  const memory = new Map<number, Memory>();
  let lastKey: string | null = null;
  /** 当前停在哪条历史记录上。不能在 beforeEach 里读 history.state：后退时浏览器已经先把
      它换成了目标那条，读到的是要去的地方而不是要离开的地方。 */
  let current: number | null = positionOf();
  let leaving: number | null = null;

  document.addEventListener('pointerdown', (event) => { lastKey = keyOf(event.target); }, true);
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' || event.key === ' ') lastKey = keyOf(event.target);
  }, true);

  router.beforeEach(() => {
    leaving = current;
    if (leaving !== null) memory.set(leaving, { top: main()?.scrollTop ?? 0, key: lastKey });
    lastKey = null;
  });

  router.afterEach((_to, _from, failure) => {
    if (failure) return;
    const arrived = positionOf();
    current = arrived;
    const saved = arrived !== null && leaving !== null && arrived < leaving ? memory.get(arrived) : undefined;
    const root = main();
    if (!root) return;
    // 先照旧回到顶部：离场旧页的垫高就是按「滚动区回到 0」算的；要恢复的话下一帧再滚过去，
    // 并把旧页一起挪同样的距离。
    root.scrollTo({ top: 0 });
    if (!saved) return;
    const started = performance.now();
    /* 离场的旧页是绝对定位、按离开时的滚动距离垫好的（AppShell.vue 的 onPageBeforeLeave）；
       滚动区现在要换一个位置，旧页得跟着挪同样的距离，淡出的那一帧才不会跳。 */
    const scrollKeepingLeaving = (top: number) => {
      const before = root.scrollTop;
      root.scrollTo({ top });
      const delta = root.scrollTop - before;
      if (!delta) return;
      for (const el of root.querySelectorAll<HTMLElement>('.page-host > [class*="-leave-active"]')) {
        el.style.top = `${(Number.parseFloat(el.style.top) || 0) + delta}px`;
      }
    };
    const restore = () => {
      const maxTop = root.scrollHeight - root.clientHeight;
      scrollKeepingLeaving(Math.min(saved.top, Math.max(0, maxTop)));
      if (maxTop < saved.top - 2 && performance.now() - started < 1500) {
        requestAnimationFrame(restore);
        return;
      }
    };
    requestAnimationFrame(restore);
  });
};
