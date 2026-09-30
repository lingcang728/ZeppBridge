import type { RouteLocationNormalized } from 'vue-router';
import type { PageMotion } from '../lib/navigation';
import { cardReplica, morphWindow, WINDOW_OFFSETS, windowRects, type WindowRect } from '../lib/motion/window';
import { deferSettle, hurryAnimation, onMotionEscape, onMotionSkip } from '../lib/motion/interrupt';
import { whenPageReady } from '../lib/motion/pageReady';

type Rect = { left: number; top: number; width: number; height: number };

/**
 * 从一张卡点进详情页：一扇圆角窗口从那张卡长成整页；返回时窗口缩回同一张卡（ColorOS 17 那种，
 * 细节见 lib/motion/window.ts）。窗口里先是那张卡的拷贝、跟着放大并淡掉，收回时反过来，
 * 落地那一帧就是卡本身，真卡原样接上。
 *
 * 形变只落在窗口这块板上：真实页面只动 opacity / transform，整页不逐帧重画。
 *
 * 用法（AppShell.vue）：`decide()` 在 router.beforeEach 里把普通的 forward / back 换成
 * expand / collapse；`onEnter` / `onLeave` / `onAfterLeave` 挂在切页的 <Transition> 上。
 */
/** 窗口从卡长满整页的时长。曲线先快后慢、没有回弹：像被抛出去、在终点减速落定
    （ColorOS 录屏：约 100ms 已长到一倍多，300ms 基本长满，之后只剩很短的一段收尾）。 */
const EXPAND_MS = 360;
const EXPAND_EASE = 'cubic-bezier(.22, .88, .26, 1)';
/** 新页首次加载最多等这么久（从点下去算起，含板长大那一段）；再久就先揭开（页面自己有骨架屏），
    不让一整屏卡片色停在那里。 */
const READY_TIMEOUT_MS = 560;
/** 返回：窗口从整页缩回那张卡（展开的逆过程），同样先快后慢、没有回弹，像被卡片吸回去。 */
const SHRINK_MS = 400;
const SHRINK_EASE = 'cubic-bezier(.25, .85, .3, 1)';
/** 来处页不在缓存里时要重新读库，那张卡可能要等一会儿才出现。板不等它：先按记住的位置缩，
    这段时间里找到了就把终点换成真卡（D-2）；超过这个时长还没有就落在记住的位置上。 */
const CARD_WAIT_MS = 300;
/** 收回途中按 Esc：剩下的部分在这么长里放完（沿用原来的曲线，不是跳到终点）。 */
const ESC_FINISH_MS = 200;
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
const reducedMotion = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;

