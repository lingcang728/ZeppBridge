/**
 * 相册视图的两种动效（DOM 一侧；几何都走 lib/motion/window.ts）：
 *
 * 1. **卡 ↔ 层的窗口形变**：点年卡 → 月卡铺开，点月卡 → 那个月的日列表铺开。新的一层从被点的那张卡的矩形长出来
 *    （clip-path 的 inset，圆角整段不变；内容 1:1 不缩放，左上角跟着窗口从卡的左上角滑到原位），卡的拷贝叠在上面跟着走、
 *    淡掉；旧的那一层冻成一张幽灵板留在原处淡出。往回（胶囊上切到更浅的一层）就反过来：当前这一层冻成幽灵板，
 *    缩回到对应的那张卡里，卡在底下亮起来接手。放到一半按 Esc，从此刻的窗口原路缩回 / 长回去。
 * 2. **捏合换密度的交叉缩放**：旧排版冻成幽灵板，继续朝新尺寸缩放、淡出；新排版从旧尺寸缩放回 1、淡入。
 *    视口正中那一条记录前后都钉在同一高度（滚动跟着补），像照片应用那样「就地变密」；横向只绕整块的中线缩放，
 *    不跟着那一条左右平移（行在中间、方块在左边，平移过去整屏就往一边飘）。
 *
 * 逐帧只动 transform / opacity，加上窗口那一道 clip-path（圆角不变，留在合成器上）。
 */
import { bleedRect, cardReplica, visibleWindow, windowInset, windowPoses, WINDOW_OFFSETS, type WindowRect } from '../motion/window';
import { BACK_EASE, CLOSE_MS, OPEN_EASE, OPEN_MS, paced } from '../motion/timing';
import { exemptFromSettle, onMotionEscape } from '../motion/interrupt';
import { lessMotion } from '../motion/lessMotion';

export const scroller = (): HTMLElement | null => document.getElementById('main-content');

/** 顶栏下沿（内容滚到这条线以上就被顶栏盖住了）。 */
export const headLine = (): number => {
  const main = scroller();
  if (!main) return 0;
  const head = main.querySelector<HTMLElement>(':scope > .shell-head');
  return head ? head.getBoundingClientRect().bottom : main.getBoundingClientRect().top;
};

/** 主滚动区里看得见的那一块（顶栏以下）。 */
export const viewportBox = (): WindowRect => {
  const main = scroller();
  const box = main?.getBoundingClientRect() ?? { left: 0, top: 0, width: window.innerWidth, height: window.innerHeight, bottom: window.innerHeight };
  const top = Math.max(box.top, headLine());
  return { left: box.left, top, width: box.width, height: Math.max(0, box.top + box.height - top) };
};

const rectOf = (el: Element): WindowRect => {
  const r = el.getBoundingClientRect();
  return { left: r.left, top: r.top, width: r.width, height: r.height };
};

export const intersect = (a: WindowRect, b: WindowRect): WindowRect => {
  const left = Math.max(a.left, b.left);
  const top = Math.max(a.top, b.top);
  const right = Math.min(a.left + a.width, b.left + b.width);
  const bottom = Math.min(a.top + a.height, b.top + b.height);
  return { left, top, width: Math.max(0, right - left), height: Math.max(0, bottom - top) };
};

/* ---------- 幽灵板 ---------- */

export interface Ghost {
  el: HTMLElement;
  /** 内容滚了 `delta`（新 scrollTop − 旧 scrollTop）：板往下挪同样多，屏幕上不动。 */
  follow(delta: number): void;
  remove(): void;
}

/**
 * 把 `body` 此刻的样子冻成一张板，绝对定位在它原来的位置（同一个父元素里：祖先选择器、继承都还在）。
 * 只拷屏幕上（上下各多留一截）的那几条：屏幕外的条目和整块不在屏幕上的月份直接去掉，再按第一条留下的条目对齐。
 * 一千多条的列表拷整份，排版和样式重算要好几秒（降速 4× 实测）。
 */
