/**
 * 弹窗从哪里来回哪里去：从点开它的那个按钮里长出来，关的时候缩回那个按钮。
 *
 * 只动 transform / opacity（面板是毛玻璃，逐帧动尺寸会让 backdrop-filter 每帧重算）。
 * 关的时候面板已经被 Vue 卸载了：ModalDialog 把摘下来的节点交过来，这里挂回 body、
 * 放完收起再移除——节点还是原来那个，输入框里的字不会在收起的一瞬间变空。
 *
 * **淡入淡出只动毛玻璃层自己，不动它们的祖先**（2026-10-06 修「先闪一下再模糊」）：
 * 以前淡入写在遮罩 `.dialog-backdrop` 和面板 `.dialog-panel` 上，而模糊画在它们里面的
 * `::before` / `.dialog-glass` 上。Chromium 里祖先 opacity < 1 时它就成了背景滤镜的取样边界
 * （Backdrop Root），模糊层看不见页面——整段淡入期间页面是清楚的、只是变暗，淡入一结束
 * 模糊才「啪」地出现（无头 Chrome CPU 4× 截屏流第 6 帧清楚、第 7 帧才糊）。现在遮罩的暗色和
 * 模糊都在 `::before` 上、按伪元素做淡入；面板淡的是 `.dialog-glass` 和 `.dialog-scroll`，
 * 面板本身只做位移缩放（transform 不会变成取样边界）。
 *
 * 开之前先等画面跟得上（`whenFramesSteady`）：弹窗多半是懒加载的，挂上那一帧 GPU 正忙，动画
 * 已经在放的话第一段会被吞掉。等的这一小会儿面板和遮罩都是隐身的（`is-entering`）。
 *
 * 10-08 H3（「添加事件、个人档案这种小点击，全都会卡一下，或者先闪一下东西再出来」）：
 * - 等画面跟得上的那一小会儿，面板自己的阴影还画在**最终位置**上——淡淡的一个大框先闪出来，然后面板才从按钮里长出来。
 *   阴影挪到 `.dialog-glass` 上跟着淡入；面板在等的时候就先摆在起点（按钮那里），动画接手时不跳。
 * - 遮罩（变暗 + 模糊）不再等：点下去那一帧就开始淡入，手上立刻有回应；只有面板等画面跟得上（最多 160ms）。
 *
 * 开到一半按 Esc：从此刻的样子原路收回，不先跳到「开好」再收（读计算样式接着放）。开的这段时间
 * 向全局打断登记一个 Esc 处理（onMotionEscape）：不然全局 Esc 会把开的动画快进到底并吞掉这次按键，
 * 用户得再按一次才关得掉。
 */
import { exemptFromSettle, onMotionEscape } from './interrupt';
import { whenFramesSteady } from './steady';
import { paced } from './timing';
import { lessMotion } from './lessMotion';
import { cardReplica, visibleWindow, windowInset, windowPoses, WINDOW_OFFSETS, type WindowRect } from './window';

export { visibleWindow };
import { OPEN_EASE as WINDOW_EASE } from './timing';

export interface FlightOrigin {
  /** 点开它的元素；关的时候它还在就重新量一次（页面可能滚过）。 */
  el: HTMLElement | null;
  rect: DOMRect | null;
}

const OPEN_MS = paced(400);
const CLOSE_MS = paced(280);
const VEIL_IN_MS = paced(240);
const OPEN_EASE = 'cubic-bezier(.2, .9, .25, 1)';
const CLOSE_EASE = 'cubic-bezier(.4, 0, .7, .2)';
/** 起点不是 0：透明度为 0 的层 Chromium 可能不合成，第一帧可见时才去光栅化，又是一跳。 */
const NEARLY_HIDDEN = 0.001;

const reducedMotion = () => lessMotion();

/** 最近一次按下的位置：键盘打开、或者打开它的按钮已经没了时，退而从这里长出来。 */
let lastPress: { x: number; y: number } | null = null;
if (typeof document !== 'undefined') {
  document.addEventListener('pointerdown', (event) => { lastPress = { x: event.clientX, y: event.clientY }; }, true);
}

const usable = (el: HTMLElement | null): el is HTMLElement =>
  !!el && el.isConnected && el !== document.body && el.getClientRects().length > 0;

