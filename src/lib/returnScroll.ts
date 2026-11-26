/**
 * 从哪里来回哪里去：返回时回到原来的滚动位置。
 *
 * 以前还会给当初点进去的那张卡描一圈绿框「亮一下」，那是卡片形变还不会「回到原卡」时用来定位的；
 * 现在窗口形变本身就落回那张卡，绿框只显得突兀，已删。
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

/** 正在恢复滚动的那一轮（会等页面长高、最多 1.5 秒）：卡 ↔ 页形变期间攒下的滚动要等它结束再补
    （composables/usePageMorph.ts），不然补上去的量会被下一帧的恢复盖掉。 */
let restoring: Promise<void> | null = null;
let restored: (() => void) | null = null;
const finishRestore = () => { restored?.(); restored = null; restoring = null; };
export const whenScrollRestored = (): Promise<void> => restoring ?? Promise.resolve();
/** 下一次后退不回到离开时的位置，而是滚到 `resolve()` 给的高度（返回 null 就照旧）：详情页往外缩回列表的日档时，
    列表离开时停在月档的位置已经不对了，要停在那一条上（lib/album/recordZoom.ts）。只管下一次后退。 */
let steer: (() => number | null) | null = null;
export const steerReturnScroll = (resolve: () => number | null): void => { steer = resolve; };
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

  router.afterEach((to, from, failure) => {
    if (failure) return;
    finishRestore();
    const steering = steer;
    steer = null;
    const arrived = positionOf();
    current = arrived;
    const saved = arrived !== null && leaving !== null && arrived < leaving ? memory.get(arrived) : undefined;
    const root = main();
    if (!root) return;
    // 年轮换年份只更新查询参数，舞台仍在原处，不要把整页拉回顶部。
    if (to.name === 'Rings' && from.name === 'Rings' && to.path === from.path) return;
    // 同一页只换了参数（设置卡叠从 /settings/privacy 回到 /settings，或在已展开的卡之间圆点/拖拽切换）：
    // 没有离场的旧页要垫，页面也不用等数据长高。若在展开卡之间切换或无历史直接收回到总览时强行滚到 0，
    // 整张卡和底部的圆点会在指针下突然跳走。只有从总览新打开一张卡（!from.params.card && to.params.card）
    // 才照旧回到顶部，配合 useDeckMorph.open 的总览位移补偿把新大卡顶边对齐视口。
    if (to.matched[0] && to.matched[0] === from.matched[0]) {
      if (saved) {
        root.scrollTo({ top: saved.top });
        return;
      }
      if (from.params.card) return;
    }
    // 先照旧回到顶部：离场旧页的垫高就是按「滚动区回到 0」算的；要恢复的话下一帧再滚过去，
    // 并把旧页一起挪同样的距离。
    root.scrollTo({ top: 0 });
    if (!saved) return;
    const started = performance.now();
    const round = new Promise<void>((resolve) => { restored = resolve; });
    restoring = round;
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
      for (const veil of root.querySelectorAll<HTMLElement>('.page-host > * > .page-veil')) {
        veil.style.top = `${(Number.parseFloat(veil.style.top) || 0) + delta}px`;
      }
    };
    // 按某一行定位时（steering），没画过的行按估计高度占位、滚过去才按真高度排开，那一行会被挤开一截：
    // 多钉几帧，直到连续两帧都不用再挪。
    let steady = 0;
    /* 能滚到哪：只按回场的这一页自己的高度算。离场的旧页（绝对定位、按离开时的滚动距离往下垫着）也撑着滚动区，
       按 scrollHeight 算的话，回场页还没长到原来那么高时会被滚到它自己底下的空白里；旧页一撤，浏览器把滚动夹回去，
       整页往下一跳（从概览底部的「管理」进设置再返回时就是这样）。 */
    const ownMaxTop = () => {
      const page = root.querySelector<HTMLElement>('.page-host > :not([class*="-leave"])');
      if (!page) return root.scrollHeight - root.clientHeight;
      const host = page.parentElement!;
      const tail = (Number.parseFloat(getComputedStyle(root).paddingBottom) || 0)
        + (Number.parseFloat(getComputedStyle(host).paddingBottom) || 0)
        + (Number.parseFloat(getComputedStyle(page).marginBottom) || 0);
      const bottom = page.getBoundingClientRect().bottom - root.getBoundingClientRect().top + root.scrollTop + tail;
      return Math.min(root.scrollHeight, Math.ceil(bottom)) - root.clientHeight;
    };
    const restore = () => {
      const maxTop = ownMaxTop();
      const goal = steering?.() ?? saved.top;
      const before = root.scrollTop;
      scrollKeepingLeaving(Math.min(goal, Math.max(0, maxTop)));
      steady = Math.abs(root.scrollTop - before) < 1 ? steady + 1 : 0;
      const unsettled = steering ? steady < 2 : false;
      if ((maxTop < goal - 2 || unsettled) && performance.now() - started < 1500) {
        requestAnimationFrame(restore);
        return;
      }
      if (restoring === round) finishRestore();
    };
    requestAnimationFrame(restore);
  });
};