/** 被点的链接所在的那张卡：链接本身够大就是它，否则往外找最近的一块板。 */
const cardOfLink = (link: HTMLElement): HTMLElement | null => {
  // 显式标了 data-morph-card 的一整条（概览底部的「数据来源」）：比一般的卡矮，也按卡算。
  const marked = link.closest<HTMLElement>('[data-morph-card]');
  if (marked) return marked;
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

type Trail = { back: string; href: string; index: number; rect: Rect; radius: number };
type Origin = { rect: Rect; radius: number; replica: { el: HTMLElement; rect: WindowRect } };

/** 正在从卡里长出来、还没揭开的那一页。Esc 撤回它。 */
type Inflight = { el: HTMLElement; retract: () => Promise<void>; revealed: boolean; aborted: boolean };

export const usePageMorph = (options: { back: () => void }) => {
  let pressed: HTMLElement | null = null;
  let inflight: Inflight | null = null;
  /** 撤回后回到的来处页：它进场时不再淡入（它刚才一直在板的四周露着）。 */
  let resumeStill = false;
  /** 进过场的页面（KeepAlive 缓存的会原样回来）。 */
  const entered = new WeakSet<Element>();
  let expandFrom: Origin | null = null;
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
    // 标了 data-morph-card 的条带跨入口（概览 → 设置卡）也展开：从哪里来回哪里去。
    if (link && (base === 'forward' || link.closest('[data-morph-card]'))) {
      const href = link.getAttribute('href') ?? '';
      const card = href === to.fullPath || href === to.path ? cardOfLink(link) : null;
      if (card) {
        // 按下那一刻就把卡拷一份：放大前的第一帧窗口里就是它，而不是一块空板。
        expandFrom = { rect: rectOf(card), radius: radiusOf(card), replica: cardReplica(card) };
        trails.set(to.fullPath, {
          back: from.fullPath,
          href,
          index: Math.max(0, linksTo(href, '.page-host > *').indexOf(link)),
          rect: expandFrom.rect,
          radius: expandFrom.radius,
        });
        return 'expand';
      }
    }
    // 不看方向，只看来路对不对得上：同一层之间（最近记录 → 睡眠详情）来回都算 forward，
    // 设置卡关回概览又是横向换入口。
    const trail = trails.get(from.fullPath);
    if (trail && trail.back === to.fullPath) {
      collapseTo = trail;
      return 'collapse';
    }
    // 设置里翻到另一张卡用的是 replace：来路跟着带过去，关掉时仍缩回当初那条。
    if (trail && from.path.startsWith('/settings/') && to.path.startsWith('/settings/')) trails.set(to.fullPath, trail);
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
    // 缓存页回场：卡片入场动画（material.css 的 card-enter）不再从头放一遍——
    // 否则每回一次概览，所有卡片连同心率图都像重新加载了一次。
    if (entered.has(el)) el.classList.add('page-revisit');
    entered.add(el);
    if (resumeStill && el instanceof HTMLElement) {
      resumeStill = false;
      el.style.transition = 'none';
      el.style.opacity = '1';
      window.setTimeout(() => { el.style.transition = ''; el.style.opacity = ''; }, 120);
    }
    const origin = expandFrom;
    expandFrom = null;
    const viewport = viewportOf();
    const host = main()?.parentElement;
    if (!origin || !viewport || !host || !(el instanceof HTMLElement)) return;
    const ghost = morphWindow({
      from: origin.rect,
      to: viewport,
      frame: viewport,
      fromRadius: origin.radius,
      toRadius: 0,
      host,
      duration: EXPAND_MS,
      easing: EXPAND_EASE,
      replica: { ...origin.replica, at: 'from' },
      scrim: 'in',
    });
    // 新页先整个藏起来。必须连 CSS 过渡一起关掉：否则 enter 那条 opacity 过渡会把它从
    // .999 慢慢降到 0，板还没长满时新页就半透明地叠在旧页上——那也是「闪一下」。
    el.style.transition = 'none';
    el.style.opacity = '0';
    // 被别的切页打断过：后面的揭开也一起快放。
    let hurry = false;
    const forget = onMotionSkip(() => { hurry = true; });
    // 板还没揭开时按 Esc：不进去了——板原路缩回那张卡，路由退回来处。
    const mine: Inflight = { el, retract: () => ghost.retract(), revealed: false, aborted: false };
    inflight = mine;
    const forgetEscape = onMotionEscape(() => {
      if (inflight !== mine || mine.revealed || mine.aborted) return false;
      mine.aborted = true;
      forgetEscape();
      void mine.retract();
      // 来处页一直在板的四周露着，回到场上时不要再从透明淡入一遍。
      resumeStill = true;
      window.setTimeout(() => { resumeStill = false; }, 1000);
      deferSettle();
      options.back();
      return true;
    });
    let ready = false;
    const pageReady = whenPageReady(READY_TIMEOUT_MS).then(() => { ready = true; });
    void ghost.arrived.then(() => { if (!ready && !mine.aborted) ghost.waiting(); });
    void Promise.all([ghost.arrived, pageReady]).then(() => {
      forget();
      if (mine.aborted) return;
      mine.revealed = true;
      el.style.opacity = '';
      const reveal = el.animate(
        [{ opacity: 0, transform: 'translateY(6px)' }, { opacity: 1, transform: 'none' }],
        { duration: hurry ? 90 : 220, easing: 'cubic-bezier(.2, .8, .2, 1)' },
      );
      // 揭开放完再把过渡还回去：这时 opacity 已经是 1，不会再触发一次过渡。
      const restore = () => {
        el.style.transition = '';
        forgetEscape();
        if (inflight === mine) inflight = null;
      };
      reveal.finished.then(restore, restore);
      ghost.release(hurry ? 90 : 200);
    });
  };

  /** 来处页此刻已经在场的话，当初那张卡。 */
  const currentCard = (trail: Trail): HTMLElement | null => {
    const link = linksTo(trail.href, STAYING)[trail.index] ?? null;
    return link ? cardOfLink(link) : null;
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

  /** 返回：一块圆角板从整页收回当初那张卡、落定后淡出，真卡亮一下（展开的逆过程）。
      详情页在板变实的那一小段里淡出，同时等比（不压扁）朝卡的方向缩一点，跟着板走。
      来处页一开始就在底下，板缩到哪儿、四周就露出到哪儿。找不到那张卡就落在展开时记住的位置上。 */
  const onLeave = (el: Element) => {
    const trail = collapseTo;
    collapseTo = null;
    // Esc 撤回的那一页：它从头到尾没露过面，板已经在往回缩，直接收场。
    if (inflight && inflight.el === el && inflight.aborted) {
      inflight = null;
      if (el instanceof HTMLElement) endLeave(el);
      return;
    }
    const viewport = viewportOf();
    const host = main()?.parentElement;
    if (!trail || !(el instanceof HTMLElement)) return;
    if (!viewport || !host) {
      endLeave(el);
      return;
    }
    // 缓存的来处页重新插回文档时，卡片入场动画（material.css 的 card-enter）会从头再放一遍：
    // 板要落到卡的最终位置上，卡却还在往上浮——直接放完它。
    const settleStaying = () => {
      const staying = main()?.querySelector<HTMLElement>(STAYING);
      for (const animation of staying?.getAnimations({ subtree: true }) ?? []) {
        if (animation instanceof CSSAnimation && animation.animationName === 'card-enter') animation.finish();
      }
    };
    settleStaying();
    // 按下返回的这一帧窗口就开始缩（D-2）：来处页已经在场就用真卡，否则先用展开时记住的位置。
    const present = currentCard(trail);
    let card: HTMLElement | null = present;
    const to = present ? rectOf(present) : trail.rect;
    const radius = present ? radiusOf(present) : trail.radius;
    // 详情页叠在窗口上面（z 26 > 窗口 25 > 遮罩 24），被裁成屏幕那么大的一块圆角「窗」，沿窗口同一条轨迹、
    // 同一条曲线等比缩向那张卡，前一半里和卡片内容交叉淡掉（ColorOS：窗口里的内容跟着窗口一起变小）。
    // 以前它 110ms 就淡没了，剩一整块空的深色窗口在缩——用户看到的「先变成深黑，再变回折线图」。
    // 裁切是静态的一层（只设一次），逐帧动的只有 transform / opacity。窗口一开始就是实的、带着页面
    // 底色，挡住来处页——页面本身是透明的，以前来处页从它底下透上来，第一帧两页叠影。
    el.style.zIndex = '26';
    const box = el.getBoundingClientRect();
    const vcx = viewport.left + viewport.width / 2;
    const vcy = viewport.top + viewport.height / 2;
    el.style.transformOrigin = `${r1(vcx - box.left)}px ${r1(vcy - box.top)}px`;
    el.style.clipPath = `inset(${r1(viewport.top - box.top)}px 0px ${r1(Math.max(0, box.bottom - viewport.top - viewport.height))}px 0px round 26px)`;
    const pageFrames: Keyframe[] = windowRects(viewport, to).map((rect, index) => {
      const scale = Math.max(0.05, rect.width / viewport.width);
      const dx = rect.left + rect.width / 2 - vcx;
      const dy = rect.top + rect.height / 2 - vcy;
      return { transform: `translate(${r1(dx)}px, ${r1(dy)}px) scale(${scale.toFixed(4)})`, offset: WINDOW_OFFSETS[index] };
    });
    el.animate(pageFrames, { duration: SHRINK_MS, easing: SHRINK_EASE, fill: 'forwards' });
    const fade = el.animate(
      [{ opacity: 1 }, { opacity: 1, offset: 0.2 }, { opacity: 0, offset: 0.62 }, { opacity: 0 }],
      { duration: SHRINK_MS, easing: SHRINK_EASE, fill: 'forwards' },
    );
    // 真卡在窗口底下先藏着：窗口落地时拷贝和它重合，撤掉窗口它正好接上。
    if (card) card.style.opacity = '0';
    const plate = morphWindow({
      from: viewport,
      to,
      frame: viewport,
      fromRadius: 0,
      toRadius: radius,
      host,
      duration: SHRINK_MS,
      easing: SHRINK_EASE,
      replica: present ? { ...cardReplica(present), at: 'to' } : null,
      scrim: 'out',
    });
    let landed = false;
    if (!present) {
      void findCard(trail).then((found) => {
        if (!found || landed || !el.isConnected) return;
        settleStaying();
        card = found;
        const replica = cardReplica(found);
        found.style.opacity = '0';
        plate.retarget(replica.rect, radiusOf(found), replica);
      });
    }
    // 落地：拷贝已经和真卡严丝合缝，撤掉窗口、真卡原样出现。不再「亮一下」——落地前那一帧本来就是卡。
    const land = () => {
      if (landed) return;
      landed = true;
      if (card) card.style.opacity = '';
      plate.remove();
    };
    void plate.arrived.then(land);
    // 收回途中按 Esc：剩下的这段在 200ms 里放完，保留原来的曲线——窗口照样落到卡上，只是快一点。
    const forgetEscape = onMotionEscape(() => {
      for (const animation of [...plate.animations(), fade, ...el.getAnimations()]) hurryAnimation(animation, ESC_FINISH_MS);
      return true;
    });
    void plate.arrived.then(() => forgetEscape());
    fade.finished.then(() => endLeave(el), () => endLeave(el));
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
    el.style.zIndex = '';
    el.style.clipPath = '';
  };
  const onAfterLeave = (el: Element) => {
    clean(el);
    if (el instanceof HTMLElement) el.style.top = '';
  };
  return { decide, onEnter, onLeave, onAfterLeave, dispose };
};
