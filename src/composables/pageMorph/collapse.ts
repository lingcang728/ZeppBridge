import { onMotionEscape, onMotionSkip, hurryAnimation } from '../../lib/motion/interrupt';
import {
  cardIn, contentMorphOut, PAGE_LAND_AT, contentShrinkOut, fly, hide, PAGE_BACK_EASE, PAGE_BACK_MS, PAGE_WINDOW_MS, pageVeil, plateOut, replicaBack, replicaLateIn, replicaMorphIn, settleTransitions, veilOut, windowOut,
} from '../../lib/motion/pageFlight';
import { exemptFromSettle } from '../../lib/motion/interrupt';
import { settleCssAnimations } from '../../lib/motion/settle';
import { whenFramesSteady } from '../../lib/motion/steady';
import { bleedRect, cardReplica } from '../../lib/motion/window';
import { whenScrollRestored } from '../../lib/returnScroll';
import { currentCard, main, noop, rectOf, STAYING, viewportOf, type Trail } from './links';
import { MIN_TURN_MS } from './ledger';
import type { MorphCtx } from './context';
import type { Collapse, Live } from './types';
import { HURRY_MS } from './expand';

/** 半途折返时的最短收拢时长，避免刚点开立刻返回变成一帧硬切。 */
const MIN_REVERSE_MS = 180;

/** 来处页不在缓存里时要重新读库，那张卡可能要等一会儿才出现。窗口不等它：先按记住的位置缩，
    这段时间里找到了就把终点换成真卡；超过这个时长还没有就落在记住的位置上。 */
const CARD_WAIT_MS = 300;
/** 收回途中按 Esc：剩下的部分在这么长里放完（沿用原来的曲线，不是跳到终点）。 */
const ESC_FINISH_MS = 200;
/** 找不到卡、没有拷贝可以落地时，页面在终点上淡掉的时长。 */
const LAND_FADE_MS = 140;
/** 起飞前最多等来处页画好这么久（见下面 startCollapse 里的说明）。 */
const PAINT_WAIT_MS = 120;

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

/** 缓存的来处页重新插回文档时，里面的 CSS 入场动画会从头再放一遍：卡片入场（material.css 的 card-enter）让窗口
    落到卡的最终位置上时卡还在往上浮；其余的装饰动画压在收回上，每帧都要整页重画。有限次的一律直接放完
    （循环的转圈、呼吸点不动）。 */
const settleStaying = () => settleCssAnimations(main()?.querySelector<HTMLElement>(STAYING));

/** 返回：展开的逆过程。详情页从整个可视区（开到一半被返回时，从它此刻的那个框）裁回那张卡，内容先淡掉，
    卡拷贝快落地时亮回来；来处页上的模糊前四成几乎不退、落地才散。 */
