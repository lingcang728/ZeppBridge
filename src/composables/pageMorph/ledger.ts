import { PAGE_WINDOW_MS, removeVeil } from '../../lib/motion/pageFlight';
import { guardScroll } from '../../lib/motion/scrollGuard';
import { main, noop } from './links';
import type { Live, MorphState, Stale } from './types';

/**
 * 卡 ↔ 页形变的账本：哪一段在放、哪一段被打断停在哪、哪些页攥着 Vue 的 done，以及收场和兜底扫描。
 * 2026-11-12 从 usePageMorph.ts 拆出来（修复计划 A5）。
 */
/** 被下一次切页丢下的离场页就地淡掉的时长。 */
const RETIRE_MS = 160;
/** 掉头最短也走这么久（刚点下就返回：差不多一帧回到原处）。 */
export const MIN_TURN_MS = 16;

export const createLedger = (state: MorphState) => {
  const takeHold = () => {
    const release = state.hold ?? noop;
    state.hold = null;
    return release;
  };
  const lockScroll = () => {
    const root = main();
    if (!state.guard && root) state.guard = guardScroll(root, () => state.live?.hurry());
  };
  const unlockScroll = (apply: boolean) => {
    const held = state.guard;
    state.guard = null;
    held?.release(apply);
  };

  /** 给一页的 done 包一层：只生效一次，并从兜底名单里划掉。 */
  const track = (el: Element, done: () => void) => {
    let called = false;
    const once = () => {
      if (called) return;
      called = true;
      if (state.pending.get(el) === once) state.pending.delete(el);
      done();
    };
    state.pending.set(el, once);
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

  /**
   * 正在放的那一段交给下一次切页处理：`turn` 时当场掉头（开到一半返回——点下去就动，不等 Vue 换页），
   * 否则原样停住。更早一次被打断、还没处理完的那段直接收场。
   */
  const freeze = (turn = false) => {
    if (state.stale) finishStale(state.stale);
    const job = state.live;
    state.live = null;
    if (!job || job.landed) return;
    job.stop();
    job.go?.();
    // 收回时那张真卡在窗口底下亮起来的那一段（collapse.ts）也在同一条时间轴上，一起掉头 / 停住。
    const anims = [...job.flight.anims, ...(job.veilAnim ? [job.veilAnim] : []), ...(job.kind === 'collapse' && job.hidden ? [job.hidden] : [])];
    const elapsed = Number(job.flight.main.currentTime ?? 0);
    if (turn) {
      job.flight.turn();
      for (const extra of anims.slice(job.flight.anims.length)) extra.updatePlaybackRate(-(extra.playbackRate || 1));
    } else {
      for (const animation of anims) animation.pause();
    }
    const veilNow = job.veil ? Number.parseFloat(getComputedStyle(job.veil).opacity) : 0;
    state.stale = {
      ...job, snap: job.flight.snapshot(), veilNow: Number.isFinite(veilNow) ? veilNow : 0, claimed: new Set(),
      elapsed: Number.isFinite(elapsed) ? Math.min(PAGE_WINDOW_MS, Math.max(MIN_TURN_MS, elapsed)) : PAGE_WINDOW_MS,
      turned: turn,
    };
  };
  /** 被打断的那段彻底收场：痕迹全撤，两个 done 都调（已经被 Vue 处理过的只是空操作）。 */
  const finishStale = (job: Stale) => {
    if (state.stale === job) state.stale = null;
    disposePage(job);
    disposeUnder(job);
    job.pageDone();
    job.underDone();
  };
  /** 被打断的那段两页都处理完了：不再记着它。 */
  const dropIfDone = () => { if (state.stale && state.stale.pageGone && state.stale.underGone) state.stale = null; };
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
    const job = state.stale;
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
    const job = state.stale;
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
    owns(state.live, el) || owns(state.stale, el) || state.pendingCollapse?.el === el || state.pendingCollapse?.staying === el || state.expandLeaving?.el === el;
  const sweep = () => {
    for (const [el, done] of [...state.pending]) {
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

  /** 离场页（KeepAlive 缓存着的）会原样再回来：留在它身上的 fill 动画、内联样式和没人认领的形变层必须清掉。
      以前返回时的淡出是 fill: forwards，缓存页再点开时一揭开就又变回透明——「查看全部」黑屏就是这么来的。 */
  const clean = (el: Element) => {
    if (!(el instanceof HTMLElement)) return;
    const busy = owns(state.live, el) || owns(state.stale, el);
    // 第一次挂上的页身上不会有形变留下的东西：不去 getAnimations()——它会逼新页当场整页算样式，
    // 刚挂上的大页（履历）光这一下就上百毫秒，形变因此晚开跑。
    if (!busy && state.entered.has(el)) {
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

  const claim = (el: Element) => { if (state.stale && owns(state.stale, el)) state.stale.claimed.add(el); };

  return {
    takeHold, lockScroll, unlockScroll, track, disposePage, disposeUnder, owns, freeze, finishStale, dropIfDone, retire, adopt,
    settle, sweepSoon, clean, claim,
  };
};

export type Ledger = ReturnType<typeof createLedger>;