export const originOf = (el: HTMLElement | null): FlightOrigin => {
  if (usable(el)) return { el, rect: el.getBoundingClientRect() };
  if (lastPress) return { el: null, rect: new DOMRect(lastPress.x - 20, lastPress.y - 20, 40, 40) };
  return { el: null, rect: null };
};

const currentRect = (origin: FlightOrigin | null): DOMRect | null =>
  usable(origin?.el ?? null) ? origin!.el!.getBoundingClientRect() : origin?.rect ?? null;

/** 面板要从 `from` 那个小框出发：返回起点的 transform（纯函数，方便测）。 */
export const flightTransform = (from: { left: number; top: number; width: number; height: number },
  panel: { left: number; top: number; width: number; height: number }): string => {
  const dx = from.left + from.width / 2 - (panel.left + panel.width / 2);
  const dy = from.top + from.height / 2 - (panel.top + panel.height / 2);
  // 等比缩放：按宽度比，下限 .12（不然从一个小图标长出来时第一帧什么都看不见），上限 .7。
  const scale = Math.min(0.7, Math.max(0.12, from.width / Math.max(1, panel.width)));
  return `translate(${dx.toFixed(1)}px, ${dy.toFixed(1)}px) scale(${scale.toFixed(3)})`;
};

/** 面板此刻（带着动画的 transform）看起来的那个框 → 让摆在 `panel` 的新面板看起来一模一样的 transform。不夹缩放上下限。 */
export const matchTransform = (seen: { left: number; top: number; width: number; height: number },
  panel: { left: number; top: number; width: number; height: number }): string => {
  const dx = seen.left + seen.width / 2 - (panel.left + panel.width / 2);
  const dy = seen.top + seen.height / 2 - (panel.top + panel.height / 2);
  const scale = Math.max(0.05, seen.width / Math.max(1, panel.width));
  return `translate(${dx.toFixed(1)}px, ${dy.toFixed(1)}px) scale(${scale.toFixed(3)})`;
};

/** 面板里要淡入淡出的两层（毛玻璃底和内容）；面板自己不淡。 */
const layers = (panel: HTMLElement): HTMLElement[] =>
  Array.from(panel.querySelectorAll<HTMLElement>(':scope > .dialog-glass, :scope > .dialog-scroll'));

/* 正在收起的那段画面（ghost）。收到一半又点开（快速开关、连着点两件事）：新弹窗从它此刻的样子接着长，
   而不是遮罩叠两层（一层在淡出、一层在淡入，中间暗度掉一截再回来）、面板从按钮重新长一遍，
   还被后挂到 body 上的 ghost 盖在底下。 */
let ghost: HTMLElement | null = null;
interface Handoff { veil: number; seen: DOMRect; glass: number; text: number }
const takeGhost = (): Handoff | null => {
  const node = ghost;
  ghost = null;
  if (!node?.isConnected) return null;
  const panel = node.querySelector<HTMLElement>(':scope > .dialog-panel');
  const parts = panel ? layers(panel) : [];
  const opacityOf = (cls: string) => Number(getComputedStyle(parts.find((p) => p.classList.contains(cls)) ?? node).opacity) || 0;
  const handoff = panel ? {
    veil: Number(getComputedStyle(node, '::before').opacity) || 0,
    seen: panel.getBoundingClientRect(),
    glass: opacityOf('dialog-glass'),
    text: opacityOf('dialog-scroll'),
  } : null;
  for (const animation of node.getAnimations({ subtree: true })) animation.cancel();
  node.remove();
  return handoff;
};

/** 正在等「画面跟得上」的那一次打开：关得比它早就别再开了。 */
const pending = new WeakSet<HTMLElement>();
/** 正在打开的那几个弹窗各自的 Esc 登记，开完或关掉时注销。 */
const escapes = new WeakMap<HTMLElement, () => void>();
const forgetEscape = (backdrop: HTMLElement) => { escapes.get(backdrop)?.(); escapes.delete(backdrop); };

