import type { RouteLocationNormalized } from 'vue-router';
import type { PageMotion } from '../lib/navigation';
import { holdMotion } from '../lib/motion/budget';
import { hurryAnimation, onMotionEscape, onMotionSkip } from '../lib/motion/interrupt';
import {
  backdropFor, contentIn, contentOut, fly, hide, PAGE_WINDOW_EASE, PAGE_WINDOW_MS, pageVeil, plateIn, plateOut, removeVeil, replicaBack,
  replicaIn, replicaOut, veilIn, veilOut, type Flight, type FlightSnapshot,
} from '../lib/motion/pageFlight';
import { bleedRect, cardReplica, type WindowRect } from '../lib/motion/window';
import { findFocusTarget, focusKeyOf, focusScrollDelta, revealFocusLater } from '../lib/motion/focusTarget';
import { whenFramesSteady } from '../lib/motion/steady';
import { lessMotion } from '../lib/motion/lessMotion';
import { guardScroll, type ScrollGuard } from '../lib/motion/scrollGuard';
import { whenScrollRestored } from '../lib/returnScroll';

type Rect = WindowRect;

/**
 * 从一张卡点进详情页：新页从那张卡里「长」出来；返回时缩回同一张卡。
 *
 * 2026-10-28 第三版（用户：「直接照抄履历页卡片的动画」，即弹窗的 lib/motion/dialogFlight.ts）：
 * - **动的是新页自己**：页面做 `translate` + 定圆角的 `clip-path: inset()`，1:1 不缩放，从卡的矩形裁到整个可视区。
 *   页面底下的垫底和上面那份卡的拷贝都是页面自己的子元素，吃同一道裁切（pageFlight.ts 的 fly）。
 * - **来处页不再退后缩小，而是蒙上一层模糊**（.page-veil，和弹窗遮罩同一组值）：开的时候跟着窗口慢慢糊上，
 *   收的时候前四成几乎不退、落地才散——「在回退的位置之间先用界面模糊做填充」。
 * - **分段和弹窗一样**：卡拷贝前三成淡完、窗口长到四成半以前只有底板、之后内容淡入；收回时内容先淡掉、
 *   拷贝在四成到八成亮回来，落地那一帧拷贝就是真卡。
 * - **先备好再展开**：页面代码块和首屏数据提前读好（lib/motion/prefetch.ts），新页第一帧画好、帧节奏平稳了才放。
 *
 * **快点不叠页**（2026-10-28 录屏：形变没放完又点，概览底下压着半张睡眠详情、左上角留着返回键）：
 * 以前每段形变各自在落地时去「全局表」里找 Vue 的 done，被打断后旧的那段落地时拿到的是新那段的 done，
 * 提前移走了新页、或者漏掉了旧页，旧页就永远留在文档里。现在：
 * - Vue 的 done 在钩子被调的那一刻就攥在这段形变手里，旧的 done 晚到也只是空操作（Vue 自己防重入）。
 * - 正在放的形变被下一次切页打断时**原样停住**（stale），不快进：接手的那一段如果正好是倒回去（开到一半按返回、
 *   收到一半又点同一张卡），就从停住的那个框、那层模糊的浓度、那几层字的透明度接着走，和弹窗收到一半再点开一样；
 *   不是倒回去的，被丢下的离场页就地淡掉再移走。
 * - 兜底：形变落地后扫一遍，凡是攥着 done 却已经不在任何一段形变里的页，一律收场。
 *
 * 用法（AppShell.vue）：`decide()` 在 router.beforeEach 里把普通的 forward / back 换成 expand / collapse；
 * `onMorphEnter` / `onMorphLeave` / `onEnter` / `onLeave` / `onAfterLeave` 挂在切页的 <Transition> 上，
 * `settle()` 在 afterEach 之后（页面已经换上）调一次。
 */
/** 来处页不在缓存里时要重新读库，那张卡可能要等一会儿才出现。窗口不等它：先按记住的位置缩，
    这段时间里找到了就把终点换成真卡；超过这个时长还没有就落在记住的位置上。 */