const FREEZE_UNITS = '[data-album-item], .tile-month, .heat-year, .period-group';
export const freeze = (body: HTMLElement): Ghost => {
  const view = viewportBox();
  const copy = body.cloneNode(true) as HTMLElement;
  const originals = body.querySelectorAll<HTMLElement>(FREEZE_UNITS);
  const copies = copy.querySelectorAll<HTMLElement>(FREEZE_UNITS);
  let keep: { original: HTMLElement; copy: HTMLElement } | null = null;
  originals.forEach((el, i) => {
    const target = copies[i];
    if (!target) return;
    const r = el.getBoundingClientRect();
    const onScreen = r.bottom > view.top - 240 && r.top < view.top + view.height + 240;
    if (!onScreen) target.remove();
    else if (!keep && el.matches('[data-album-item]')) keep = { original: el, copy: target };
  });
  // 板上的拷贝不能再被当成真的：锚点、滚动目标、年份滚动条都靠这些属性找元素。
  const MARKS = ['data-album-body', 'data-album-item', 'data-album-id', 'data-album-day', 'data-album-month', 'data-timeline', 'data-period', 'data-period-group', 'data-index'];
  [copy, ...copy.querySelectorAll<HTMLElement>(MARKS.map((m) => `[${m}]`).join(','))].forEach((el) => MARKS.forEach((m) => el.removeAttribute(m)));
  copy.removeAttribute('id');
  copy.setAttribute('aria-hidden', 'true');
  copy.inert = true;
  copy.dataset.albumGhost = '';
  let top = body.offsetTop;
  Object.assign(copy.style, {
    position: 'absolute', left: `${body.offsetLeft}px`, top: `${top}px`, width: `${body.offsetWidth}px`, margin: '0',
    pointerEvents: 'none', zIndex: '0', transform: body.style.transform, transformOrigin: body.style.transformOrigin,
  } satisfies Partial<CSSStyleDeclaration>);
  body.parentElement?.appendChild(copy);
  // 前面那些条目去掉以后，留下的第一条往上挪了：整块板往下补回去，屏幕上每一条都还在原处。
  const kept = keep as { original: HTMLElement; copy: HTMLElement } | null;
  if (kept) {
    top += kept.original.getBoundingClientRect().top - kept.copy.getBoundingClientRect().top;
    copy.style.top = `${top}px`;
  }
  return {
    el: copy,
    follow(delta) { top += delta; copy.style.top = `${top}px`; },
    remove() { copy.getAnimations().forEach((a) => a.cancel()); copy.remove(); },
  };
};

/* ---------- 窗口形变 ---------- */

/** 一串窗口姿态 → 关键帧：`el` 的布局框是 `box`，内容里本该停在 `rest` 的那一点跟着窗口的锚点走（内容 1:1 不缩放）。 */
const poseFrames = (poses: { rect: WindowRect; anchor: { x: number; y: number } }[], rest: { x: number; y: number }, box: WindowRect): Keyframe[] =>
  poses.map((pose, i) => {
    const dx = pose.anchor.x - rest.x;
    const dy = pose.anchor.y - rest.y;
    return {
      offset: WINDOW_OFFSETS[i],
      transform: `translate(${dx.toFixed(2)}px, ${dy.toFixed(2)}px)`,
      clipPath: windowInset(pose.rect, { left: box.left + dx, top: box.top + dy, width: box.width, height: box.height }, ALBUM_RADIUS, true),
    };
  });

const moveOnly = (frames: Keyframe[]): Keyframe[] => frames.map((f) => ({ offset: f.offset, transform: f.transform }));

/** 此刻的平移（读计算样式；掉头时从这里接着走）。 */
const currentShift = (el: HTMLElement): { x: number; y: number } => {
  const m = new DOMMatrixReadOnly(getComputedStyle(el).transform === 'none' ? undefined : getComputedStyle(el).transform);
  return { x: m.m41, y: m.m42 };
};

const opacityNow = (el: HTMLElement) => Number(getComputedStyle(el).opacity) || 0;

export const ALBUM_RADIUS = 22;