/** `onEscape`：开到一半按 Esc 时调用（弹窗据此关掉自己，关的动画从此刻原路收回）。 */
const scaleOpen = async (backdrop: HTMLElement, panel: HTMLElement, origin: FlightOrigin | null, onEscape?: () => void) => {
  if (reducedMotion()) { ghost?.remove(); ghost = null; return; }
  const handoff = takeGhost();
  if (handoff) {
    // 接着收起的那一刻往回长：画面刚刚还在动，不用再等它跟上。
    if (onEscape) escapes.set(backdrop, onMotionEscape(() => { forgetEscape(backdrop); onEscape(); return true; }));
    const fill = 'backwards' as const;
    const rest = Math.max(0.25, 1 - Math.min(handoff.veil, handoff.glass));
    backdrop.animate([{ opacity: Math.max(NEARLY_HIDDEN, handoff.veil) }, { opacity: 1 }], { duration: VEIL_IN_MS * rest, easing: 'ease-out', fill, pseudoElement: '::before' });
    for (const layer of layers(panel)) {
      const from = layer.classList.contains('dialog-scroll') ? handoff.text : handoff.glass;
      layer.animate([{ opacity: Math.max(NEARLY_HIDDEN, from) }, { opacity: 1 }], { duration: OPEN_MS * rest, easing: 'ease-out', fill });
    }
    const flight = panel.animate([{ transform: matchTransform(handoff.seen, panel.getBoundingClientRect()) }, { transform: 'none' }],
      { duration: OPEN_MS * rest, easing: OPEN_EASE, fill });
    const done = () => forgetEscape(backdrop);
    flight.finished.then(done, done);
    return;
  }
  backdrop.classList.add('is-entering');
  pending.add(backdrop);
  if (onEscape) escapes.set(backdrop, onMotionEscape(() => { forgetEscape(backdrop); onEscape(); return true; }));
  const fill = 'backwards' as const;
  // 遮罩点下去就开始淡入（不等）；面板先摆在起点等着。
  backdrop.animate([{ opacity: NEARLY_HIDDEN }, { opacity: 1 }], { duration: VEIL_IN_MS, easing: 'ease-out', fill, pseudoElement: '::before' });
  const final = panel.getBoundingClientRect();
  const start = (rect: DOMRect | null) => (rect ? flightTransform(rect, final) : 'scale(.96)');
  panel.style.transform = start(currentRect(origin));
  await whenFramesSteady(160);
  if (!pending.has(backdrop) || !backdrop.isConnected) { panel.style.transform = ''; return; }
  pending.delete(backdrop);
  const from = currentRect(origin);
  // 玻璃底先出来（前三成）、字晚一点（三成半以后）才淡入：面板还小的时候不挤着一屏字——10-08 H8 说的
  // 「长按进去直接闪现、收回有重影」，就是字在小框里和底下那张牌叠着。
  const duration = from ? OPEN_MS : 220;
  for (const layer of layers(panel)) {
    const text = layer.classList.contains('dialog-scroll');
    layer.animate(text && from
      ? [{ opacity: NEARLY_HIDDEN }, { opacity: NEARLY_HIDDEN, offset: 0.35 }, { opacity: 1 }]
      : [{ opacity: NEARLY_HIDDEN }, { opacity: 1, offset: from ? 0.3 : 1 }, { opacity: 1 }], { duration, easing: 'ease-out', fill });
  }
  const flight = panel.animate([{ transform: start(from) }, { transform: 'none' }], { duration: from ? OPEN_MS : 220, easing: OPEN_EASE, fill });
  panel.style.transform = '';
  const done = () => forgetEscape(backdrop);
  flight.finished.then(done, done);
  // 动画已经接手了起点的样子，把隐身撤掉。
  backdrop.classList.remove('is-entering');
};

