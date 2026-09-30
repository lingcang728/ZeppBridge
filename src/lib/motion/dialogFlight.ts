/**
 * 弹窗从哪里来回哪里去：从点开它的那个按钮里长出来，关的时候缩回那个按钮。
 *
 * 只动 transform / opacity（面板是毛玻璃，逐帧动尺寸会让 backdrop-filter 每帧重算）。
 * 关的时候面板已经被 Vue 卸载了：ModalDialog 把摘下来的节点交过来，这里挂回 body、
 * 放完收起再移除——节点还是原来那个，输入框里的字不会在收起的一瞬间变空。
 */
export interface FlightOrigin {
  /** 点开它的元素；关的时候它还在就重新量一次（页面可能滚过）。 */
  el: HTMLElement | null;
  rect: DOMRect | null;
}

const OPEN_MS = 320;
const CLOSE_MS = 220;
const OPEN_EASE = 'cubic-bezier(.2, .9, .25, 1)';
const CLOSE_EASE = 'cubic-bezier(.4, 0, .7, .2)';

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

const open = (backdrop: HTMLElement, panel: HTMLElement, origin: FlightOrigin | null) => {
  if (reducedMotion()) return;
  backdrop.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 200, easing: 'ease-out' });
  const from = currentRect(origin);
  if (!from) {
    panel.animate([{ opacity: 0, transform: 'scale(.96)' }, { opacity: 1, transform: 'none' }], { duration: 220, easing: OPEN_EASE });
    return;
  }
  const start = flightTransform(from, panel.getBoundingClientRect());
  panel.animate([{ transform: start }, { transform: 'none' }], { duration: OPEN_MS, easing: OPEN_EASE });
  panel.animate([{ opacity: 0 }, { opacity: 1 }], { duration: OPEN_MS * 0.45, easing: 'ease-out' });
};

const close = (backdrop: HTMLElement, panel: HTMLElement, origin: FlightOrigin | null) => {
  if (reducedMotion() || backdrop.isConnected) return;
  // 挂回去的只是一段收起的画面：不再是对话框，不能被聚焦、点中，也不能被别的逻辑当成「还有弹窗开着」。
  panel.removeAttribute('data-modal-dialog');
  panel.removeAttribute('role');
  backdrop.setAttribute('aria-hidden', 'true');
  backdrop.inert = true;
  backdrop.style.pointerEvents = 'none';
  document.body.appendChild(backdrop);
  const to = currentRect(origin);
  const end = to ? flightTransform(to, panel.getBoundingClientRect()) : 'scale(.96)';
  panel.animate([{ transform: 'none' }, { transform: end }], { duration: CLOSE_MS, easing: CLOSE_EASE, fill: 'forwards' });
  panel.animate([{ opacity: 1 }, { opacity: 0 }], { duration: CLOSE_MS, easing: 'ease-in', fill: 'forwards' });
  const fade = backdrop.animate([{ opacity: 1 }, { opacity: 0 }], { duration: CLOSE_MS, easing: 'ease-in', fill: 'forwards' });
  const remove = () => backdrop.remove();
  fade.finished.then(remove, remove);
  fade.addEventListener('cancel', remove);
};

export const dialogFlight = { open, close };