export interface MorphPlan {
  /** 被点的那张卡（展开）/ 要缩回去的那张卡（收回，由 `switchTo` 渲染出来后给）。 */
  card?: HTMLElement | null;
  /** 换到新的一层并滚到位；收回时返回要落进的那张卡。 */
  switchTo: () => Promise<HTMLElement | null | void>;
  /** Esc 掉头、回到原来那一层（并把滚动放回原处）。 */
  switchBack: () => Promise<void>;
  /** 这一层的内容容器（换层后会是新的元素）。 */
  body: () => HTMLElement | null;
}

let running: { reverse: () => void } | null = null;

/** 卡 ↔ 层的形变正在放（胶囊的 Esc 先让给它掉头）。 */
export const albumMoving = (): boolean => running !== null;

/** 往深处展开：新的一层从被点的卡长出来。 */
export async function expandFromCard(plan: MorphPlan): Promise<void> {
  const oldBody = plan.body();
  const card = plan.card;
  if (lessMotion() || !oldBody || !card) { await plan.switchTo(); return; }
  running?.reverse();
  const main = scroller();
  const before = main?.scrollTop ?? 0;
  const view0 = viewportBox();
  const cardBox = rectOf(card);
  const from = intersect(cardBox, view0);
  const replica = cardReplica(card);
  const ghost = freeze(oldBody);
  await plan.switchTo();
  ghost.follow((main?.scrollTop ?? 0) - before);
  const body = plan.body();
  if (!body) { ghost.remove(); return; }
  const view = viewportBox();
  const box = rectOf(body);
  const shown = intersect(box, view);
  const rest = { x: shown.left, y: shown.top };
  const to = bleedRect(shown, ALBUM_RADIUS);
  const start = from.width && from.height ? from : cardBox;
  const frames = poseFrames(windowPoses({ rect: start, anchor: { x: start.left, y: start.top } }, { rect: to, anchor: rest }), rest, box);
  const timing = { duration: OPEN_MS, easing: OPEN_EASE };
  body.style.position = 'relative';
  body.style.zIndex = '1';
  const parent = body.parentElement!;
  const stage = parent.getBoundingClientRect();
  Object.assign(replica.el.style, { left: `${rest.x + cardBox.left - start.left - stage.left}px`, top: `${rest.y + cardBox.top - start.top - stage.top}px`, zIndex: '2' });
  parent.appendChild(replica.el);
  const anims: Animation[] = [
    body.animate(frames, timing),
    body.animate([{ opacity: 0 }, { opacity: 0, offset: 0.1 }, { opacity: 1, offset: 0.45 }, { opacity: 1 }], { ...timing, easing: 'linear' }),
    replica.el.animate(moveOnly(frames), timing),
    replica.el.animate([{ opacity: 1 }, { opacity: 1, offset: 0.12 }, { opacity: 0, offset: 0.4 }, { opacity: 0 }], { ...timing, easing: 'linear' }),
    ghost.el.animate([{ opacity: 1 }, { opacity: 0, offset: 0.45 }, { opacity: 0 }], { ...timing, easing: 'linear' }),
  ].map(exemptFromSettle);
  const cleanup = () => {
    anims.forEach((a) => a.cancel());
    replica.el.remove();
    ghost.remove();
    body.style.removeProperty('position');
    body.style.removeProperty('z-index');
    running = null;
    release();
  };
  let reversed = false;
  const reverse = () => {
    if (reversed) return;
    reversed = true;
    const seen = visibleWindow(body);
    const shift = currentShift(body);
    const fade = [opacityNow(body), opacityNow(replica.el), opacityNow(ghost.el)];
    const progress = Math.min(1, Number(anims[0]?.currentTime ?? 0) / OPEN_MS);
    anims.forEach((a) => a.cancel());
    const back = { duration: Math.max(180, CLOSE_MS * progress), easing: BACK_EASE };
    const frames2 = poseFrames(windowPoses({ rect: seen, anchor: { x: rest.x + shift.x, y: rest.y + shift.y } }, { rect: start, anchor: { x: start.left, y: start.top } }), rest, box);
    const backs = [
      body.animate(frames2, { ...back, fill: 'forwards' }),
      body.animate([{ opacity: fade[0] }, { opacity: 0, offset: 0.7 }, { opacity: 0 }], { ...back, easing: 'linear', fill: 'forwards' }),
      replica.el.animate(moveOnly(frames2), { ...back, fill: 'forwards' }),
      replica.el.animate([{ opacity: fade[1] }, { opacity: 1, offset: 0.6 }, { opacity: 1 }], { ...back, easing: 'linear', fill: 'forwards' }),
      ghost.el.animate([{ opacity: fade[2] }, { opacity: 1, offset: 0.5 }, { opacity: 1 }], { ...back, easing: 'linear', fill: 'forwards' }),
    ].map(exemptFromSettle);
    anims.splice(0, anims.length, ...backs);
    void backs[0]!.finished.then(async () => {
      await plan.switchBack();
      cleanup();
    }, () => undefined);
  };
  running = { reverse };
  const release = onMotionEscape(() => { reverse(); return true; });
  await anims[0]!.finished.then(() => { if (!reversed) cleanup(); }, () => undefined);
}

