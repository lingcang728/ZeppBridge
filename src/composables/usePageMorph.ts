import type { RouteLocationNormalized } from 'vue-router';
import type { PageMotion } from '../lib/navigation';
import { unscaledBox } from '../lib/deck/morph';
import { holdMotion } from '../lib/motion/budget';
import { deferSettle, exemptFromSettle, hurryAnimation, onMotionEscape, onMotionSkip } from '../lib/motion/interrupt';
import { CLOSE_EASE, CLOSE_MS, OPEN_EASE, OPEN_MS, RECEDE_OPACITY, RECEDE_SCALE } from '../lib/motion/timing';
import {
  backdropFor, fly, HEAD_IN, HEAD_OUT, hide, PAGE_BODY_IN, PAGE_BODY_OUT, REPLICA_IN, REPLICA_OUT,
} from '../lib/motion/pageFlight';
import { bleedRect, cardReplica, type WindowRect } from '../lib/motion/window';
import { findFocusTarget, focusKeyOf, focusScrollDelta, revealFocusLater } from '../lib/motion/focusTarget';
import { whenFramesSteady } from '../lib/motion/steady';

type Rect = WindowRect;

/**
 * 从一张卡点进详情页：新页从那张卡里「长」出来；返回时缩回同一张卡。和设置卡叠（useDeckMorph）是同一种做法
 * （2026-10-03 第二版，改之前录屏逐帧看：点开那一下一帧就变成整屏黑板、停 0.3 秒、再淡入新页）：
 *
 * - **动的是新页自己**：页面做 `translate` + 定圆角的 `clip-path: inset()`，1:1 不缩放，从卡的矩形裁到整个可视区，
 *   左上角从卡的左上角滑回原位——页头天然落在卡所在处，像设置大卡的卡头。页面底下的垫底（页面本身是透明的）
 *   和上面那份卡的拷贝都是页面自己的子元素，吃同一道裁切：只有一道合成器动画，逐帧严丝合缝。
 *   （第一版垫底是另一块 fixed 的板，它的裁切动画上不了合成器，新页挂载时就停在卡上不动。）
 * - **全程有东西可看，但不叠影**：卡拷贝 0–24% 淡出，页头 16–42% 淡入，页面其余部分 20–56% 淡入（pageFlight.ts 的分段）。
 *   不再「板长满了等数据」：数据晚到由页面自己的骨架交叉淡接住（shell.css 的 skeleton-out）。
 * - **先备好再展开**（2026-10-03 第二轮，像手机打开 App 那样）：页面代码块和首屏数据在悬停、按下、应用空闲时
 *   就读好了（lib/motion/prefetch.ts、lib/pageQueries.ts），切页前最多再等一小会儿；新页挂载时直接用读好的数据，
 *   连图表一起画好第一帧，形变才开始放——窗口里从头到尾是真内容，没有骨架、没有「长满了再加载」。
 * - **来处页退后一层**：缩到 .94、淡到 .32（设置卡叠的 `.is-receded`），不是蒙一层再撤掉。
 * - **形变期间主线程空着**：形变开跑时 holdMotion()，还没来得及挂的图表、晚到的骨架换内容都等它放完（lib/motion/budget.ts）。
 * - 收回完全对称：详情页裁回卡的矩形、页面内容先淡掉、页头和卡拷贝交叉，落地那一帧拷贝就是真卡。
 *
 * 用法（AppShell.vue）：`decide()` 在 router.beforeEach 里把普通的 forward / back 换成
 * expand / collapse；`onEnter` / `onLeave` / `onAfterLeave` 挂在切页的 <Transition> 上。
 */
/** 来处页不在缓存里时要重新读库，那张卡可能要等一会儿才出现。窗口不等它：先按记住的位置缩，
    这段时间里找到了就把终点换成真卡；超过这个时长还没有就落在记住的位置上。 */