export const startCollapse = (ctx: MorphCtx, job: Collapse) => {
  if (ctx.state.pendingCollapse === job) ctx.state.pendingCollapse = null;
  const { el, trail, backdrop } = job;
  const viewport = viewportOf();
  const host = main()?.parentElement;
  if (!el.isConnected || !viewport || !host) {
    backdrop.remove();
    job.done();
    job.stayingDone();
    job.release();
    ctx.ledger.unlockScroll(false);
    return;
  }
  settleStaying();
  const staying = job.staying ?? main()?.querySelector<HTMLElement>(STAYING) ?? null;
  // 已经在往回走的那一段：按此刻画面上的样子（用它自己开始时的版面算——页面这时已经被 Vue 挪成离场的绝对定位）
  // 和还剩的时长接力，不从停住时的样子重来。
  const turned = ctx.state.stale && ctx.state.stale.turned && ctx.state.stale.kind === 'expand' && ctx.state.stale.page === el ? ctx.state.stale : null;
  if (turned) {
    const pose = turned.flight.pose();
    const veilNow = turned.veil ? Number.parseFloat(getComputedStyle(turned.veil).opacity) : 0;
    const left = Number(turned.flight.main.currentTime ?? 0);
    turned.snap = { ...turned.flight.snapshot(), window: pose.rect, anchor: pose.anchor };
    turned.veilNow = Number.isFinite(veilNow) ? veilNow : 0;
    turned.elapsed = Number.isFinite(left) ? Math.min(PAGE_WINDOW_MS, Math.max(MIN_TURN_MS, left)) : MIN_TURN_MS;
  }
  const previous = ctx.ledger.adopt([el, staying]);
  const reversing = previous && previous.kind === 'expand' && previous.page === el ? previous : null;
  const present = currentCard(trail);
  const target = present ? rectOf(present) : trail.rect;
  const box = rectOf(el);
  const duration = reversing ? Math.max(MIN_REVERSE_MS, reversing.elapsed) : PAGE_BACK_MS;
  const small = !!trail.small;
  // 两头画着同一样东西（年轮）：大的一路缩到卡上那个小的上（pageFlight.ts 的 focus）。
  const focusFrom = present ? el.querySelector('[data-morph-focus]') : null;
  const focusTo = focusFrom ? present?.querySelector<HTMLElement>('[data-morph-focus]') : null;
  const flight = fly({
    page: el,
    backdrop,
    radius: trail.radius,
    from: reversing ? { rect: reversing.snap.window, anchor: reversing.snap.anchor } : { rect: bleedRect(viewport, trail.radius), anchor: { x: box.left, y: box.top } },
    // 滚下去再返回：缩回卡的是此刻看得见的那一段（锚点抬高滚过的距离），走的路和没滚时一样长。
    to: { rect: target, anchor: { x: target.left, y: target.top - job.lift } },
    duration,
    easing: PAGE_BACK_EASE,
    replica: present ? cardReplica(present) : null,
    replicaAt: { x: 0, y: job.lift },
    replicaFade: reversing && reversing.snap.content < 0.5
      ? replicaBack(reversing.snap.replica)
      : (small ? replicaLateIn : replicaMorphIn)(reversing ? reversing.snap.replica : 0),
    head: (small ? contentShrinkOut : contentMorphOut)(reversing ? reversing.snap.content : 1),
    body: (small ? contentShrinkOut : contentMorphOut)(reversing ? reversing.snap.content : 1),
    // 容器形变：内容和卡拷贝跟着窗口一起缩放，整页逐渐变成那张卡（pageFlight.ts 的 PAGE_BACK_MS 上面的说明）。
    // 小来处的拷贝不缩放（trail.small）：按窗口宽缩放会把一颗小按钮放大成一整屏。
    scale: true,
    scaleReplica: !small,
    focus: focusFrom && focusTo ? { el: focusFrom, to: rectOf(focusTo) } : undefined,
    plate: plateOut(reversing ? reversing.snap.plate : 1),
    // 最后一段整个窗口淡掉，露出底下已经亮好的真卡（找不到卡时不淡：落地后另有一段淡出）。
    fade: present ? windowOut(reversing ? reversing.snap.page : 1) : undefined,
    // 有真卡可落：形状先落定、再交接（PAGE_LAND_AT 上面的说明）。没有就一路落到底，落地后另有一段淡出。
    landAt: present ? PAGE_LAND_AT : undefined,
    // 滚下去时页头早就不在画面里：此刻看得见的那几块按页头的节奏走，窗口里一直有东西。
    early: job.lift > 40 ? (part) => {
      const shown = part.getBoundingClientRect();
      return shown.bottom > viewport.top && shown.top < viewport.top + viewport.height;
    } : undefined,
  });
  const veil = staying ? pageVeil(staying, viewport) : null;
  settleTransitions(el, staying);
  const veilFrom = veilOut(previous ? previous.veilNow : 1, duration);
  const veilAnim = veil ? veil.animate(veilFrom.frames, veilFrom.options) : null;
  // 那张真卡：先藏着，后半程在窗口底下亮起来（pageFlight.ts 的 cardIn），和窗口同一条时间轴。
  const hidden = present && (main()?.contains(present) || present.closest('.app-topbar'))
    ? exemptFromSettle(present.animate(cardIn(), { duration, easing: 'linear', fill: 'both' }))
    : null;
  const me: Live = {
    kind: 'collapse', page: el, path: job.path, under: staying, flight, veil, veilAnim, hidden,
    release: job.release, pageDone: job.done, underDone: job.stayingDone, stop: noop, hurry: noop,
    landed: false, pageGone: false, underGone: false,
  };
  ctx.state.live = me;
  ctx.ledger.dropIfDone();
  if (!present) {
    // 来处页还在重读库：卡出现了就把终点换成它。
    void findCard(trail).then((found) => {
      if (!found || me.landed || ctx.state.live !== me || !el.isConnected) return;
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
      if (me.landed || ctx.state.live !== me || !el.isConnected || !present.isConnected) return;
      const now = rectOf(present);
      if (Math.abs(now.left - aim.left) > 1.5 || Math.abs(now.top - aim.top) > 1.5) {
        aim = now;
        flight.retarget({ rect: now, anchor: { x: now.left, y: now.top - job.lift } });
      }
      requestAnimationFrame(follow);
    };
    requestAnimationFrame(follow);
  }
  const all = () => [...flight.anims, ...(veilAnim ? [veilAnim] : []), ...(hidden ? [hidden] : [])];
  /* 来处页刚从 KeepAlive 缓存插回文档，第一次上屏要整页光栅化：窗口要是这一刻就开始缩，四周露出来的是一圈还没画好的
     黑底，过三四帧来处页才「整个冒出来」（用户 2026-11-12 录屏：履历页点出去收回的那一刻会整个重绘一下）。
     起点上窗口铺满整个可视区、完全盖着来处页，停在这里等它画好看不出在等：帧节奏稳了（最多 PAINT_WAIT_MS）再放。
     掉头接力（reversing）不等：来处页一直在场上。 */
  if (!reversing) {
    for (const animation of all()) animation.pause();
    let started = false;
    const go = () => {
      if (started) return;
      started = true;
      if (me.landed || ctx.state.live !== me) return;
      settleTransitions(el, staying);
      for (const animation of all()) if (animation.playState === 'paused') animation.play();
    };
    me.go = go;
    void whenFramesSteady(PAINT_WAIT_MS, 3).then(go);
  }
  // 点下去就动：来处页刚从缓存插回文档要整页重新光栅化，那一两帧里合成器上的缩回照样走，不先停在起点等。
  const hurry = (ms: number) => {
    me.go?.();
    for (const animation of all()) hurryAnimation(animation, ms);
  };
  me.hurry = () => { if (!me.landed && ctx.state.live === me) hurry(HURRY_MS); };
  // 收回途中按 Esc：剩下的这段在 200ms 里放完，保留原来的曲线——照样落到卡上，只是快一点。
  const forgetEscape = onMotionEscape(() => {
    if (me.landed || ctx.state.live !== me) return false;
    hurry(ESC_FINISH_MS);
    return true;
  });
  me.stop = forgetEscape;
  const land = () => {
    if (me.landed || ctx.state.live !== me) return;
    me.landed = true;
    ctx.state.live = null;
    forgetEscape();
    ctx.ledger.disposeUnder(me);
    me.underDone();
    // 攒下的滚动等返回位置恢复完再补，不然下一帧就被恢复盖掉。
    if (ctx.state.guard) { const held = ctx.state.guard; void whenScrollRestored().then(() => { if (ctx.state.guard === held) ctx.ledger.unlockScroll(true); }); }
    const leave = () => {
      me.pageDone();
      ctx.ledger.disposePage(me);
      ctx.ledger.sweepSoon();
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
