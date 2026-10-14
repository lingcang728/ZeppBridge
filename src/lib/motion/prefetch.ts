import { watch } from 'vue';
import type { Router } from 'vue-router';
import { dataRevision } from '../../composables/sync/state';
import { whenMotionIdle } from './budget';

/**
 * 点下去之前就把下一页备好（手机厂商的预加载）：代码块和首屏数据都先取回来。
 *
 * 以前点下去才 `import()` 页面代码块、页面挂载了才去读库：形变要等它们，卡片长成整页以后还停在骨架上
 * ——用户看到的是「点开心率卡每次都要加载一秒」。现在三个时机提前备：
 * - 指针移到页面里的链接上、键盘聚焦到它、按下去：取那一页的代码块和首屏数据；
 * - 应用空闲时（启动后、每次同步落了新数据后）：把概览上那几张卡要去的页一张张先读好；
 * - 真的点开时，切页前最多再等一小会儿（`preloadBeforeOpen`），读好了新页第一帧就是真内容。
 * 数据缓存跟着数据版本走，同步落了新数据就作废（lib/readCache.ts）。
 */
type Loader = () => Promise<unknown>;

/** vue-router 判断「不是懒加载函数」的同一套条件：组件对象、带 props / displayName 的函数式组件。 */
const isLoader = (value: unknown): value is Loader =>
  typeof value === 'function' && !('displayName' in value) && !('props' in value) && !('__vccOpts' in value);

/** 首屏数据的查询表带着各页的指标清单，不进首屏：第一次用到才取。 */
const queries = () => import('../pageQueries');

const main = () => document.getElementById('main-content');

/** 那一页的首屏数据先读起来（不等）。正在放形变就等它放完再读：读回来的那一下解析不压在动画上。 */
const warmData = (href: string) => {
  void whenMotionIdle().then(queries).then((module) => module.preloadRoute(href)).catch(() => undefined);
};

/**
 * 从卡片展开之前（router.beforeEach 里）：那一页的首屏数据最多再等 `capMs`。
 * 大多数时候悬停时已经读好了，这里立刻就过；读不完也不让人干等，页面自己的骨架接着。
 */
export const preloadBeforeOpen = (href: string, capMs = 220): Promise<void> => Promise.race([
  queries().then((module) => module.preloadRoute(href)).catch(() => undefined),
  new Promise<void>((resolve) => { setTimeout(resolve, capMs); }),
]);

/** 空闲预备一轮最多备几页（一页就是那一页首屏的一组查询）。 */
const IDLE_BUDGET = 12;

/**
 * 当前页里看得见的和上下各一屏以内的站内链接，离视口越近越靠前，去重后最多 IDLE_BUDGET 个。
 * 空闲回调里读矩形：布局这时一般是干净的，只读不写，不会来回强制排版。
 */
const nearbyHrefs = (): string[] => {
  const scroller = main();
  if (!scroller) return [];
  const view = scroller.getBoundingClientRect();
  const reach = Math.max(view.height, 1);
  const best = new Map<string, number>();
  for (const link of scroller.querySelectorAll<HTMLAnchorElement>('.page-host a[href^="/"]')) {
    const href = link.getAttribute('href') ?? '';
    const box = link.getBoundingClientRect();
    if (!box.width && !box.height) continue;
    const distance = box.bottom < view.top ? view.top - box.bottom : box.top > view.bottom ? box.top - view.bottom : 0;
    if (distance > reach) continue;
    if (distance < (best.get(href) ?? Infinity)) best.set(href, distance);
  }
  return [...best].sort((a, b) => a[1] - b[1]).slice(0, IDLE_BUDGET).map(([href]) => href);
};

const idle = (run: () => void) => {
  if (typeof window.requestIdleCallback === 'function') window.requestIdleCallback(run, { timeout: 2000 });
  else window.setTimeout(run, 200);
};

export const installPrefetch = (router: Router): (() => void) => {
  const warmed = new Map<string, number>();
  const warmCode = (href: string) => {
    try {
      for (const record of router.resolve(href).matched) {
        for (const component of Object.values(record.components ?? {})) {
          if (isLoader(component)) void component().catch(() => warmed.delete(href));
        }
      }
    } catch {
      warmed.delete(href);
    }
  };
  const warm = (target: EventTarget | null) => {
    const link = target instanceof Element ? target.closest<HTMLAnchorElement>('a[href]') : null;
    const href = link?.getAttribute('href');
    if (!link || !href || !href.startsWith('/') || !main()?.contains(link)) return;
    // 指针在一张卡里移动会连着触发很多次：同一个链接一秒内只备一次（数据缓存本身也会去重）。
    const now = performance.now();
    if (now - (warmed.get(href) ?? -Infinity) < 1000) return;
    warmed.set(href, now);
    warmData(href);
    warmCode(href);
  };
  const onEvent = (event: Event) => warm(event.target);
  document.addEventListener('pointerover', onEvent, true);
  document.addEventListener('pointerdown', onEvent, true);
  document.addEventListener('focusin', onEvent, true);

  // 空闲时把当前页上那几张卡要去的页一张张读好：一次只读一页，读完再等下一个空闲，不和界面抢。
  // 只备看得见的和附近的（离视口近的先备），每轮最多 IDLE_BUDGET 页：以前整页链接全扫，进睡眠 / 运动列表
  // 十秒里把两百条历史详情全读一遍（性能审计 01），还把刚备好的近处记录挤出缓存。滚到别处、按下、
  // 换页都会重排一轮，没开始的那些就不读了；悬停 / 聚焦 / 按下的那一页照旧立刻备（上面的 warm）。
  let pass = 0;
  const warmVisibleDestinations = () => {
    const mine = ++pass;
    window.setTimeout(() => idle(() => {
      if (mine !== pass) return;
      const hrefs = nearbyHrefs();
      void queries().then(async (module) => {
        for (const href of hrefs) {
          if (mine !== pass || !module.queriesFor(href).length) continue;
          warmCode(href);
          await whenMotionIdle();
          await module.preloadRoute(href);
          await new Promise<void>((resolve) => idle(resolve));
        }
      }).catch(() => undefined);
    }), 1500);
  };
  warmVisibleDestinations();
  const stopRevision = watch(dataRevision, warmVisibleDestinations);
  const stopRoute = router.afterEach(() => warmVisibleDestinations());
  // 滚动和按下：正在排队的那一轮作废，停下来以后按新的视口重排（setTimeout 本身就把连续滚动合成一次）。
  const reschedule = () => warmVisibleDestinations();
  const scroller = main();
  scroller?.addEventListener('scroll', reschedule, { passive: true });
  document.addEventListener('pointerdown', reschedule, true);

  return () => {
    pass += 1;
    stopRevision();
    stopRoute();
    scroller?.removeEventListener('scroll', reschedule);
    document.removeEventListener('pointerdown', reschedule, true);
    document.removeEventListener('pointerover', onEvent, true);
    document.removeEventListener('pointerdown', onEvent, true);
    document.removeEventListener('focusin', onEvent, true);
  };
};