/** 往浅处收回：当前这一层冻成幽灵板，缩回到对应的那张卡里。 */
export async function collapseToCard(plan: MorphPlan): Promise<void> {
  const oldBody = plan.body();
  if (lessMotion() || !oldBody) { await plan.switchTo(); return; }
  running?.reverse();
  const main = scroller();
  const before = main?.scrollTop ?? 0;
  const view0 = viewportBox();
  const shown = intersect(rectOf(oldBody), view0);
  const ghost = freeze(oldBody);
  const card = (await plan.switchTo()) ?? null;
  const delta = (main?.scrollTop ?? 0) - before;
  ghost.follow(delta);
  const body = plan.body();
  if (!card || !body) { ghost.remove(); return; }
  ghost.el.style.zIndex = '2';
  const to = rectOf(card);
  const gbox = rectOf(ghost.el);
  const rest = { x: shown.left, y: shown.top };
  const timing = { duration: CLOSE_MS, easing: BACK_EASE };
  const whole = bleedRect(shown, ALBUM_RADIUS);
  const shrink = poseFrames(windowPoses({ rect: whole, anchor: rest }, { rect: to, anchor: { x: to.left, y: to.top } }), rest, gbox);
  const anims: Animation[] = [
    ghost.el.animate(shrink, { ...timing, fill: 'forwards' }),
    ghost.el.animate([{ opacity: 1 }, { opacity: 1, offset: 0.62 }, { opacity: 0, offset: 0.88 }, { opacity: 0 }], { ...timing, easing: 'linear', fill: 'forwards' }),
    body.animate([{ opacity: 0 }, { opacity: 1, offset: 0.55 }, { opacity: 1 }], { ...timing, easing: 'linear' }),
    card.animate([{ opacity: 0 }, { opacity: 0, offset: 0.55 }, { opacity: 1, offset: 0.82 }, { opacity: 1 }], { ...timing, easing: 'linear' }),
  ].map(exemptFromSettle);
  let reversed = false;
  const cleanup = () => { anims.forEach((a) => a.cancel()); ghost.remove(); running = null; release(); };
  const reverse = () => {
    if (reversed) return;
    reversed = true;
    const seen = visibleWindow(ghost.el);
    const shift = currentShift(ghost.el);
    const fade = [opacityNow(ghost.el), opacityNow(body)];
    const progress = Math.min(1, Number(anims[0]?.currentTime ?? 0) / CLOSE_MS);
    anims.forEach((a) => a.cancel());
    const back = { duration: Math.max(180, OPEN_MS * progress), easing: OPEN_EASE };
    const grow = poseFrames(windowPoses({ rect: seen, anchor: { x: rest.x + shift.x, y: rest.y + shift.y } }, { rect: whole, anchor: rest }), rest, gbox);
    const backs = [
      ghost.el.animate(grow, { ...back, fill: 'forwards' }),
      ghost.el.animate([{ opacity: fade[0] }, { opacity: 1, offset: 0.3 }, { opacity: 1 }], { ...back, easing: 'linear', fill: 'forwards' }),
      body.animate([{ opacity: fade[1] }, { opacity: 0, offset: 0.6 }, { opacity: 0 }], { ...back, easing: 'linear', fill: 'forwards' }),
    ].map(exemptFromSettle);
    anims.splice(0, anims.length, ...backs);
    void backs[0]!.finished.then(async () => {
      await plan.switchBack();
      cleanup();
    }, () => undefined);
  };
  running = { reverse };
  const release = onMotionEscape(() => { reverse(); return true; });
  await anims[0]!.finished.then(() => { if (!reversed) cleanup(); }, () => undefined);
}