const CARD_WAIT_MS = 300;
/** 收回途中按 Esc：剩下的部分在这么长里放完（沿用原来的曲线，不是跳到终点）。 */
const ESC_FINISH_MS = 200;
/** 找不到卡、没有拷贝可以落地时，页面在终点上淡掉的时长。 */
const LAND_FADE_MS = 140;
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
  // 同一层里平移（单天页的「前一天 / 后一天」）：不是从哪张卡打开，不形变。
  if (link.closest('[data-no-morph]')) return null;
  // 显式标了 data-morph-card 的一整条（概览底部的「数据来源」）：比一般的卡矮，也按卡算。
  const marked = link.closest<HTMLElement>('[data-morph-card]');
  if (marked) return marked;
  const box = bigEnough(link) ? link : link.closest<HTMLElement>('.metric-panel, .surface-card, .trend-card, li, section');
  return box && bigEnough(box) ? box : null;
};

/** 按下的是页面内容里的一个链接（顶栏、底部导航里的不算）。浮在页面外面、挂在 body 上的控件
    （交给 AI 的底栏）显式标了 data-morph-card 的也算：寄出前检查从那枚胶囊长出来。 */
const linkOf = (target: EventTarget | null): HTMLElement | null => {
  const el = target instanceof Element ? target : null;
  const link = el?.closest<HTMLElement>('a[href]');
  if (!link || link.closest('.shell-head, .bottom-nav')) return null;
  if (main()?.contains(link)) return link;
  return link.closest('[data-morph-card]') ? link : null;
};

/** 当前页里指向 `href` 的所有链接，按文档顺序。同一页常有好几个（「本周」里的「训练」小格和
    下面的「训练状态」卡都去 /training），所以来回都按「第几个」认，而不是取第一个。 */
const linksTo = (href: string, scope: string) => {
  const root = main();
  return root ? [...root.querySelectorAll<HTMLElement>(`${scope} a[href="${CSS.escape(href)}"]`)] : [];
};
const STAYING = '.page-host > :not([class*="-leave"])';

/** 告诉 Vue 离场可以结束了：expand / collapse 的离场过渡在 CSS 里是一条很长的占位，
    真正的时长由这里的动画决定，放完就提前收场。 */
const endLeave = (el: HTMLElement) => {
  el.dispatchEvent(new TransitionEvent('transitionend', { propertyName: 'opacity' }));
};

/** `source`：不是从链接、而是从一张卡直接开的（armPageMorph）：返回时按这个标记找回那张卡。 */
type Trail = { back: string; href: string; index: number; rect: Rect; radius: number; source?: string };

/**
 * 从一张卡直接形变进某一页（不是点卡里的链接）：指标卡上的「问 AI」选了问题以后从这张卡长进「交给 AI」，
 * 返回时缩回这张卡（2026-10-07 第二轮）。先 arm，再 router.push；下一次切页的 decide() 用掉它。
 * 卡上会留一个 data-morph-source 标记，返回时靠它找回卡（来处页是 KeepAlive 缓存的，卡还是那一张）。
 */
let armed: { card: HTMLElement; href: string; id: string; at: number } | null = null;
let armSeq = 0;
export const armPageMorph = (card: HTMLElement | null, href: string): void => {
  if (!card) { armed = null; return; }
  const id = card.dataset.morphSource || `m${(armSeq += 1)}`;
  card.dataset.morphSource = id;
  armed = { card, href, id, at: performance.now() };
};
/** 被 arm 的卡：只在 arm 之后一小会儿内有效（选完问题就切页；别让一个过期的 arm 劫持之后不相干的切页）。 */
const takeArmed = (to: RouteLocationNormalized) => {
  const hit = armed && performance.now() - armed.at < 1500 && (armed.href === to.fullPath || armed.href === to.path) && armed.card.isConnected ? armed : null;
  armed = null;
  return hit;
};
type Origin = { card: HTMLElement; rect: Rect; radius: number; replica: { el: HTMLElement; rect: Rect } };
/** 收回：详情页已经在离场，等来处页回到场上、滚动位置恢复以后的那一帧才开始缩。 */
type Collapse = {
  el: HTMLElement; trail: Trail; backdrop: HTMLElement; staying: HTMLElement | null; release: () => void;
  /** 离开时详情页滚下去了多少：返回时缩回卡的是此刻看得见的那一段，不是页面顶上。 */
  lift: number;
};

