import type { RouteLocationNormalized } from 'vue-router';
import type { PageMotion } from '../lib/navigation';
import { holdGhost, landGhost } from '../lib/motion/ghost';
import { onMotionSkip } from '../lib/motion/interrupt';
import { whenPageReady } from '../lib/motion/pageReady';

type Rect = { left: number; top: number; width: number; height: number };

/**
 * 从一张卡点进详情页：新页从那张卡的位置等比长成整页；返回时从四周均匀缩回那张卡。
 *
 * 形变只落在一块幽灵板上（lib/motion/ghost.ts）：以前对整页逐帧动 clip-path，每帧整页
 * 连图表一起重画，4K 屏上风扇狂转。现在真实页面只动 opacity / transform。
 *
 * 用法（AppShell.vue）：`decide()` 在 router.beforeEach 里把普通的 forward / back 换成
 * expand / collapse；`onEnter` / `onLeave` / `onAfterLeave` 挂在切页的 <Transition> 上。
 */
/** 板从卡长满整页的时长。缓动先快后慢：像被抛出去、在终点减速落定。 */
const EXPAND_MS = 340;
const EXPAND_EASE = 'cubic-bezier(.2, .9, .22, 1)';
/** 新页首次加载最多等这么久（从点下去算起，含板长大那一段）；再久就先揭开（页面自己有骨架屏），
    不让一整屏卡片色停在那里。 */