/* ---------- 捏合换密度 ---------- */

/** 条目的「大小」：面积开方（行是扁长的、方块是方的，按宽或按高比都会反）。 */
const sizeOf = (r: DOMRect | WindowRect) => Math.sqrt(Math.max(1, r.width * r.height));

export const ZOOM_MS = paced(420);

/**
 * 换一档密度：`swap` 换排版（Vue 渲染完再返回），`find` 在新排版里找回指针下那一条。
 * 旧画面冻成幽灵板朝新尺寸缩、淡出；新画面从旧尺寸缩回 1、淡入；锚点那一条前后钉在一处。
 */
export async function zoomSwap(body: HTMLElement, anchor: HTMLElement | null, swap: () => Promise<void>, find: () => HTMLElement | null, body2: () => HTMLElement | null): Promise<void> {
  if (lessMotion()) { await swap(); return; }
  const main = scroller();
  const before = main?.scrollTop ?? 0;
  const old = anchor?.getBoundingClientRect() ?? null;
  const ghost = freeze(body);
  body.style.removeProperty('transform');
  body.style.removeProperty('transform-origin');
  await swap();
  const next = body2();
  const target = find();
  if (!next) { ghost.remove(); return; }
  if (old && target && main) {
    const now = target.getBoundingClientRect();
    main.scrollTop += now.top + now.height / 2 - (old.top + old.height / 2);
  }
  ghost.follow((main?.scrollTop ?? 0) - before);
  const now = target?.getBoundingClientRect() ?? null;
  const timing = { duration: ZOOM_MS, easing: OPEN_EASE };
  const anims: Animation[] = [];
  if (old && now) {
    const k = Math.min(3, Math.max(1 / 3, sizeOf(old) / sizeOf(now)));
    const gbox = ghost.el.getBoundingClientRect();
    const nbox = next.getBoundingClientRect();
    const oc = { x: gbox.left + gbox.width / 2, y: old.top + old.height / 2 };
    const nc = { x: nbox.left + nbox.width / 2, y: now.top + now.height / 2 };
    ghost.el.style.transformOrigin = `${oc.x - gbox.left}px ${oc.y - gbox.top}px`;
    next.style.transformOrigin = `${nc.x - nbox.left}px ${nc.y - nbox.top}px`;
    const startScale = ghost.el.style.transform.match(/scale\(([\d.]+)\)/)?.[1];
    const s0 = startScale ? Number(startScale) : 1;
    anims.push(
      ghost.el.animate([{ transform: `translate(0px, 0px) scale(${s0})` }, { transform: `translate(${nc.x - oc.x}px, ${nc.y - oc.y}px) scale(${s0 / k})` }], { ...timing, fill: 'forwards' }),
      next.animate([{ transform: `translate(${oc.x - nc.x}px, ${oc.y - nc.y}px) scale(${k})` }, { transform: 'translate(0px, 0px) scale(1)' }], timing),
    );
  }
  anims.push(
    ghost.el.animate([{ opacity: 1 }, { opacity: 0, offset: 0.7 }, { opacity: 0 }], { ...timing, easing: 'linear', fill: 'forwards' }),
    next.animate([{ opacity: 0 }, { opacity: 0, offset: 0.12 }, { opacity: 1, offset: 0.7 }, { opacity: 1 }], { ...timing, easing: 'linear' }),
  );
  await Promise.allSettled(anims.map((a) => a.finished));
  ghost.remove();
  next.style.removeProperty('transform-origin');
}