const CARD_WAIT_MS = 300;
/** 收回途中按 Esc：剩下的部分在这么长里放完（沿用原来的曲线，不是跳到终点）。 */
const ESC_FINISH_MS = 200;
/** 找不到卡、没有拷贝可以落地时，页面在终点上淡掉的时长。 */
const LAND_FADE_MS = 140;
/** 被下一次切页丢下的离场页就地淡掉的时长。 */
const RETIRE_MS = 160;
/** 形变途中有人想滚：剩下的部分在这么长里放完，落地后再把攒下的滚动补上（lib/motion/scrollGuard.ts）。 */
const HURRY_MS = 180;
/** 倒回去（开到一半返回、收到一半又点开）时两页都没离开过文档，帧本来就在走：最多等这么久就放。 */
const REVERSE_STEADY_MS = 80;
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
const reducedMotion = () => lessMotion();
const noop = () => undefined;

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

/**
 * 一段正在放的形变。`page` 是在动的那一页（展开时进场的新页、收回时离场的详情页），`under` 是蒙着模糊的那一页
 * （展开时离场的来处页、收回时回到场上的来处页）。两页的痕迹分开撤：被打断后它们可能各有各的去处。
 */
interface Live {
  kind: 'expand' | 'collapse';
  page: HTMLElement;
  /** 在动的那一页的路由：收到一半又点开同一页时据此认出「倒回去」。 */
  path: string;
  under: HTMLElement | null;
  flight: Flight;
  veil: HTMLElement | null;
  veilAnim: Animation | null;
  hidden: Animation | null;
  release: () => void;
  /** 两页各自那一次 Vue 过渡的 done：钩子被调时就攥住，晚到的旧 done 只是空操作。 */
  pageDone: () => void;
  underDone: () => void;
  /** 停掉这一段的后台事务（Esc 登记、跟踪终点的循环）。 */
  stop: () => void;
  /** 有人想滚：还在等开跑的立刻放，剩下的加速放完。 */
  hurry: () => void;
  landed: boolean;
  pageGone: boolean;
  underGone: boolean;
}
/** 被打断、原样停住的那一段，和它停住时的样子。 */
interface Stale extends Live {
  snap: FlightSnapshot;
  veilNow: number;
  /** 下一次切页里被 Vue 重新用到的那几页（进场或离场）：它们的痕迹由接手的人撤。 */
  claimed: Set<Element>;
}

/** 收回：详情页已经在离场，等来处页回到场上、滚动位置恢复以后的那一帧才开始缩。 */
type Collapse = {
  el: HTMLElement; trail: Trail; backdrop: HTMLElement; staying: HTMLElement | null; release: () => void;
  /** 离开时详情页滚下去了多少：返回时缩回卡的是此刻看得见的那一段，不是页面顶上。 */
  lift: number;
  done: () => void; stayingDone: () => void; frame: number;
};