const READY_TIMEOUT_MS = 560;
/** 返回：详情页和板一起缩回那张卡。缩的这一段同样减速，像被卡片吸回去；板落到卡上以后再用 LAND_MS 淡出。 */
const SHRINK_MS = 360;
const LAND_MS = 120;
const SHRINK_EASE = 'cubic-bezier(.3, .7, .2, 1)';
/** 来处页不在缓存里时要重新读库，那张卡可能要等一会儿才出现。等的时候详情页原样留着，不盖板。 */
const CARD_WAIT_MS = 300;
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
const r1 = (value: number) => Number(value.toFixed(1));
const r3 = (value: number) => Number(value.toFixed(4));
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

  /** 新页从卡的位置长出来：幽灵板从卡长满可视区盖住旧页，**停在那里等新页首次加载完**，
      再淡出揭开新页。以前板长到六成新页就开始淡入，揭开的是骨架屏，数据一到整块换掉——
      那就是「点开闪一下」。真实页面只动 opacity / transform，整页不逐帧重画。 */
  const onEnter = (el: Element) => {
    clean(el);
    const origin = expandFrom;
    expandFrom = null;
    const viewport = viewportOf();
    const host = main()?.parentElement;
    if (!origin || !viewport || !host || !(el instanceof HTMLElement)) return;
    const ghost = holdGhost({
      from: origin.rect,
      to: viewport,
      fromRadius: origin.radius,
      toRadius: 0,
      host,
      duration: EXPAND_MS,
      easing: EXPAND_EASE,
    });
    // 新页先整个藏起来。必须连 CSS 过渡一起关掉：否则 enter 那条 opacity 过渡会把它从
    // .999 慢慢降到 0，板还没长满时新页就半透明地叠在旧页上——那也是「闪一下」。
    el.style.transition = 'none';
    el.style.opacity = '0';
    // 被 Esc 打断过：后面的揭开也一起快放，不然快进完长大那一段，又慢悠悠地淡入。
    let hurry = false;
    const forget = onMotionSkip(() => { hurry = true; });
    void Promise.all([ghost.grown, whenPageReady(READY_TIMEOUT_MS)]).then(() => {
      forget();
      el.style.opacity = '';
      const reveal = el.animate(
        [{ opacity: 0, transform: 'translateY(6px)' }, { opacity: 1, transform: 'none' }],
        { duration: hurry ? 90 : 220, easing: 'cubic-bezier(.2, .8, .2, 1)' },
      );
      // 揭开放完再把过渡还回去：这时 opacity 已经是 1，不会再触发一次过渡。
      const restore = () => { el.style.transition = ''; };
      reveal.finished.then(restore, restore);
      ghost.release(hurry ? 90 : 200);
    });
  };

  /** 当初那张卡：先等来处页回到场上（没缓存的页要重读库），最多等 CARD_WAIT_MS。 */
  const findCard = (trail: Trail): Promise<HTMLElement | null> =>
    new Promise((resolve) => {
      const started = performance.now();
      let done = false;
      // Esc 打断：不等了，有就用，没有就原地淡出。
      const forget = onMotionSkip(() => finish());
      const finish = () => {
        if (done) return;
        done = true;
        forget();
        const link = linksTo(trail.href, STAYING)[trail.index] ?? null;
        resolve(link ? cardOfLink(link) : null);
      };
      const look = () => {
        if (done) return;
        const link = linksTo(trail.href, STAYING)[trail.index] ?? null;
        if ((link && cardOfLink(link)) || performance.now() - started > CARD_WAIT_MS) finish();
        else requestAnimationFrame(look);
      };
      requestAnimationFrame(look);
    });

  /** 告诉 Vue 离场可以结束了：collapse 的离场过渡在 CSS 里是一条很长的占位，
      真正的时长由这里的动画决定，放完就提前收场。 */
  const endLeave = (el: HTMLElement) => {
    el.dispatchEvent(new TransitionEvent('transitionend', { propertyName: 'opacity' }));
  };

  /** 返回：详情页缩向当初那张卡、边缩边淡出；一块板同时从整页透明地缩到卡上、落定时实起来，
      再淡出露出真卡，真卡轻轻落定一下。来处页从一开始就在底下看得见——不再有一整屏的
      卡片色盖着等卡（那就是「返回时黑一下」）。找不到那张卡（被删了、翻页了）就原地淡出。 */
  const onLeave = (el: Element) => {
    const trail = collapseTo;
    collapseTo = null;
    const viewport = viewportOf();
    const host = main()?.parentElement;
    if (!trail || !(el instanceof HTMLElement)) return;
    if (!viewport || !host) {
      endLeave(el);
      return;
    }
    void findCard(trail).then((card) => {
      if (!el.isConnected) return;
      if (!card) {
        const fade = el.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 160, easing: 'ease-out', fill: 'forwards' });
        fade.finished.then(() => endLeave(el), () => endLeave(el));
        return;
      }
      const to = rectOf(card);
      const radius = radiusOf(card);
      // 可视区在详情页自己坐标里的位置：离场页是绝对定位、按滚动距离垫过的，顶边可能在屏幕外。
      const box = el.getBoundingClientRect();
      const sx = to.width / viewport.width;
      const sy = to.height / viewport.height;
      const tx = to.left - box.left - (viewport.left - box.left) * sx;
      const ty = to.top - box.top - (viewport.top - box.top) * sy;
      el.style.transformOrigin = '0 0';
      el.animate(
        [{ transform: 'none' }, { transform: `translate(${r1(tx)}px, ${r1(ty)}px) scale(${r3(sx)}, ${r3(sy)})` }],
        { duration: SHRINK_MS, easing: SHRINK_EASE, fill: 'forwards' },
      );
      // 页面比板先走：缩到一半左右已经看不见，剩下的形状交给板。
      const fade = el.animate([{ opacity: 1 }, { opacity: 0 }], { duration: SHRINK_MS * 0.5, easing: 'ease-in', fill: 'forwards' });
      landGhost({ viewport, to, radius, host, duration: SHRINK_MS + LAND_MS, easing: SHRINK_EASE }).finished.then(() => {
        card.animate(
          [{ transform: 'scale(.985)' }, { transform: 'none' }],
          { duration: 260, easing: 'cubic-bezier(.2, 1.4, .4, 1)' },
        );
      }, () => undefined);
      fade.finished.then(() => endLeave(el), () => endLeave(el));
    });
  };

  /** 离场页（KeepAlive 缓存着的）会原样再回来：留在它身上的 fill 动画和内联样式必须清掉。
      以前返回时的淡出是 fill: forwards，缓存页再点开时一揭开就又变回透明——
      「查看全部」黑屏就是这么来的。 */
  const clean = (el: Element) => {
    if (!(el instanceof HTMLElement)) return;
    for (const animation of el.getAnimations()) animation.cancel();
    el.style.transformOrigin = '';
    el.style.opacity = '';
    el.style.transition = '';
  };
  const onAfterLeave = (el: Element) => {
    clean(el);
    if (el instanceof HTMLElement) el.style.top = '';
  };
  return { decide, onEnter, onLeave, onAfterLeave, dispose };
};
