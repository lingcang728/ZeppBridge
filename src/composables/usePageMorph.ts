import type { RouteLocationNormalized } from 'vue-router';
import type { PageMotion } from '../lib/navigation';
import { playGhost, revealAfterGhost } from '../lib/motion/ghost';

type Rect = { left: number; top: number; width: number; height: number };

/**
 * 从一张卡点进详情页：新页从那张卡的位置等比长成整页；返回时整页缩回那张卡。
 *
 * 形变只落在一块幽灵板上（lib/motion/ghost.ts）：以前对整页逐帧动 clip-path，每帧整页
 * 连图表一起重画，4K 屏上风扇狂转。现在真实页面只动 opacity / transform。
 *
 * 用法（AppShell.vue）：`decide()` 在 router.beforeEach 里把普通的 forward / back 换成
 * expand / collapse；`onEnter` / `onLeave` 挂在切页的 <Transition> 上。
 */
const EXPAND_MS = 420;
const COLLAPSE_MS = 200;
const EXPAND_EASE = 'cubic-bezier(.2, .9, .22, 1)';
const COLLAPSE_EASE = 'cubic-bezier(.4, 0, .2, 1)';
/** 太小的东西（行内的小链接、图标）不当作「卡」：从一个字那么大长成整页没有意义。 */
const MIN_WIDTH = 140;
const MIN_HEIGHT = 56;

const rectOf = (el: Element): Rect => {
  const box = el.getBoundingClientRect();
  return { left: box.left, top: box.top, width: box.width, height: box.height };
};
const main = () => document.getElementById('main-content');
const bigEnough = (el: Element | null): boolean => {
  if (!(el instanceof HTMLElement)) return false;
  const box = el.getBoundingClientRect();
  return box.width >= MIN_WIDTH && box.height >= MIN_HEIGHT;
};
const radiusOf = (el: Element) => Number.parseFloat(getComputedStyle(el).borderTopLeftRadius) || 22;
const reducedMotion = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;

/** 被点的链接所在的那张卡：链接本身够大就是它，否则往外找最近的一块板。 */
const cardOfLink = (link: HTMLElement): HTMLElement | null => {
  const box = bigEnough(link) ? link : link.closest<HTMLElement>('.metric-panel, .surface-card, .trend-card, li, section');
  return box && bigEnough(box) ? box : null;
};

/** 按下的是页面内容里的一个链接（顶栏、底部导航里的不算）。 */
const linkOf = (target: EventTarget | null): HTMLElement | null => {
  const el = target instanceof Element ? target : null;
  const link = el?.closest<HTMLElement>('a[href]');
  if (!link || link.closest('.shell-head, .bottom-nav')) return null;
  return main()?.contains(link) ? link : null;
};

/** 当前页里指向 `href` 的所有链接，按文档顺序。同一页常有好几个（「本周」里的「训练」小格和
    下面的「训练状态」卡都去 /training），所以来回都按「第几个」认，而不是取第一个。 */
const linksTo = (href: string, scope: string) => {
  const root = main();
  return root ? [...root.querySelectorAll<HTMLElement>(`${scope} a[href="${CSS.escape(href)}"]`)] : [];
};
const STAYING = '.page-host > :not([class*="-leave"])';

type Trail = { back: string; href: string; index: number };

export const usePageMorph = () => {
  let pressed: HTMLElement | null = null;
  let expandFrom: { rect: Rect; radius: number } | null = null;
  let collapseTo: Trail | null = null;
  /** 每个详情页是从哪张卡展开来的：键是详情页的 fullPath。 */
  const trails = new Map<string, Trail>();

  const remember = (event: Event) => { pressed = linkOf(event.target); };
  const rememberKey = (event: KeyboardEvent) => {
    if (event.key === 'Enter' || event.key === ' ') remember(event);
  };
  document.addEventListener('pointerdown', remember, true);
  document.addEventListener('keydown', rememberKey, true);
  const dispose = () => {
    document.removeEventListener('pointerdown', remember, true);
    document.removeEventListener('keydown', rememberKey, true);
  };

  const decide = (from: RouteLocationNormalized, to: RouteLocationNormalized, base: PageMotion): PageMotion => {
    const link = pressed;
    pressed = null;
    expandFrom = null;
    collapseTo = null;
    if (reducedMotion()) return base;
    if (base === 'forward' && link) {
      const href = link.getAttribute('href') ?? '';
      const card = href === to.fullPath || href === to.path ? cardOfLink(link) : null;
      if (card) {
        expandFrom = { rect: rectOf(card), radius: radiusOf(card) };
        trails.set(to.fullPath, { back: from.fullPath, href, index: Math.max(0, linksTo(href, '.page-host > *').indexOf(link)) });
        return 'expand';
      }
    }
    // 同一层之间（最近记录 → 睡眠详情）来回都算 forward，所以不看方向，只看来路对不对得上。
    if (base === 'back' || base === 'forward') {
      const trail = trails.get(from.fullPath);
      if (trail && trail.back === to.fullPath) {
        collapseTo = trail;
        return 'collapse';
      }
    }
    return base;
  };

  const viewportOf = (): Rect | null => {
    const root = main();
    if (!root) return null;
    const box = rectOf(root);
    return { left: box.left, top: box.top, width: root.clientWidth, height: root.clientHeight };
  };

  /** 新页从卡的位置长出来：幽灵板从卡长到可视区盖住旧页，新页在它后半程淡入，板再淡出。
      真实页面只动 opacity / transform，整页不再逐帧重画。 */
  const onEnter = (el: Element) => {
    const origin = expandFrom;
    expandFrom = null;
    const viewport = viewportOf();
    const host = main()?.parentElement;
    if (!origin || !viewport || !host || !(el instanceof HTMLElement)) return;
    playGhost({
      from: origin.rect,
      to: viewport,
      fromRadius: origin.radius,
      toRadius: 0,
      host,
      duration: EXPAND_MS,
      easing: EXPAND_EASE,
    });
    el.animate(revealAfterGhost(), { duration: EXPAND_MS });
  };

  /** 返回：不再把整页缩回去（以前是一整块暗色页飞回去再换成卡）。详情页轻轻淡出，
      底下的来处页淡入，当初那张卡原地轻落一下——落地的就是真卡本身，不会换一帧。 */
  const onLeave = (el: Element) => {
    const trail = collapseTo;
    collapseTo = null;
    if (!trail || !(el instanceof HTMLElement)) return;
    el.animate(
      [{ opacity: 1, transform: 'none' }, { opacity: 0, transform: 'scale(.985)' }],
      { duration: COLLAPSE_MS, easing: COLLAPSE_EASE, fill: 'forwards' },
    );
    requestAnimationFrame(() => {
      const link = linksTo(trail.href, STAYING)[trail.index] ?? null;
      const card = link ? cardOfLink(link) : null;
      card?.animate(
        [{ transform: 'scale(.97)', opacity: 0.6 }, { transform: 'none', opacity: 1 }],
        { duration: 320, easing: EXPAND_EASE },
      );
    });
  };

  return { decide, onEnter, onLeave, dispose };
};