const scaleClose = (backdrop: HTMLElement, panel: HTMLElement, origin: FlightOrigin | null) => {
  pending.delete(backdrop);
  forgetEscape(backdrop);
  // 已经化成灰飞走了（ashDissolve.ts）：不再挂回去缩一遍。
  if (reducedMotion() || backdrop.isConnected || backdrop.dataset.dissolved !== undefined) return;
  // 挂回去的只是一段收起的画面：不再是对话框，不能被聚焦、点中，也不能被别的逻辑当成「还有弹窗开着」。
  panel.removeAttribute('data-modal-dialog');
  panel.removeAttribute('role');
  backdrop.setAttribute('aria-hidden', 'true');
  backdrop.inert = true;
  backdrop.style.pointerEvents = 'none';
  document.body.appendChild(backdrop);
  const entering = backdrop.classList.contains('is-entering');
  // 开到一半就关：从此刻的样子接着收。先读计算样式，再停掉开的动画。
  // 还在等的时候面板摆在起点（内联 transform），一样从此刻的样子收。
  const panelNow = getComputedStyle(panel).transform;
  panel.style.transform = '';
  const veilNow = entering ? NEARLY_HIDDEN : Number(getComputedStyle(backdrop, '::before').opacity) || NEARLY_HIDDEN;
  const parts = layers(panel);
  const partsNow = parts.map((layer) => (entering ? NEARLY_HIDDEN : Number(getComputedStyle(layer).opacity)));
  for (const animation of backdrop.getAnimations({ subtree: true })) animation.cancel();
  backdrop.classList.remove('is-entering');
  const to = currentRect(origin);
  const end = to ? flightTransform(to, panel.getBoundingClientRect()) : 'scale(.96)';
  const timing = { duration: CLOSE_MS, easing: CLOSE_EASE, fill: 'forwards' as const };
  // 收起本身就是对 Esc 的回应：不让全局打断再把它快进成一下跳。
  exemptFromSettle(panel.animate([{ transform: panelNow }, { transform: end }], timing));
  // 收：字先淡掉（前三成），玻璃底跟着面板缩回去、最后才淡——缩回那张牌时只剩一块玻璃，不和牌上的字叠成重影。
  parts.forEach((layer, index) => exemptFromSettle(layer.animate(layer.classList.contains('dialog-scroll')
    ? [{ opacity: partsNow[index] }, { opacity: 0, offset: 0.3 }, { opacity: 0 }]
    : [{ opacity: partsNow[index] }, { opacity: partsNow[index], offset: 0.6 }, { opacity: 0 }], { ...timing, easing: 'ease-in' })));
  const fade = exemptFromSettle(backdrop.animate([{ opacity: veilNow }, { opacity: 0 }], { ...timing, easing: 'ease-in', pseudoElement: '::before' }));
  ghost?.remove();
  ghost = backdrop;
  const remove = () => { backdrop.remove(); if (ghost === backdrop) ghost = null; };
  fade.finished.then(remove, remove);
  fade.addEventListener('cancel', remove);
};

// Bare envelopes retain their existing flight; ordinary panels use the shared window geometry.
export const dialogFlight = {
  open: (backdrop: HTMLElement, panel: HTMLElement, origin: FlightOrigin | null, onEscape?: () => void) =>
    panel.classList.contains('is-bare') ? scaleOpen(backdrop, panel, origin, onEscape) : windowOpen(backdrop, panel, origin, onEscape),
  close: (backdrop: HTMLElement, panel: HTMLElement, origin: FlightOrigin | null) =>
    panel.classList.contains('is-bare') ? scaleClose(backdrop, panel, origin) : windowClose(backdrop, panel, origin),
};


/** Shared by dialogs and the stage-local star card. Content stays at 1:1 throughout. */
export function dialogWindowFrames(from: WindowRect, to: WindowRect, panel: WindowRect, radius: number): Keyframe[] {
  return windowPoses({ rect: from, anchor: { x: from.left, y: from.top } }, { rect: to, anchor: { x: to.left, y: to.top } }).map((pose, i) => {
    const dx = pose.anchor.x - panel.left, dy = pose.anchor.y - panel.top;
    return { offset: WINDOW_OFFSETS[i], transform: `translate(${dx}px, ${dy}px)`,
      // DOMRect dimensions are prototype getters, so spreading the object loses them.
      clipPath: windowInset(pose.rect, { left: panel.left + dx, top: panel.top + dy, width: panel.width, height: panel.height }, radius, true) };
  });
}
let windowGhost: HTMLElement | null = null;
let firstWindow = true;
/* 弹窗开着、收回还没落地时，来处（被点的那一行、那张卡）藏起来（用户 2026-10-27 跑鞋：「点开后后面的字消失；点回去时，
   除非那块界面完全落地，否则字绝不应该先于动画出现」）。以前来处一直留在原地，收回时窗口里的拷贝和背后的真行叠成两份字。
   用属性不用行内样式 / 类名：来处多半有 Vue 绑着的 class，补丁时会被冲掉（样式见 ModalDialog.vue 的全局一条）。 */
const sources = new WeakMap<HTMLElement, HTMLElement>();
function hideSource(backdrop: HTMLElement, origin: FlightOrigin | null) {
  const el = origin?.el;
  if (!el?.isConnected) return;
  el.setAttribute('data-dialog-source', '');
  sources.set(backdrop, el);
}
function showSource(backdrop: HTMLElement) {
  const el = sources.get(backdrop);
  sources.delete(backdrop);
  el?.removeAttribute('data-dialog-source');
}
/* 背后的模糊：开的时候跟着窗口慢慢糊上，收的时候窗口缩回去的前四成几乎不退、落地时才散掉——
   以前收起用窗口那条先快后慢的曲线，前一百多毫秒就退了一半，看上去是「啪」一下变清楚（10-27 跑鞋录屏）。 */
