import type { RouteLocationNormalized } from 'vue-router';
import type { PageMotion } from '../lib/navigation';
import { holdMotion } from '../lib/motion/budget';
import { cardReplica } from '../lib/motion/window';
import { focusKeyOf, revealFocusLater } from '../lib/motion/focusTarget';
import { backdropFor } from '../lib/motion/pageFlight';
import { startCollapse } from './pageMorph/collapse';
import type { MorphCtx } from './pageMorph/context';
import { startExpand } from './pageMorph/expand';
import { createLedger } from './pageMorph/ledger';
import {
  bigEnough, cardOfLink, linkOf, linksTo, main, noop, radiusOf, rectOf, reducedMotion, takeArmed, viewportOf, type Origin, type Trail,
} from './pageMorph/links';
import { createState, type Collapse } from './pageMorph/types';

export { armPageMorph } from './pageMorph/links';

/**
 * 从一张卡点进详情页：新页从那张卡里「长」出来；返回时缩回同一张卡。
 *
 * 2026-10-28 第三版（用户：「直接照抄履历页卡片的动画」，即弹窗的 lib/motion/dialogFlight.ts）：
 * - **动的是新页自己**：页面做 `translate` + 定圆角的 `clip-path: inset()`，1:1 不缩放，从卡的矩形裁到整个可视区。
 *   页面底下的垫底和上面那份卡的拷贝都是页面自己的子元素，吃同一道裁切（pageFlight.ts 的 fly）。
 * - **来处页不再退后缩小，而是蒙上一层模糊**（.page-veil，和弹窗遮罩同一组值）：开的时候跟着窗口慢慢糊上，
 *   收的时候前四成几乎不退、落地才散——「在回退的位置之间先用界面模糊做填充」。
 * - **交接**（pageFlight.ts）：窗口刚开始长，卡拷贝就换成页面内容（内容在起飞前已经画好）；收回时内容跟着窗口缩，
 *   板快缩到卡那么大（HANDOFF_BACK）才换回卡拷贝，落地那一帧拷贝就是真卡。
 * - **点下去就有反应，内容备好再飞**（2026-11-12 第二轮）：新页先轻着挂上（图表只放壳），背后的模糊这一帧就开始糊；
 *   窗口停在卡上等图表一帧一张挂完、帧节奏恢复（都有上限，pageMorph/expand.ts）再长——长大的一路上窗口里都是真页面。
 *   首屏数据不等（预读和形变并行，lib/motion/prefetch.ts）。上午那一版点下去就飞、图表落地才挂，用户当天否了
 *   （「每次都会重绘……闪来闪去」）。
 *
 * **快点不叠页**（2026-10-28 录屏：形变没放完又点，概览底下压着半张睡眠详情、左上角留着返回键）：
 * 以前每段形变各自在落地时去「全局表」里找 Vue 的 done，被打断后旧的那段落地时拿到的是新那段的 done，
 * 提前移走了新页、或者漏掉了旧页，旧页就永远留在文档里。现在：
 * - Vue 的 done 在钩子被调的那一刻就攥在这段形变手里，旧的 done 晚到也只是空操作（Vue 自己防重入）。
 * - 正在放的形变被下一次切页打断时停在此刻（stale），不快进：接手的那一段如果正好是倒回去（开到一半按返回、
 *   收到一半又点同一张卡），就从停住的那个框、那层模糊的浓度、那几层字的透明度掉头，**走了多久就花多久回去**；
 *   页面换了文档位置（Vue 把离场页、回场页重新插过），所以掉头前按此刻重新量一次框，不是翻同一组动画的速率。
 *   不是倒回去的，被丢下的离场页就地淡掉再移走。
 * - 兜底：形变落地后扫一遍，凡是攥着 done 却已经不在任何一段形变里的页，一律收场。
 *
 * 分在 pageMorph/ 下：links（认卡）、types / ledger（账本、收场、兜底）、expand / collapse（两段形变），这里只管决定和 Vue 钩子。
 *
 * 用法（AppShell.vue）：`decide()` 在 router.beforeEach 里把普通的 forward / back 换成 expand / collapse；
 * `onMorphEnter` / `onMorphLeave` / `onEnter` / `onLeave` / `onAfterLeave` 挂在切页的 <Transition> 上，
 * `settle()` 在 afterEach 之后（页面已经换上）调一次。
 */
