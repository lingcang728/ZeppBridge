import { holdMotion, stageMotion, whenSlotsDrained } from '../../lib/motion/budget';
import { findFocusTarget, focusScrollDelta, revealFocusLater } from '../../lib/motion/focusTarget';
import { hurryAnimation, onMotionEscape } from '../../lib/motion/interrupt';
import {
  backdropFor, contentIn, fly, hide, PAGE_WINDOW_EASE, PAGE_WINDOW_MS, pageVeil, plateIn, replicaOut, settleTransitions, veilIn, windowBack,
} from '../../lib/motion/pageFlight';
import { bleedRect } from '../../lib/motion/window';
import { main, noop, rectOf, type Origin, type Rect } from './links';
import type { MorphCtx } from './context';
import type { Live } from './types';

/** 形变途中有人想滚：剩下的部分在这么长里放完，落地后再把攒下的滚动补上（lib/motion/scrollGuard.ts）。 */
export const HURRY_MS = 180;
/** 图表按帧依次挂上的最长等待窗口：期间推迟数据重读（stageMotion），挂完重新锁住后半程重活。 */
const CHARTS_DRAIN_MS = 260;
/** 半途折返时的最短时长，避免刚收拢一两帧立刻重开变成硬跳。 */
const MIN_REVERSE_MS = 180;

/** 新页从卡里长出来：页面自己从卡的矩形裁到整个可视区；来处页同时慢慢蒙上模糊。窗口长满那一刻来处页离场，
    形变的痕迹全部撤掉——页面此刻就是它的静止样子。 */
export const startExpand = (ctx: MorphCtx, el: HTMLElement, done: () => void, origin: Origin, viewport: Rect, host: HTMLElement, focus: string | null) => {
  const leaving = ctx.state.expandLeaving;
  ctx.state.expandLeaving = null;
  // 卡片入场动画不放：页面的出现就是这段形变（内容在后半程淡入）。
  el.classList.add('page-revisit');
  // 收到一半又点开同一页：从停住的那个框接着长，不从卡上重来。
  const previous = ctx.ledger.adopt([el, leaving?.el ?? null]);
  const reversing = previous && previous.kind === 'collapse' && previous.path === ctx.state.expandPath ? previous : null;
  // 被丢下的旧详情页（同一页的另一个实例）：新页接着它停住的样子长，它这一帧就收场。
  if (reversing && reversing.page !== el && !reversing.claimed.has(reversing.page)) {
    reversing.claimed.add(reversing.page);
    ctx.ledger.disposePage(reversing);
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
  const duration = reversing ? Math.max(MIN_REVERSE_MS, reversing.elapsed) : PAGE_WINDOW_MS;
  const flight = fly({
    page: el,
    backdrop: backdropFor(el, viewport, host, origin.radius),
    radius: origin.radius,
    from: { rect: start, anchor: { x: start.left - focusAt.x, y: start.top - focusAt.y } },
    to: { rect: bleedRect(viewport, origin.radius), anchor: { x: box.left, y: box.top } },
    duration,
    easing: PAGE_WINDOW_EASE,
    replica: origin.replica,
    replicaAt: focusAt,
    replicaFade: replicaOut(reversing ? reversing.snap.replica : 1),
    head: contentIn(reversing ? reversing.snap.content : 0),
    body: contentIn(reversing ? reversing.snap.content : 0),
    plate: plateIn(reversing ? reversing.snap.plate : 0),
    // 收到最后一段（窗口在淡掉）又点开：窗口从此刻的透明度亮回来。
    fade: reversing && reversing.snap.page < 1 ? windowBack(reversing.snap.page) : undefined,
    early: focusPart ? (part) => part === focusPart : undefined,
  });
  const veil = leaving ? pageVeil(leaving.el, viewport) : null;
  settleTransitions(el, leaving?.el);
  const veilFrom = veilIn(previous ? previous.veilNow : 0, duration);
  const veilAnim = veil ? veil.animate(veilFrom.frames, veilFrom.options) : null;
  // 页面外面的来源（底栏里的就绪度胶囊）浮在形变上面，窗口从它底下长出来：它不用藏，藏了只会空一下（10-07 录屏）。
  const hidden = origin.card.isConnected && main()?.contains(origin.card) ? hide(origin.card) : null;
  let release: () => void = noop;
  const job: Live = {
    kind: 'expand', page: el, path: ctx.state.expandPath, under: leaving?.el ?? null, flight, veil, veilAnim, hidden,
    release: () => release(), pageDone: done, underDone: leaving?.done ?? noop, stop: noop, hurry: noop,
    landed: false, pageGone: false, underGone: false,
  };
  ctx.state.live = job;
  ctx.ledger.dropIfDone();
  const all = () => [...flight.anims, ...(veilAnim ? [veilAnim] : [])];
  // 窗口在合成器上当帧立即起飞，不再 pause 空等 380ms（避免背景先黑、窗口卡住后再突跳）；
  // 同时短暂放开 motionBusy 让首屏图表以每帧一张挂进正在长大的窗口，用 stageMotion 拦住后台数据重读直到落地。
  const staged = stageMotion();
  ctx.ledger.takeHold()();
  let drained = false;
  const lockAfterDrain = () => {
    if (drained) return;
    drained = true;
    if (ctx.state.live === job && !job.landed) {
      release = holdMotion();
      settleTransitions(el, leaving?.el);
    }
    staged();
  };
  void whenSlotsDrained(CHARTS_DRAIN_MS).then(lockAfterDrain);
  job.hurry = () => {
    if (ctx.state.live !== job || job.landed) return;
    lockAfterDrain();
    for (const animation of all()) hurryAnimation(animation, HURRY_MS);
  };
  // 放到一半按 Esc：不进去了——路由退回来处，收回从此刻的样子接着缩（decide 把这一段停住交给收回）。
  const forgetEscape = onMotionEscape(() => {
    if (ctx.state.live !== job || job.landed) return false;
    ctx.back();
    return true;
  });
  job.stop = forgetEscape;
  const finish = () => {
    if (ctx.state.live !== job || job.landed) return;
    job.landed = true;
    ctx.state.live = null;
    forgetEscape();
    // 窗口长满：来处页先离场（KeepAlive 收进缓存），再撤掉形变——这一帧页面就是它的静止样子。
    ctx.ledger.disposeUnder(job);
    job.underDone();
    job.pageDone();
    ctx.ledger.disposePage(job);
    release();
    ctx.ledger.sweepSoon();
    ctx.ledger.unlockScroll(true);
    // 定位的那张卡：等页面排版落定再平滑滚过去，再圈一下（形变开始前那次滚动常常滚不够）。
    if (focus) revealFocusLater(el, focus);
  };
  flight.main.finished.then(finish, noop);
};
