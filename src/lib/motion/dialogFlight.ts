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

export interface FlightOrigin {
  /** 点开它的元素；关的时候它还在就重新量一次（页面可能滚过）。 */
  el: HTMLElement | null;
  rect: DOMRect | null;
}

const OPEN_MS = 400;
const CLOSE_MS = 280;
const VEIL_IN_MS = 240;
const OPEN_EASE = 'cubic-bezier(.2, .9, .25, 1)';
const CLOSE_EASE = 'cubic-bezier(.4, 0, .7, .2)';
/** 起点不是 0：透明度为 0 的层 Chromium 可能不合成，第一帧可见时才去光栅化，又是一跳。 */
const NEARLY_HIDDEN = 0.001;

const reducedMotion = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;

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
const open = async (backdrop: HTMLElement, panel: HTMLElement, origin: FlightOrigin | null, onEscape?: () => void) => {
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

const close = (backdrop: HTMLElement, panel: HTMLElement, origin: FlightOrigin | null) => {
  pending.delete(backdrop);
  forgetEscape(backdrop);
  if (reducedMotion() || backdrop.isConnected) return;
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

export const dialogFlight = { open, close };