const VEIL_OPEN: Keyframe[] = [{ opacity: NEARLY_HIDDEN }, { opacity: 1 }];
const veilClose = (from: number): Keyframe[] => [{ opacity: from }, { opacity: from * 0.88, offset: 0.4 }, { opacity: 0 }];
/* 480ms 太赶（用户 2026-10-27：「整体动画太快了」）；照卡片展开的节奏放到 ~620ms。 */
const windowDuration = paced(480);
function snapshot(panel: HTMLElement) {
  const style = getComputedStyle(panel);
  return { transform: style.transform, clipPath: style.clipPath };
}
function attachReplica(panel: HTMLElement, origin: FlightOrigin | null, closing: boolean) {
  const source = origin?.el;
  if (!source?.isConnected) return null;
  const replica = cardReplica(source).el;
  // 来处藏着时带着 data-dialog-source，拷贝会照抄这个标记跟着一起隐身：收的时候飞回来的是一块白板（10-27）。
  replica.querySelectorAll('[data-dialog-source]').forEach(node => node.removeAttribute('data-dialog-source'));
  replica.dataset.dialogReplica = '';
  Object.assign(replica.style, { position: 'absolute', left: '0', top: '0', zIndex: '4', pointerEvents: 'none' });
  panel.appendChild(replica);
  // 收：拷贝在窗口快落地的那一段（四成到八成）亮回来——以前七成才开始亮，窗口已经停在卡上了还是一块空板（10-27 录屏「图片跳变」）。
  replica.animate(closing ? [{ opacity: 0 }, { opacity: 0, offset: .4 }, { opacity: 1, offset: .8 }, { opacity: 1 }] : [{ opacity: 1 }, { opacity: 0, offset: .3 }, { opacity: 0 }], { duration: windowDuration, fill: 'both', easing: 'linear' });
  return replica;
}
function radiusFor(origin: FlightOrigin | null, panel: HTMLElement) {
  const from = currentRect(origin);
  return Math.min(parseFloat(getComputedStyle(origin?.el ?? panel).borderRadius) || 16, (from?.height ?? 32) / 2, (from?.width ?? 32) / 2, 24);
}
function windowOpen(backdrop: HTMLElement, panel: HTMLElement, origin: FlightOrigin | null, onEscape?: () => void) {
  if (reducedMotion()) { windowGhost?.remove(); windowGhost = null; return; }
  let handed: WindowRect | null = null, veil = NEARLY_HIDDEN;
  if (windowGhost) {
    const old = windowGhost.querySelector<HTMLElement>('.dialog-panel');
    if (old) handed = visibleWindow(old);
    veil = Number(getComputedStyle(windowGhost, '::before').opacity) || veil;
    for (const animation of windowGhost.getAnimations({ subtree: true })) animation.cancel();
    showSource(windowGhost);
    windowGhost.remove(); windowGhost = null;
  }
  if (onEscape) escapes.set(backdrop, onMotionEscape(() => { onEscape(); return true; }));
  const final = panel.getBoundingClientRect();
  const from = handed ?? currentRect(origin) ?? { ...final.toJSON(), left: final.left + final.width / 2 - 20, top: final.top + final.height / 2 - 20, width: 40, height: 40 };
  const frames = dialogWindowFrames(from, final, final, radiusFor(origin, panel));
  panel.classList.add('is-flying');
  const replica = attachReplica(panel, origin, false);
  // 拷贝已经盖在来处上了，真的那一份这一帧就藏起来。
  hideSource(backdrop, origin);
  const veilFrames = veil > NEARLY_HIDDEN ? [{ opacity: veil }, { opacity: 1 }] : VEIL_OPEN;
  backdrop.animate(veilFrames, { duration: windowDuration * 0.7, fill: 'backwards', easing: 'ease-out', pseudoElement: '::before' });
  const flight = panel.animate(frames, { duration: windowDuration, easing: WINDOW_EASE, fill: 'both' });
  // 窗口还在长的时候里面的字是按最终版式排的、被裁切框切掉一半（用户 2026-10-27：「字体显示有残缺」）：
  // 框长到一半以前内容不出现，之后再淡入；起点那张卡的拷贝前三成淡出，中间只有一块玻璃在长。
  const content = panel.querySelector<HTMLElement>('.dialog-scroll');
  content?.animate([{ opacity: NEARLY_HIDDEN }, { opacity: NEARLY_HIDDEN, offset: .45 }, { opacity: 1 }], { duration: windowDuration, easing: 'ease-out', fill: 'both' });
  // 这次会话第一次开弹窗：组件刚懒加载完、GPU 正忙着光栅化，先停在按钮那一帧等画面跟得上（最多 160ms）再放，
  // 不然第一段被吞掉、看上去是一跳。遮罩不等，点下去那一帧就开始变暗。之后的弹窗都不等。
  if (firstWindow) {
    firstWindow = false;
    const held = panel.getAnimations({ subtree: true });
    held.forEach(animation => animation.pause());
    void whenFramesSteady(160).then(() => held.forEach(animation => { if (animation.playState === 'paused') animation.play(); }));
  }
  const finish = () => {
    forgetEscape(backdrop);
    replica?.remove();
    content?.getAnimations().forEach(animation => animation.cancel());
    panel.classList.remove('is-flying');
    if (backdrop.isConnected && !backdrop.inert) flight.cancel();
  };
  flight.finished.then(finish, () => { forgetEscape(backdrop); });
}
function windowClose(backdrop: HTMLElement, panel: HTMLElement, origin: FlightOrigin | null) {
  forgetEscape(backdrop);
  if (reducedMotion() || backdrop.isConnected || backdrop.dataset.dissolved !== undefined) { showSource(backdrop); return; }
  panel.removeAttribute('data-modal-dialog'); panel.removeAttribute('role');
  backdrop.inert = true; backdrop.setAttribute('aria-hidden', 'true'); backdrop.style.pointerEvents = 'none';
  document.body.appendChild(backdrop);
  const now = snapshot(panel);
  // Every keyframe must start from the visible window, not the full layout box.
  // Replacing only frame zero makes an interrupted opening grow again on close.
  const seen = visibleWindow(panel);
  const veil = Number(getComputedStyle(backdrop, '::before').opacity) || 1;
  const content = panel.querySelector<HTMLElement>('.dialog-scroll');
  const contentNow = content ? Number(getComputedStyle(content).opacity) : 1;
  for (const animation of backdrop.getAnimations({ subtree: true })) animation.cancel();
  panel.querySelectorAll('[data-dialog-replica]').forEach(el => el.remove());
  panel.style.transform = ''; panel.style.clipPath = '';
  const final = panel.getBoundingClientRect();
  const to = currentRect(origin) ?? { left: final.left + final.width / 2, top: final.top + final.height / 2, width: 1, height: 1 };
  const frames = dialogWindowFrames(seen, to, final, radiusFor(origin, panel));
  // `none` cannot interpolate with inset(): it would jump halfway through close.
  frames[0] = { ...frames[0], transform: now.transform, ...(now.clipPath === 'none' ? {} : { clipPath: now.clipPath }) };
  panel.classList.add('is-flying');
  attachReplica(panel, origin, true);
  const timing = { duration: windowDuration, easing: WINDOW_EASE, fill: 'forwards' as const };
  const flight = exemptFromSettle(panel.animate(frames, timing));
  // 收：字先淡掉（前三成），剩一块玻璃缩回去、末尾换成那张卡的拷贝——不在缩小的框里切字。
  if (content) exemptFromSettle(content.animate([{ opacity: contentNow }, { opacity: 0, offset: .3 }, { opacity: 0 }], { ...timing, easing: 'linear' }));
  exemptFromSettle(backdrop.animate(veilClose(veil), { ...timing, easing: 'linear', pseudoElement: '::before' }));
  if (windowGhost && windowGhost !== backdrop) showSource(windowGhost);
  windowGhost?.remove(); windowGhost = backdrop;
  // 落地那一帧：真的来处露出来、拷贝和窗口一起撤掉（拷贝和真卡逐像素一致，lib/motion/replica.ts），不再额外弹一下。
  const done = () => {
    showSource(backdrop);
    backdrop.remove(); if (windowGhost === backdrop) windowGhost = null;
  };
  flight.finished.then(done, () => { showSource(backdrop); backdrop.remove(); });
}