export const usePageMorph = (options: { back: () => void }) => {
  let pressed: HTMLElement | null = null;
  /** 撤回后回到的来处页：它进场时不再淡入（它刚才一直在窗口四周露着）。 */
  let resumeStill = false;
  /** 进过场的页面（KeepAlive 缓存的会原样回来）。 */
  const entered = new WeakSet<Element>();
  /** 正在倒放的动画（Esc 撤回）：页面回到场上时的 clean() 不能把它们一刀切掉。 */
  const kept = new WeakSet<Animation>();
  /** 展开到一半被 Esc 撤回的新页：撤回放完才让它离场（之前它还在窗口里跟着缩回去）。 */
  const aborted = new WeakMap<Element, { done: boolean; leaving: boolean; settle: () => void }>();
  let expandFrom: Origin | null = null;
  /** 展开时正在退场的来处页（onLeave 先于 onEnter 被调）：等窗口长满再让它走。 */
  let expandLeaving: HTMLElement | null = null;
  let collapseTo: Trail | null = null;
  /** 返回时详情页此刻的滚动距离（decide 时量，切页后滚动区会被拉回顶上）。 */
  let collapseLift = 0;
  /** 这次切页要定位到的那张卡（链接上的 ?focus=，lib/motion/focusTarget.ts）。 */
  let focusKey: string | null = null;
  let pendingCollapse: Collapse | null = null;
  /** decide() 决定要形变时登记的「主线程留给动画」：由接下来的 onEnter / onLeave 接手释放。 */
  let hold: (() => void) | null = null;
  const takeHold = () => {
    const release = hold ?? (() => undefined);
    hold = null;
    return release;
  };
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

  const morphing = (motion: PageMotion): PageMotion => {
    hold?.();
    hold = holdMotion();
    return motion;
  };

  const decide = (from: RouteLocationNormalized, to: RouteLocationNormalized, base: PageMotion): PageMotion => {
    const link = pressed;
    pressed = null;
    expandFrom = null;
    expandLeaving = null;
    collapseTo = null;
    collapseLift = 0;
    focusKey = focusKeyOf(to);
    hold?.();
    hold = null;
    const direct = takeArmed(to);
    if (reducedMotion()) return base;
    if (direct && bigEnough(direct.card)) {
      expandFrom = { card: direct.card, rect: rectOf(direct.card), radius: radiusOf(direct.card), replica: cardReplica(direct.card) };
      trails.set(to.fullPath, { back: from.fullPath, href: direct.href, index: 0, rect: expandFrom.rect, radius: expandFrom.radius, source: direct.id });
      return 'expand';
    }
    // 标了 data-morph-card 的条带跨入口（概览 → 设置卡）也展开：从哪里来回哪里去。
    if (link && (base === 'forward' || link.closest('[data-morph-card]'))) {
      const href = link.getAttribute('href') ?? '';
      const card = href === to.fullPath || href === to.path ? cardOfLink(link) : null;
      if (card) {
        // 按下那一刻就把卡拷一份：第一帧窗口里就是它。
        expandFrom = { card, rect: rectOf(card), radius: radiusOf(card), replica: cardReplica(card) };
        trails.set(to.fullPath, {
          back: from.fullPath,
          href,
          index: Math.max(0, linksTo(href, '.page-host > *').indexOf(link)),
          rect: expandFrom.rect,
          radius: expandFrom.radius,
        });
        // 展开不在这里就占住主线程：新页要先把第一帧（含图表）画好，形变开始时才 holdMotion（onEnter）。
        return 'expand';
      }
    }
    // 不看方向，只看来路对不对得上：同一层之间（最近记录 → 睡眠详情）来回都算 forward，
    // 设置卡关回概览又是横向换入口。
    const trail = trails.get(from.fullPath);
    if (trail && trail.back === to.fullPath) {
      collapseTo = trail;
      collapseLift = main()?.scrollTop ?? 0;
      return morphing('collapse');
    }
    // 设置里翻到另一张卡用的是 replace：来路跟着带过去，关掉时仍缩回当初那条。
    if (trail && from.path.startsWith('/settings/') && to.path.startsWith('/settings/')) trails.set(to.fullPath, trail);
    // 单天页翻到前一天 / 后一天（也是 replace）：返回时缩回周视图里**这一天**那一格。
    if (trail && from.path.startsWith('/ai/plan/') && to.path.startsWith('/ai/plan/')) {
      trails.set(to.fullPath, { ...trail, href: to.fullPath, index: 0 });
    }
    return base;
  };

  const viewportOf = (): Rect | null => {
    const root = main();
    if (!root) return null;
    const box = rectOf(root);
    return { left: box.left, top: box.top, width: root.clientWidth, height: root.clientHeight };
  };

  /** 来处页退后一层 / 从后面回来：绕可视区顶边中点缩放（设置卡叠的 .is-receded 同一组值）。
      返回动画和缩放原点的屏幕坐标（退后时量卡的位置要把缩放算回去）。 */
  const recede = (page: HTMLElement, viewport: Rect, direction: 'out' | 'in', duration: number, easing: string) => {
    for (const animation of page.getAnimations()) {
      if (!kept.has(animation) && !(animation instanceof CSSTransition) && !(animation instanceof CSSAnimation)) animation.cancel();
    }
    const box = page.getBoundingClientRect();
    const origin = { x: viewport.left + viewport.width / 2, y: viewport.top };
    page.style.transformOrigin = `${r1(origin.x - box.left)}px ${r1(origin.y - box.top)}px`;
    const back: Keyframe = { transform: `scale(${RECEDE_SCALE})`, opacity: RECEDE_OPACITY };
    const front: Keyframe = { transform: 'none', opacity: 1 };
    const animation = page.animate(direction === 'out' ? [front, back] : [back, front], { duration, easing, fill: 'both' });
    return { animation, origin };
  };

  /** 新页从卡里长出来：页面自己从卡的矩形裁到整个可视区，左上角从卡的左上角滑回原位；
      来处页同时退后。窗口长满那一刻来处页离场，形变的痕迹全部撤掉——页面此刻就是它的静止样子。 */
  const onEnter = (el: Element) => {
    clean(el);
    const focus = focusKey;
    focusKey = null;
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
    // 收回：来处页回到场上了，记下它，下一帧和详情页一起动。
    if (pendingCollapse && el instanceof HTMLElement) {
      pendingCollapse.staying = el;
      return;
    }
    const origin = expandFrom;
    expandFrom = null;
    const leaving = expandLeaving;
    expandLeaving = null;
    const viewport = viewportOf();
    const host = main()?.parentElement;
    if (!origin || !viewport || !host || !(el instanceof HTMLElement)) {
      if (origin) takeHold()();
      if (leaving) endLeave(leaving);
      // 没有形变可借（减少动效、不是从卡点进来）：页面出来以后再滚到要定位的那张卡。
      if (focus && el instanceof HTMLElement) revealFocusLater(el, focus);
      return;
    }
    takeHold()();
    // 卡片入场动画不放：页面的出现就是这段形变（页头、其余部分各自淡入）。
    el.classList.add('page-revisit');
    // 要定位到某张卡（置顶指标 → 训练负荷那张趋势卡）：先把页面滚到它（来处页挪回同样的距离，原地不动），
    // 窗口直接从小卡长成那张卡——第一帧那张卡就叠在小卡的位置上，卡拷贝也跟着它走。
    const scroller = main();
    const target = focus ? findFocusTarget(el, focus) : null;
    if (target && scroller) {
      const before = scroller.scrollTop;
      scroller.scrollTop = before + focusScrollDelta(target, scroller, el);
      const moved = scroller.scrollTop - before;
      if (leaving && moved) leaving.style.top = `${(Number.parseFloat(leaving.style.top) || 0) + moved}px`;
    }
    const box = rectOf(el);
    const spot = target ? rectOf(target) : null;
    const focusAt = spot ? { x: spot.left - box.left, y: spot.top - box.top } : { x: 0, y: 0 };
    const focusPart = target ? [...el.children].find((child) => child.contains(target)) : undefined;
    const flight = fly({
      page: el,
      backdrop: backdropFor(el, viewport, host, origin.radius),
      radius: origin.radius,
      from: { rect: origin.rect, anchor: { x: origin.rect.left - focusAt.x, y: origin.rect.top - focusAt.y } },
      to: { rect: bleedRect(viewport, origin.radius), anchor: { x: box.left, y: box.top } },
      duration: OPEN_MS,
      easing: OPEN_EASE,
      replica: origin.replica,
      replicaAt: focusAt,
      replicaFade: REPLICA_OUT,
      head: HEAD_IN,
      body: PAGE_BODY_IN,
      early: focusPart ? (part) => part === focusPart : undefined,
    });
    const back = leaving ? recede(leaving, viewport, 'out', OPEN_MS, OPEN_EASE).animation : null;
    // 页面外面的来源（底栏里的就绪度胶囊）浮在形变上面，窗口从它底下长出来：它不用藏，藏了只会空一下（10-07 录屏）。
    const hidden = origin.card.isConnected && main()?.contains(origin.card) ? hide(origin.card) : null;
    const all = () => [...flight.anims, ...(back ? [back] : [])];

    let landed = false;
    // 先停在起点（窗口里就是那张卡），等新页的第一帧画完再放：新页挂载、排版、图表、首次光栅化都在这一两帧里，
    // 以前形变和它们挤在同一帧开跑，放出来的前一截全被吞掉（「一下就长满」）。手机上打开新页也是先等新页第一帧。
    // 形变真正开跑时才让重活让路（lib/motion/budget.ts）。
    let release: () => void = () => undefined;
    for (const animation of all()) animation.pause();
    // 等帧节奏平稳（至少两帧）：新页首次光栅化让 GPU 卡住的那一两百毫秒落在起点上，不吞掉形变的开头。
    void whenFramesSteady().then(() => {
      if (landed || aborted.has(el)) return;
      release = holdMotion();
      for (const animation of all()) animation.play();
    });
    // 放到一半按 Esc：不进去了——所有动画原路倒回，路由退回来处。
    const forgetEscape = onMotionEscape(() => {
      if (landed || aborted.has(el)) return false;
      aborted.set(el, { done: false, leaving: false, settle: () => undefined });
      forgetEscape();
      for (const animation of all()) {
        exemptFromSettle(animation);
        kept.add(animation);
        animation.updatePlaybackRate(-1.25);
        if (animation.playState !== 'running') animation.play();
      }
      // 来处页一直在窗口四周露着，回到场上时不要再从透明淡入一遍。
      resumeStill = true;
      window.setTimeout(() => { resumeStill = false; }, 1000);
      deferSettle();
      options.back();
      return true;
    });

    const finish = () => {
      landed = true;
      forgetEscape();
      const state = aborted.get(el);
      if (state) {
        // 撤回放完：来处页已经回到原样，新页这才离场（它一直在窗口里跟着缩回卡上）。路由还没退回来的话
        // 形变停在起点（窗口里就是那张卡）等着，onLeave 再收场。
        state.done = true;
        state.settle = () => {
          endLeave(el);
          flight.dispose();
          hidden?.cancel();
          if (back) {
            kept.delete(back);
            back.cancel();
          }
          if (leaving) leaving.style.transformOrigin = '';
          release();
        };
        if (state.leaving) state.settle();
        return;
      }
      // 窗口长满：来处页先离场（KeepAlive 收进缓存），再撤掉形变——这一帧页面就是它的静止样子。
      if (leaving) endLeave(leaving);
      back?.cancel();
      hidden?.cancel();
      flight.dispose();
      release();
      // 定位的那张卡：等页面排版落定（形变放完图表才挂、有的卡读完数据才长高），还差多少就平滑滚过去，再圈一下。
      // 形变开始前那次滚动是按当时的页面高度算的，常常滚不够——不能只圈不滚。
      if (focus) revealFocusLater(el, focus);
    };
    flight.main.finished.then(finish, () => {
      // 被别的切页整个取消了（页面又离场了）：形变的痕迹一并撤掉。
      landed = true;
      forgetEscape();
      flight.dispose();
      hidden?.cancel();
      back?.cancel();
      release();
    });
  };

  /** 来处页此刻已经在场的话，当初那张卡。页面里没有就看页面外面标了 data-morph-card 的（底栏）。 */
  const currentCard = (trail: Trail): HTMLElement | null => {
    if (trail.source) return main()?.querySelector<HTMLElement>(`${STAYING} [data-morph-source="${CSS.escape(trail.source)}"]`) ?? null;
    const link = linksTo(trail.href, STAYING)[trail.index]
      ?? document.querySelector<HTMLElement>(`body > :not(#app) a[data-morph-card][href="${CSS.escape(trail.href)}"]`)
      ?? null;
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
        resolve(currentCard(trail));
      };
      const look = () => {
        if (done) return;
        if (currentCard(trail) || performance.now() - started > CARD_WAIT_MS) finish();
        else requestAnimationFrame(look);
      };
      requestAnimationFrame(look);
    });

  /** 缓存的来处页重新插回文档时，卡片入场动画（material.css 的 card-enter）会从头再放一遍：
      窗口要落到卡的最终位置上，卡却还在往上浮——直接放完它。 */
  const settleStaying = () => {
    const staying = main()?.querySelector<HTMLElement>(STAYING);
    for (const animation of staying?.getAnimations({ subtree: true }) ?? []) {
      if (animation instanceof CSSAnimation && animation.animationName === 'card-enter') animation.finish();
    }
  };

  /** 返回：展开的逆过程。详情页从整个可视区裁回那张卡，内容先淡掉、页头和卡拷贝交叉，
      来处页同时从后面回来；落地那一帧拷贝和真卡严丝合缝，真卡接上。 */
  const startCollapse = (job: Collapse) => {
    if (pendingCollapse === job) pendingCollapse = null;
    const { el, trail, backdrop } = job;
    const viewport = viewportOf();
    const host = main()?.parentElement;
    if (!el.isConnected || !viewport || !host) {
      backdrop.remove();
      endLeave(el);
      job.release();
      return;
    }
    settleStaying();
    const staying = job.staying ?? main()?.querySelector<HTMLElement>(STAYING) ?? null;
    // 先量卡、拷卡，再让来处页退后：量到的是它回到原大以后的位置和样子。
    const present = currentCard(trail);
    const target = present ? rectOf(present) : trail.rect;
    const box = rectOf(el);
    const flight = fly({
      page: el,
      backdrop,
      radius: trail.radius,
      from: { rect: bleedRect(viewport, trail.radius), anchor: { x: box.left, y: box.top } },
      // 滚下去再返回：缩回卡的是此刻看得见的那一段（锚点抬高滚过的距离），走的路和没滚时一样长。
      // 以前锚点是页面顶上，滚了两千像素就要在 440ms 里多走两千像素——用户看到的「滑到底再返回突然变快」。
      to: { rect: target, anchor: { x: target.left, y: target.top - job.lift } },
      duration: CLOSE_MS,
      easing: CLOSE_EASE,
      replica: present ? cardReplica(present) : null,
      replicaAt: { x: 0, y: job.lift },
      replicaFade: REPLICA_IN,
      head: HEAD_OUT,
      body: PAGE_BODY_OUT,
      // 滚下去时页头早就不在画面里：此刻看得见的那几块按页头的节奏走（晚一点淡），窗口里一直有东西。
      early: job.lift > 40 ? (part) => {
        const shown = part.getBoundingClientRect();
        return shown.bottom > viewport.top && shown.top < viewport.top + viewport.height;
      } : undefined,
    });
    const forward = staying ? recede(staying, viewport, 'in', CLOSE_MS, CLOSE_EASE) : null;
    let hidden = present && main()?.contains(present) ? hide(present) : null;
    let landed = false;
    if (!present) {
      // 来处页还在重读库：卡出现了就把终点换成它（它此刻跟着来处页缩着，按缩放原点算回原大）。
      void findCard(trail).then((found) => {
        if (!found || landed || !el.isConnected) return;
        settleStaying();
        const transform = staying ? getComputedStyle(staying).transform : 'none';
        const scale = transform && transform !== 'none' ? new DOMMatrixReadOnly(transform).a : 1;
        const settled = forward ? unscaledBox(rectOf(found), forward.origin, scale) : rectOf(found);
        hidden = hide(found);
        flight.retarget({ rect: settled, anchor: { x: settled.left, y: settled.top - job.lift } });
      });
    }
    const all = () => [...flight.anims, ...(forward ? [forward.animation] : [])];
    // 来处页刚从缓存插回文档，第一次上屏要整页重新光栅化：先停在起点（画面上就是详情页本身），等帧节奏平稳再缩。
    // 以前一插回去就开跑，GPU 卡住的第一帧吞掉了七成路程——「返回时一下跳回去」。
    let started = false;
    const go = () => {
      if (started || landed) return;
      started = true;
      for (const animation of all()) animation.play();
    };
    for (const animation of all()) animation.pause();
    void whenFramesSteady().then(go);
    // 收回途中按 Esc：剩下的这段在 200ms 里放完，保留原来的曲线——照样落到卡上，只是快一点。
    const forgetEscape = onMotionEscape(() => {
      go();
      for (const animation of all()) hurryAnimation(animation, ESC_FINISH_MS);
      return true;
    });
    const land = () => {
      if (landed) return;
      landed = true;
      forgetEscape();
      hidden?.cancel();
      forward?.animation.cancel();
      if (staying) staying.style.transformOrigin = '';
      job.release();
      const leave = () => {
        endLeave(el);
        flight.dispose();
      };
      // 同一帧里：真卡露出来、详情页离场、拷贝撤掉（拷贝和真卡逐像素一致，lib/motion/replica.ts）。
      if (present) {
        leave();
        return;
      }
      // 没有拷贝（卡是后来才找到的）：窗口停在卡上，整块淡掉露出底下的真卡。
      el.animate([{ opacity: 1 }, { opacity: 0 }], { duration: LAND_FADE_MS, easing: 'ease-out', fill: 'forwards' })
        .finished.then(leave, leave);
    };
    flight.main.finished.then(land, land);
  };

  const onLeave = (el: Element) => {
    const trail = collapseTo;
    collapseTo = null;
    // Esc 撤回的那一页：撤回还在倒放就等它放完再离场（finish 里收场），已经放完的现在收场。
    const state = aborted.get(el);
    if (state) {
      takeHold()();
      state.leaving = true;
      if (state.done) state.settle();
      return;
    }
    if (!(el instanceof HTMLElement)) return;
    // 展开：来处页留着退后，等窗口长满再离场（onEnter 里接手）。
    if (expandFrom) {
      expandLeaving = el;
      return;
    }
    if (!trail) return;
    const viewport = viewportOf();
    const host = main()?.parentElement;
    if (!viewport || !host) {
      takeHold()();
      endLeave(el);
      return;
    }
    // 垫底这一帧就铺满可视区：页面本身是透明的，来处页回到场上时不能从它底下透出来。
    const job: Collapse = {
      el, trail, backdrop: backdropFor(el, viewport, host, trail.radius), staying: null, release: takeHold(), lift: collapseLift,
    };
    pendingCollapse = job;
    // 来处页这时还没插回文档，滚动区也要下一帧才恢复到离开时的位置（lib/returnScroll.ts 的 rAF 先登记、先跑）：
    // 那张卡要等到那时才量得准。这一帧详情页带着垫底原样盖着，看不出等了一帧。
    requestAnimationFrame(() => startCollapse(job));
  };

  /** 离场页（KeepAlive 缓存着的）会原样再回来：留在它身上的 fill 动画和内联样式必须清掉。
      以前返回时的淡出是 fill: forwards，缓存页再点开时一揭开就又变回透明——
      「查看全部」黑屏就是这么来的。正在倒放的撤回（kept）留着，它放完自己收拾。 */
  const clean = (el: Element) => {
    if (!(el instanceof HTMLElement)) return;
    let keeping = false;
    for (const animation of el.getAnimations()) {
      if (kept.has(animation) && animation.playState === 'running') keeping = true;
      else animation.cancel();
    }
    if (!keeping) el.style.transformOrigin = '';
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