export const usePageMorph = (options: { back: () => void }) => {
  let pressed: HTMLElement | null = null;
  /** 进过场的页面（KeepAlive 缓存的会原样回来）。 */
  const entered = new WeakSet<Element>();
  let expandFrom: Origin | null = null;
  /** 这次展开要去的路由。 */
  let expandPath = '';
  /** 展开时正在退场的来处页（onLeave 先于 onEnter 被调）和它的 done：等窗口长满再让它走。 */
  let expandLeaving: { el: HTMLElement; done: () => void } | null = null;
  let collapseTo: Trail | null = null;
  /** 返回时详情页此刻的滚动距离（decide 时量，切页后滚动区会被拉回顶上）。 */
  let collapseLift = 0;
  /** 这次切页要定位到的那张卡（链接上的 ?focus=，lib/motion/focusTarget.ts）。 */
  let focusKey: string | null = null;
  let pendingCollapse: Collapse | null = null;
  let live: Live | null = null;
  let stale: Stale | null = null;
  /** 攥着 done、还没收场的页（兜底扫描用）。 */
  const pending = new Map<Element, () => void>();
  /** decide() 决定要形变时登记的「主线程留给动画」：由接下来的 onEnter / onLeave 接手释放。 */
  let hold: (() => void) | null = null;
  const takeHold = () => {
    const release = hold ?? noop;
    hold = null;
    return release;
  };
  /** 每个详情页是从哪张卡展开来的：键是详情页的 fullPath。 */
  const trails = new Map<string, Trail>();
  /** 形变期间锁着主滚动区（decide 决定要形变时挂上，落地时放开并补上攒下的滚动）。 */
  let guard: ScrollGuard | null = null;
  const lockScroll = () => {
    const root = main();
    if (!guard && root) guard = guardScroll(root, () => live?.hurry());
  };
  const unlockScroll = (apply: boolean) => {
    const held = guard;
    guard = null;
    held?.release(apply);
  };

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

  /** 给一页的 done 包一层：只生效一次，并从兜底名单里划掉。 */
  const track = (el: Element, done: () => void) => {
    let called = false;
    const once = () => {
      if (called) return;
      called = true;
      if (pending.get(el) === once) pending.delete(el);
      done();
    };
    pending.set(el, once);
    return once;
  };

  /* ---------- 一段形变的痕迹 ---------- */

  /** 在动的那一页：裁切、垫底、卡拷贝全撤掉，页面回到它自己的样子。 */
  const disposePage = (job: Live) => {
    if (job.pageGone) return;
    job.pageGone = true;
    job.flight.dispose();
    if (job.underGone) job.release();
  };
  /** 蒙着模糊的那一页：模糊撤掉、藏着的那张卡露出来。 */
  const disposeUnder = (job: Live) => {
    if (job.underGone) return;
    job.underGone = true;
    removeVeil(job.under, job.veil);
    job.hidden?.cancel();
    if (job.pageGone) job.release();
  };
  const owns = (job: Live | null, el: Element) => !!job && (job.page === el || job.under === el);

  /** 正在放的那一段原样停住，交给下一次切页处理。更早一次被打断、还没处理完的那段直接收场。 */
  const freeze = () => {
    if (stale) finishStale(stale);
    const job = live;
    live = null;
    if (!job || job.landed) return;
    job.stop();
    const anims = [...job.flight.anims, ...(job.veilAnim ? [job.veilAnim] : [])];
    for (const animation of anims) animation.pause();
    const veilNow = job.veil ? Number.parseFloat(getComputedStyle(job.veil).opacity) : 0;
    stale = { ...job, snap: job.flight.snapshot(), veilNow: Number.isFinite(veilNow) ? veilNow : 0, claimed: new Set() };
  };
  /** 被打断的那段彻底收场：痕迹全撤，两个 done 都调（已经被 Vue 处理过的只是空操作）。 */
  const finishStale = (job: Stale) => {
    if (stale === job) stale = null;
    disposePage(job);
    disposeUnder(job);
    job.pageDone();
    job.underDone();
  };
  /** 被打断的那段两页都处理完了：不再记着它。 */
  const dropIfDone = () => { if (stale && stale.pageGone && stale.underGone) stale = null; };
  /** 被丢下的离场页：从此刻的样子就地淡掉，再移走。 */
  const retire = (el: HTMLElement, done: () => void, after: () => void) => {
    const now = Number.parseFloat(getComputedStyle(el).opacity);
    const fade = el.animate([{ opacity: Number.isFinite(now) ? now : 1 }, { opacity: 0 }], { duration: RETIRE_MS, easing: 'ease-out', fill: 'forwards' });
    const end = () => { after(); done(); fade.cancel(); dropIfDone(); };
    fade.finished.then(end, end);
  };
  /**
   * 新的一段形变要开跑了：被打断的那段里，这次也用到的页（`mine`）由新的这段接管，痕迹现在撤
   * （同一个任务里新形变接着摆好，不会露出中间那一帧）。
   */
  const adopt = (mine: Array<Element | null>) => {
    const job = stale;
    if (!job) return null;
    if (mine.includes(job.page)) { job.claimed.add(job.page); disposePage(job); }
    if (job.under && mine.includes(job.under)) { job.claimed.add(job.under); disposeUnder(job); }
    return job;
  };

  /**
   * 页面换上以后（AppShell 的 afterEach + nextTick）：被打断的那段里没被这次切页用到的页各自收场。
   * 原本在离场的就地淡掉移走；原本在进场的停在原样（痕迹撤掉、过渡算完）。
   */
  const settle = () => {
    const job = stale;
    if (!job) return;
    const leavingPage = job.kind === 'collapse';
    if (!job.claimed.has(job.page)) {
      if (leavingPage) retire(job.page, job.pageDone, () => disposePage(job));
      else { disposePage(job); job.pageDone(); }
    }
    if (job.under && !job.claimed.has(job.under)) {
      if (!leavingPage) retire(job.under, job.underDone, () => disposeUnder(job));
      else { disposeUnder(job); job.underDone(); }
    }
    dropIfDone();
    sweepSoon();
  };

  /** 兜底：攥着 done、却已经不在任何一段形变里的页，统统收场——无论哪里漏了，旧页都不会一直压在新页上。 */
  let sweepTimer = 0;
  const busy = (el: Element) =>
    owns(live, el) || owns(stale, el) || pendingCollapse?.el === el || pendingCollapse?.staying === el || expandLeaving?.el === el;
  const sweep = () => {
    for (const [el, done] of [...pending]) {
      if (!busy(el)) done();
    }
    // 不在任何一段形变里的页上还挂着垫底、卡拷贝、模糊：撤掉（模糊连带还原来处页的临时样式）。
    for (const layer of main()?.querySelectorAll<HTMLElement>('.page-host > * > [data-morph-layer]') ?? []) {
      const page = layer.parentElement;
      if (!page || busy(page)) continue;
      if (import.meta.env.DEV) console.warn('[page-morph] stray morph layer swept', layer.className || layer.tagName);
      if (layer.classList.contains('page-veil')) removeVeil(page, layer);
      else layer.remove();
    }
  };
  const sweepSoon = () => {
    window.clearTimeout(sweepTimer);
    sweepTimer = window.setTimeout(sweep, PAGE_WINDOW_MS * 2 + 400);
  };

  /* ---------- 决定这次切页怎么动 ---------- */

  const decide = (from: RouteLocationNormalized, to: RouteLocationNormalized, base: PageMotion): PageMotion => {
    const link = pressed;
    pressed = null;
    // 收回还在等下一帧开跑就又切页：它什么都还没动，详情页直接收场。
    if (pendingCollapse) {
      const job = pendingCollapse;
      pendingCollapse = null;
      cancelAnimationFrame(job.frame);
      job.backdrop.remove();
      job.done();
      job.stayingDone();
      job.release();
    }
    freeze();
    expandFrom = null;
    expandPath = '';
    if (expandLeaving) { const { done } = expandLeaving; expandLeaving = null; done(); }
    collapseTo = null;
    collapseLift = 0;
    focusKey = focusKeyOf(to);
    hold?.();
    hold = null;
    sweepSoon();
    const direct = takeArmed(to);
    const motion = choose(from, to, base, link, direct);
    if (motion === 'expand' || motion === 'collapse') lockScroll();
    else unlockScroll(false);
    return motion;
  };

  const choose = (
    from: RouteLocationNormalized, to: RouteLocationNormalized, base: PageMotion, link: HTMLElement | null, direct: ReturnType<typeof takeArmed>,
  ): PageMotion => {
    if (reducedMotion()) return base;
    if (direct && bigEnough(direct.card)) {
      expandFrom = { card: direct.card, rect: rectOf(direct.card), radius: radiusOf(direct.card), replica: cardReplica(direct.card) };
      expandPath = to.fullPath;
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
        expandPath = to.fullPath;
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
      hold = holdMotion();
      return 'collapse';
    }
    // 单天页翻到前一天 / 后一天（replace）：返回时缩回周视图里**这一天**那一格。
    if (trail && from.path.startsWith('/ai/plan/') && to.path.startsWith('/ai/plan/')) {
      trails.set(to.fullPath, { ...trail, href: to.fullPath, index: 0 });
    } else if (trail && (from.path === to.path || (from.path.startsWith('/settings/') && to.path.startsWith('/settings/')))) {
      // 同一页只换了参数（年轮换年份的 ?year=）、设置里翻到另一张卡（replace）：来路跟着带过去，关掉时仍缩回当初那张卡
      // （10-28 录屏：年轮换过年份再返回履历，找不到来路就硬切）。
      trails.set(to.fullPath, trail);
    }
    return base;
  };

  const viewportOf = (): Rect | null => {
    const root = main();
    if (!root) return null;
    const box = rectOf(root);
    return { left: box.left, top: box.top, width: root.clientWidth, height: root.clientHeight };
  };

  /* ---------- 展开 ---------- */

  /** 新页从卡里长出来：页面自己从卡的矩形裁到整个可视区；来处页同时慢慢蒙上模糊。窗口长满那一刻来处页离场，
      形变的痕迹全部撤掉——页面此刻就是它的静止样子。 */
  const startExpand = (el: HTMLElement, done: () => void, origin: Origin, viewport: Rect, host: HTMLElement, focus: string | null) => {
    const leaving = expandLeaving;
    expandLeaving = null;
    takeHold()();
    // 卡片入场动画不放：页面的出现就是这段形变（内容在后半程淡入）。
    el.classList.add('page-revisit');
    // 收到一半又点开同一页：从停住的那个框接着长，不从卡上重来。
    const previous = adopt([el, leaving?.el ?? null]);
    const reversing = previous && previous.kind === 'collapse' && previous.path === expandPath ? previous : null;
    // 被丢下的旧详情页（同一页的另一个实例）：新页接着它停住的样子长，它这一帧就收场。
    if (reversing && reversing.page !== el && !reversing.claimed.has(reversing.page)) {
      reversing.claimed.add(reversing.page);
      disposePage(reversing);
      reversing.pageDone();
    }
    // 要定位到某张卡（置顶指标 → 训练负荷那张趋势卡）：先把页面滚到它（来处页挪回同样的距离，原地不动），
    // 窗口直接从小卡长成那张卡——第一帧那张卡就叠在小卡的位置上，卡拷贝也跟着它走。
    const scroller = main();
    const target = focus ? findFocusTarget(el, focus) : null;
    if (target && scroller) {
      const before = scroller.scrollTop;
      scroller.scrollTop = before + focusScrollDelta(target, scroller, el);
      const moved = scroller.scrollTop - before;
      if (leaving && moved) leaving.el.style.top = `${(Number.parseFloat(leaving.el.style.top) || 0) + moved}px`;
    }
    const box = rectOf(el);
    const spot = target ? rectOf(target) : null;
    const focusAt = spot ? { x: spot.left - box.left, y: spot.top - box.top } : { x: 0, y: 0 };
    const focusPart = target ? [...el.children].find((child) => child.contains(target)) : undefined;
    const start = reversing?.snap.window ?? origin.rect;
    const flight = fly({
      page: el,
      backdrop: backdropFor(el, viewport, host, origin.radius),
      radius: origin.radius,
      from: { rect: start, anchor: { x: start.left - focusAt.x, y: start.top - focusAt.y } },
      to: { rect: bleedRect(viewport, origin.radius), anchor: { x: box.left, y: box.top } },
      duration: PAGE_WINDOW_MS,
      easing: PAGE_WINDOW_EASE,
      replica: origin.replica,
      replicaAt: focusAt,
      replicaFade: replicaOut(reversing ? reversing.snap.replica : 1),
      head: contentIn(reversing ? reversing.snap.content : 0),
      body: contentIn(reversing ? reversing.snap.content : 0),
      plate: plateIn(reversing ? reversing.snap.plate : 0),
      early: focusPart ? (part) => part === focusPart : undefined,
    });
    const veil = leaving ? pageVeil(leaving.el, viewport) : null;
    const veilFrom = veilIn(previous ? previous.veilNow : 0);
    const veilAnim = veil ? veil.animate(veilFrom.frames, veilFrom.options) : null;
    // 页面外面的来源（底栏里的就绪度胶囊）浮在形变上面，窗口从它底下长出来：它不用藏，藏了只会空一下（10-07 录屏）。
    const hidden = origin.card.isConnected && main()?.contains(origin.card) ? hide(origin.card) : null;
    let release: () => void = noop;
    const job: Live = {
      kind: 'expand', page: el, path: expandPath, under: leaving?.el ?? null, flight, veil, veilAnim, hidden,
      release: () => release(), pageDone: done, underDone: leaving?.done ?? noop, stop: noop, hurry: noop,
      landed: false, pageGone: false, underGone: false,
    };
    live = job;
    dropIfDone();
    const all = () => [...flight.anims, ...(veilAnim ? [veilAnim] : [])];
    // 先停在起点（窗口里就是那张卡），等新页的第一帧画完再放：新页挂载、排版、图表、首次光栅化都在这一两帧里，
    // 以前形变和它们挤在同一帧开跑，放出来的前一截全被吞掉。形变真正开跑时才让重活让路（lib/motion/budget.ts）。
    let started = false;
    const go = () => {
      if (started || live !== job || job.landed) return;
      started = true;
      release = holdMotion();
      for (const animation of all()) animation.play();
    };
    for (const animation of all()) animation.pause();
    void whenFramesSteady(previous ? REVERSE_STEADY_MS : undefined).then(go);
    job.hurry = () => {
      if (live !== job || job.landed) return;
      go();
      for (const animation of all()) hurryAnimation(animation, HURRY_MS);
    };
    // 放到一半按 Esc：不进去了——路由退回来处，收回从此刻的样子接着缩（decide 把这一段停住交给收回）。
    const forgetEscape = onMotionEscape(() => {
      if (live !== job || job.landed) return false;
      options.back();
      return true;
    });
    job.stop = forgetEscape;
    const finish = () => {
      if (live !== job || job.landed) return;
      job.landed = true;
      live = null;
      forgetEscape();
      // 窗口长满：来处页先离场（KeepAlive 收进缓存），再撤掉形变——这一帧页面就是它的静止样子。
      disposeUnder(job);
      job.underDone();
      job.pageDone();
      disposePage(job);
      release();
      sweepSoon();
      unlockScroll(true);
      // 定位的那张卡：等页面排版落定再平滑滚过去，再圈一下（形变开始前那次滚动常常滚不够）。
      if (focus) revealFocusLater(el, focus);
    };
    flight.main.finished.then(finish, noop);
  };

  /* ---------- 收回 ---------- */

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

  /** 返回：展开的逆过程。详情页从整个可视区（开到一半被返回时，从它此刻的那个框）裁回那张卡，内容先淡掉，
      卡拷贝快落地时亮回来；来处页上的模糊前四成几乎不退、落地才散。 */
  const startCollapse = (job: Collapse) => {
    if (pendingCollapse === job) pendingCollapse = null;
    const { el, trail, backdrop } = job;
    const viewport = viewportOf();
    const host = main()?.parentElement;
    if (!el.isConnected || !viewport || !host) {
      backdrop.remove();
      job.done();
      job.stayingDone();
      job.release();
      unlockScroll(false);
      return;
    }
    settleStaying();
    const staying = job.staying ?? main()?.querySelector<HTMLElement>(STAYING) ?? null;
    const previous = adopt([el, staying]);
    const reversing = previous && previous.kind === 'expand' && previous.page === el ? previous : null;
    const present = currentCard(trail);
    const target = present ? rectOf(present) : trail.rect;
    const box = rectOf(el);
    const flight = fly({
      page: el,
      backdrop,
      radius: trail.radius,
      from: reversing ? { rect: reversing.snap.window, anchor: reversing.snap.anchor } : { rect: bleedRect(viewport, trail.radius), anchor: { x: box.left, y: box.top } },
      // 滚下去再返回：缩回卡的是此刻看得见的那一段（锚点抬高滚过的距离），走的路和没滚时一样长。
      to: { rect: target, anchor: { x: target.left, y: target.top - job.lift } },
      duration: PAGE_WINDOW_MS,
      easing: PAGE_WINDOW_EASE,
      replica: present ? cardReplica(present) : null,
      replicaAt: { x: 0, y: job.lift },
      replicaFade: reversing && reversing.snap.content < 0.5 && reversing.snap.replica < 0.5
        ? replicaBack(reversing.snap.replica)
        : replicaIn(reversing ? reversing.snap.replica : 0),
      head: contentOut(reversing ? reversing.snap.content : 1),
      body: contentOut(reversing ? reversing.snap.content : 1),
      plate: plateOut(reversing ? reversing.snap.plate : 1),
      // 滚下去时页头早就不在画面里：此刻看得见的那几块按页头的节奏走，窗口里一直有东西。
      early: job.lift > 40 ? (part) => {
        const shown = part.getBoundingClientRect();
        return shown.bottom > viewport.top && shown.top < viewport.top + viewport.height;
      } : undefined,
    });
    const veil = staying ? pageVeil(staying, viewport) : null;
    const veilFrom = veilOut(previous ? previous.veilNow : 1);
    const veilAnim = veil ? veil.animate(veilFrom.frames, veilFrom.options) : null;
    const hidden = present && main()?.contains(present) ? hide(present) : null;
    const me: Live = {
      kind: 'collapse', page: el, path: '', under: staying, flight, veil, veilAnim, hidden,
      release: job.release, pageDone: job.done, underDone: job.stayingDone, stop: noop, hurry: noop,
      landed: false, pageGone: false, underGone: false,
    };
    live = me;
    dropIfDone();
    if (!present) {
      // 来处页还在重读库：卡出现了就把终点换成它。
      void findCard(trail).then((found) => {
        if (!found || me.landed || live !== me || !el.isConnected) return;
        settleStaying();
        const settled = rectOf(found);
        me.hidden = hide(found);
        flight.retarget({ rect: settled, anchor: { x: settled.left, y: settled.top - job.lift } });
      });
    }
    /* 收回途中来处页还在排版（上面的区块晚一帧才读到数、图片撑开）：卡被往下推了，终点跟着改
       （用户 2026-10-27「PB 的位置根本不在原来的地方」）。 */
    if (present) {
      let aim = target;
      const follow = () => {
        if (me.landed || live !== me || !el.isConnected || !present.isConnected) return;
        const now = rectOf(present);
        if (Math.abs(now.left - aim.left) > 1.5 || Math.abs(now.top - aim.top) > 1.5) {
          aim = now;
          flight.retarget({ rect: now, anchor: { x: now.left, y: now.top - job.lift } });
        }
        requestAnimationFrame(follow);
      };
      requestAnimationFrame(follow);
    }
    const all = () => [...flight.anims, ...(veilAnim ? [veilAnim] : [])];
    // 来处页刚从缓存插回文档，第一次上屏要整页重新光栅化：先停在起点（画面上就是详情页本身），等帧节奏平稳再缩。
    let started = false;
    const go = () => {
      if (started || me.landed || live !== me) return;
      started = true;
      for (const animation of all()) animation.play();
    };
    for (const animation of all()) animation.pause();
    void whenFramesSteady(reversing ? REVERSE_STEADY_MS : undefined).then(go);
    const hurry = (ms: number) => {
      go();
      for (const animation of all()) hurryAnimation(animation, ms);
    };
    me.hurry = () => { if (!me.landed && live === me) hurry(HURRY_MS); };
    // 收回途中按 Esc：剩下的这段在 200ms 里放完，保留原来的曲线——照样落到卡上，只是快一点。
    const forgetEscape = onMotionEscape(() => {
      if (me.landed || live !== me) return false;
      hurry(ESC_FINISH_MS);
      return true;
    });
    me.stop = forgetEscape;
    const land = () => {
      if (me.landed || live !== me) return;
      me.landed = true;
      live = null;
      forgetEscape();
      disposeUnder(me);
      me.underDone();
      // 攒下的滚动等返回位置恢复完再补，不然下一帧就被恢复盖掉。
      if (guard) { const held = guard; void whenScrollRestored().then(() => { if (guard === held) unlockScroll(true); }); }
      const leave = () => {
        me.pageDone();
        disposePage(me);
        sweepSoon();
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
    flight.main.finished.then(land, noop);
  };

  /* ---------- Vue 过渡钩子 ---------- */

  /** 离场页（KeepAlive 缓存着的）会原样再回来：留在它身上的 fill 动画、内联样式和没人认领的形变层必须清掉。
      以前返回时的淡出是 fill: forwards，缓存页再点开时一揭开就又变回透明——「查看全部」黑屏就是这么来的。 */
  const clean = (el: Element) => {
    if (!(el instanceof HTMLElement)) return;
    const busy = owns(live, el) || owns(stale, el);
    // 第一次挂上的页身上不会有形变留下的东西：不去 getAnimations()——它会逼新页当场整页算样式，
    // 刚挂上的大页（履历）光这一下就上百毫秒，形变因此晚开跑。
    if (!busy && entered.has(el)) {
      for (const animation of el.getAnimations()) {
        // 样式表里的切页动画（shell.css 的 page-fade-in 等，随 Vue 的过渡类出现、消失）不归这里管：
        // beta.58 切页改成 CSS animation 后，onEnter 一上来就把新页的淡入取消了，新页硬切出现（10-13 录屏）。
        if (animation instanceof CSSAnimation || animation instanceof CSSTransition) continue;
        animation.cancel();
      }
      // 上一段形变漏下的垫底、模糊、卡拷贝（data-morph-layer）：这一页现在不在任何形变里，一律撤掉。
      el.querySelectorAll(':scope > [data-morph-layer]').forEach((layer) => layer.remove());
      el.style.isolation = '';
      el.style.position = '';
      el.style.clipPath = '';
    }
    el.style.transformOrigin = '';
    el.style.opacity = '';
    el.style.transition = '';
    el.style.zIndex = '';
  };

  const claim = (el: Element) => { if (stale && owns(stale, el)) stale.claimed.add(el); };

  const onEnter = (el: Element, done: () => void = noop) => {
    claim(el);
    // 被打断的那一页又回到场上、但这次不是形变接手（换入口等）：它的痕迹现在就撤。
    const job = stale;
    if (job && el instanceof HTMLElement && !expandFrom && !pendingCollapse) {
      if (job.page === el) disposePage(job);
      if (job.under === el) disposeUnder(job);
    }
    clean(el);
    // 离场时垫的 top（AppShell 的 onPageBeforeLeave，按当时的滚动距离往上提）只给离场页用。离场被打断、又回到场上的页
    // 没走 afterLeave，top 还挂着：在流里的页整页被提上去一个滚动距离，画面上只剩底色（10-28 录屏「点开马上返回黑屏」）。
    if (el instanceof HTMLElement) el.style.top = '';
    const focus = focusKey;
    focusKey = null;
    // 缓存页回场：卡片入场动画（material.css 的 card-enter）不再从头放一遍。
    if (entered.has(el)) el.classList.add('page-revisit');
    entered.add(el);
    // 收回：来处页回到场上了，记下它，下一帧和详情页一起动。
    if (pendingCollapse && el instanceof HTMLElement) {
      pendingCollapse.staying = el;
      pendingCollapse.stayingDone = track(el, done);
      return;
    }
    const origin = expandFrom;
    expandFrom = null;
    const viewport = viewportOf();
    const host = main()?.parentElement;
    if (!origin || !viewport || !host || !(el instanceof HTMLElement)) {
      if (origin) takeHold()();
      unlockScroll(false);
      if (expandLeaving) { const leaving = expandLeaving; expandLeaving = null; leaving.done(); }
      // 没有形变可借（减少动效、不是从卡点进来）：页面出来以后再滚到要定位的那张卡。
      if (focus && el instanceof HTMLElement) revealFocusLater(el, focus);
      done();
      return;
    }
    startExpand(el, track(el, done), origin, viewport, host, focus);
  };

  const onLeave = (el: Element, done: () => void = noop) => {
    claim(el);
    const trail = collapseTo;
    collapseTo = null;
    if (!(el instanceof HTMLElement)) { done(); return; }
    // 展开：来处页留着蒙上模糊，等窗口长满再离场（onEnter 里接手）。
    if (expandFrom) {
      expandLeaving = { el, done: track(el, done) };
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
      el, trail, backdrop: backdropFor(el, viewport, host, trail.radius), staying: null, release: takeHold(), lift: collapseLift,
      done: track(el, done), stayingDone: noop, frame: 0,
    };
    pendingCollapse = job;
    // 来处页这时还没插回文档，滚动区也要下一帧才恢复到离开时的位置（lib/returnScroll.ts 的 rAF 先登记、先跑）：
    // 那张卡要等到那时才量得准。这一帧详情页带着垫底原样盖着，看不出等了一帧。
    job.frame = requestAnimationFrame(() => startCollapse(job));
  };

  const onAfterLeave = (el: Element) => {
    // 被打断的那一页由普通切页（CSS 淡出）带走了：淡完再撤它的痕迹。
    const job = stale;
    if (job && job.page === el) disposePage(job);
    if (job && job.under === el) disposeUnder(job);
    dropIfDone();
    clean(el);
    if (el instanceof HTMLElement) el.style.top = '';
  };
  // Vue's CSS timeout uses wall time, while WAAPI can be paused or slowed in DevTools.
  // Let the actual flight own completion on both pages; ordinary navigation keeps
  // Vue's automatic CSS completion (one-arg hooks).
  const onMorphEnter = (el: Element, done: () => void) => onEnter(el, done);
  const onMorphLeave = (el: Element, done: () => void) => onLeave(el, done);
  return { decide, onEnter: (el: Element) => onEnter(el), onLeave: (el: Element) => onLeave(el), onMorphEnter, onMorphLeave, onAfterLeave, settle, dispose };
};