export const usePageMorph = (options: { back: () => void }) => {
  const state = createState();
  const ledger = createLedger(state);
  const ctx: MorphCtx = { state, ledger, back: options.back };
  const { takeHold, track } = ledger;
  let pressed: HTMLElement | null = null;
  let expandFrom: Origin | null = null;
  let collapseTo: Trail | null = null;
  /** 这次收回的是哪张详情页（它的 fullPath）。 */
  let collapsePath = '';
  /** 返回时详情页此刻的滚动距离（decide 时量，切页后滚动区会被拉回顶上）。 */
  let collapseLift = 0;
  /** 这次切页要定位到的那张卡（链接上的 ?focus=，lib/motion/focusTarget.ts）。 */
  let focusKey: string | null = null;

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

  /* ---------- 决定这次切页怎么动 ---------- */

  const decide = (from: RouteLocationNormalized, to: RouteLocationNormalized, base: PageMotion): PageMotion => {
    const link = pressed;
    pressed = null;
    // 快速连点同一张卡触发了重复导航：保留正在准备展开的来处，不把刚摁下的形变拆掉。
    if (expandFrom && state.expandPath === to.fullPath) return 'expand';
    // 收回还在等下一帧开跑就又切页：它什么都还没动，详情页直接收场。
    if (state.pendingCollapse) {
      const job = state.pendingCollapse;
      state.pendingCollapse = null;
      cancelAnimationFrame(job.frame);
      job.backdrop.remove();
      job.done();
      job.stayingDone();
      job.release();
    }
    // 开到一半按返回（或 Esc）：当场掉头，后面 Vue 换页、来处页插回、滚动恢复的那几百毫秒里形变照样在往回走。
    const turning = Boolean(state.live && !state.live.landed && state.live.kind === 'expand' && !reducedMotion()
      && state.trails.get(state.live.path)?.back === to.fullPath);
    ledger.freeze(turning);
    expandFrom = null;
    state.expandPath = '';
    if (state.expandLeaving) { const { done } = state.expandLeaving; state.expandLeaving = null; done(); }
    collapseTo = null;
    collapseLift = 0;
    focusKey = focusKeyOf(to);
    state.hold?.();
    state.hold = null;
    ledger.sweepSoon();
    const direct = takeArmed(to);
    const motion = choose(from, to, base, link, direct);
    // 展开从这里就让重活让路：新页挂得轻，一两帧就上屏、背后的模糊马上开始糊。这一段只占到新页上屏为止——
    // pageMorph/expand.ts 一接手就放开，图表一帧一张地挂完窗口才起飞（2026-11-12 上午一直占到落地，
    // 每次点开都是「空卡 → 图表淡入」重画一遍，用户当天否了）。
    if (motion === 'expand' && !state.hold) state.hold = holdMotion();
    if (motion === 'expand' || motion === 'collapse') ledger.lockScroll();
    else ledger.unlockScroll(false);
    return motion;
  };

  const choose = (
    from: RouteLocationNormalized, to: RouteLocationNormalized, base: PageMotion, link: HTMLElement | null, direct: ReturnType<typeof takeArmed>,
  ): PageMotion => {
    if (reducedMotion()) return base;
    if (direct && (direct.anySize || bigEnough(direct.card))) {
      const rect = rectOf(direct.card);
      // 胶囊按钮的圆角写的是 999px：夹到半高，窗口一开始就是这枚胶囊（圆角也决定背景外扩多少，不能真拿 999 去算）。
      const radius = Math.min(radiusOf(direct.card), rect.width / 2, rect.height / 2);
      expandFrom = { card: direct.card, rect, radius, replica: cardReplica(direct.card) };
      state.expandPath = to.fullPath;
      state.trails.set(to.fullPath, { back: from.fullPath, href: direct.href, index: 0, rect: expandFrom.rect, radius: expandFrom.radius, source: direct.id });
      return 'expand';
    }
    // 标了 data-morph-card 的条带跨入口（概览 → 设置卡）也展开：从哪里来回哪里去。
    if (link && (base === 'forward' || link.closest('[data-morph-card]'))) {
      const href = link.getAttribute('href') ?? '';
      const card = href === to.fullPath || href === to.path ? cardOfLink(link) : null;
      if (card) {
        // 按下那一刻就把卡拷一份：第一帧窗口里就是它。
        expandFrom = { card, rect: rectOf(card), radius: radiusOf(card), replica: cardReplica(card) };
        state.expandPath = to.fullPath;
        state.trails.set(to.fullPath, {
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
    const trail = state.trails.get(from.fullPath);
    if (trail && trail.back === to.fullPath) {
      collapseTo = trail;
      collapsePath = from.fullPath;
      collapseLift = main()?.scrollTop ?? 0;
      state.hold = holdMotion();
      return 'collapse';
    }
    // 单天页翻到前一天 / 后一天（replace）：返回时缩回周视图里**这一天**那一格。
    if (trail && from.path.startsWith('/ai/plan/') && to.path.startsWith('/ai/plan/')) {
      state.trails.set(to.fullPath, { ...trail, href: to.fullPath, index: 0 });
    } else if (trail && (from.path === to.path || (from.path.startsWith('/settings/') && to.path.startsWith('/settings/')))) {
      // 同一页只换了参数（年轮换年份的 ?year=）、设置里翻到另一张卡（replace）：来路跟着带过去，关掉时仍缩回当初那张卡
      // （10-28 录屏：年轮换过年份再返回履历，找不到来路就硬切）。
      state.trails.set(to.fullPath, trail);
    }
    return base;
  };

  /* ---------- Vue 过渡钩子 ---------- */

  const onEnter = (el: Element, done: () => void = noop) => {
    ledger.claim(el);
    // 被打断的那一页又回到场上、但这次不是形变接手（换入口等）：它的痕迹现在就撤。
    const job = state.stale;
    if (job && el instanceof HTMLElement && !expandFrom && !state.pendingCollapse) {
      if (job.page === el) ledger.disposePage(job);
      if (job.under === el) ledger.disposeUnder(job);
    }
    ledger.clean(el);
    // 离场时垫的 top（AppShell 的 onPageBeforeLeave，按当时的滚动距离往上提）只给离场页用。离场被打断、又回到场上的页
    // 没走 afterLeave，top 还挂着：在流里的页整页被提上去一个滚动距离，画面上只剩底色（10-28 录屏「点开马上返回黑屏」）。
    if (el instanceof HTMLElement) el.style.top = '';
    const focus = focusKey;
    focusKey = null;
    // 缓存页回场：卡片入场动画（material.css 的 card-enter）不再从头放一遍。
    if (state.entered.has(el)) el.classList.add('page-revisit');
    state.entered.add(el);
    // 收回：来处页回到场上了，记下它，下一帧和详情页一起动。
    if (state.pendingCollapse && el instanceof HTMLElement) {
      state.pendingCollapse.staying = el;
      state.pendingCollapse.stayingDone = track(el, done);
      return;
    }
    const origin = expandFrom;
    expandFrom = null;
    const viewport = viewportOf();
    const host = main()?.parentElement;
    if (!origin || !viewport || !host || !(el instanceof HTMLElement)) {
      if (origin) takeHold()();
      ledger.unlockScroll(false);
      if (state.expandLeaving) { const leaving = state.expandLeaving; state.expandLeaving = null; leaving.done(); }
      // 没有形变可借（减少动效、不是从卡点进来）：页面出来以后再滚到要定位的那张卡。
      if (focus && el instanceof HTMLElement) revealFocusLater(el, focus);
      done();
      return;
    }
    startExpand(ctx, el, track(el, done), origin, viewport, host, focus);
  };

  const onLeave = (el: Element, done: () => void = noop) => {
    ledger.claim(el);
    const trail = collapseTo;
    collapseTo = null;
    if (!(el instanceof HTMLElement)) { done(); return; }
    // 展开：来处页留着蒙上模糊，等窗口长满再离场（onEnter 里接手）。
    if (expandFrom) {
      state.expandLeaving = { el, done: track(el, done) };
      return;
    }
    if (!trail) { done(); return; }
    const viewport = viewportOf();
    const host = main()?.parentElement;
    if (!viewport || !host) {
      takeHold()();
      done();
      return;
    }
    // 垫底这一帧就铺满可视区：页面本身是透明的，来处页回到场上时不能从它底下透出来。
    // （开到一半被返回时，页面还停在被打断的那个框里，垫底跟着同一道裁切，看不出多了一层。）
    const job: Collapse = {
      el, trail, path: collapsePath, backdrop: backdropFor(el, viewport, host, trail.radius), staying: null, release: takeHold(), lift: collapseLift,
      done: track(el, done), stayingDone: noop, frame: 0,
    };
    state.pendingCollapse = job;
    // 来处页这时还没插回文档，滚动区也要下一帧才恢复到离开时的位置（lib/returnScroll.ts 的 rAF 先登记、先跑）：
    // 那张卡要等到那时才量得准。这一帧详情页带着垫底原样盖着，看不出等了一帧。
    job.frame = requestAnimationFrame(() => startCollapse(ctx, job));
  };

  const onAfterLeave = (el: Element) => {
    // 被打断的那一页由普通切页（CSS 淡出）带走了：淡完再撤它的痕迹。
    const job = state.stale;
    if (job && job.page === el) ledger.disposePage(job);
    if (job && job.under === el) ledger.disposeUnder(job);
    ledger.dropIfDone();
    ledger.clean(el);
    if (el instanceof HTMLElement) el.style.top = '';
  };
  // Vue's CSS timeout uses wall time, while WAAPI can be paused or slowed in DevTools.
  // Let the actual flight own completion on both pages; ordinary navigation keeps
  // Vue's automatic CSS completion (one-arg hooks).
  const onMorphEnter = (el: Element, done: () => void) => onEnter(el, done);
  const onMorphLeave = (el: Element, done: () => void) => onLeave(el, done);
  return { decide, onEnter: (el: Element) => onEnter(el), onLeave: (el: Element) => onLeave(el), onMorphEnter, onMorphLeave, onAfterLeave, settle: ledger.settle, dispose };
};
