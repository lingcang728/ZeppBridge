import { onBeforeUnmount, type Ref } from 'vue';
import {
  collapsedFrame, flightFrom, openFrame, unscaledBox, type Box,
} from '../lib/deck/morph';

/**
 * 设置卡组在三种形态之间的形变：coverflow ↔ 平铺、总览 ↔ 打开一张。
 *
 * 全部用 Web Animations 直接动真实的卡片（几何在 lib/deck/morph.ts）。和以前的
 * View Transitions 比，好处是可以打断：
 *   - 打开到一半又关：正在放的动画直接倒着放回去（`Animation.reverse()`），
 *     反过来也一样——不会先跳到终点再重新开始；
 *   - 「展开全部」放到一半点「收起」：从每张卡此刻在画面上的位置接着飞回去。
 * 过渡期间界面照常响应点击，不会有一段「点了没反应」的时间。
 */
export interface DeckMorphRefs {
  /** 总览那一层（coverflow 或平铺）：打开一张卡时它整体往后退。 */
  overview: Ref<HTMLElement | null>;
  /** 打开的那张大卡。 */
  card: Ref<HTMLElement | null>;
  reducedMotion: () => boolean;
}

const OPEN_MS = 560;
const CLOSE_MS = 460;
const FLIGHT_MS = 420;
const FLIGHT_STAGGER_MS = 16;
const OPEN_EASE = 'cubic-bezier(.2, .9, .22, 1)';
const CLOSE_EASE = 'cubic-bezier(.4, 0, .2, 1)';
const FLIGHT_EASE = 'cubic-bezier(.2, .85, .25, 1)';

const boxOf = (el: Element): Box => {
  const rect = el.getBoundingClientRect();
  return { left: rect.left, top: rect.top, width: rect.width, height: rect.height };
};

/** 元素布局框的中心（不受它自己 transform 的影响）——也就是它变换原点的屏幕坐标。 */
const layoutCenter = (el: HTMLElement) => {
  const parent = el.offsetParent as HTMLElement | null;
  if (!parent) {
    const box = boxOf(el);
    return { x: box.left + box.width / 2, y: box.top + box.height / 2 };
  }
  const host = parent.getBoundingClientRect();
  return {
    x: host.left + parent.clientLeft + el.offsetLeft + el.offsetWidth / 2,
    y: host.top + parent.clientTop + el.offsetTop + el.offsetHeight / 2,
  };
};

type Morph = { animation: Animation; id: string; kind: 'open' | 'close'; closed?: () => void };

export const useDeckMorph = ({ overview, card, reducedMotion }: DeckMorphRefs) => {
  let morph: Morph | null = null;
  let flights: Animation[] = [];

  const sourceOf = (id: string) =>
    overview.value?.querySelector<HTMLElement>(`[data-deck-card="${CSS.escape(id)}"]`) ?? null;

  /** 源卡在总览「回到原位」以后的位置：总览此刻可能还缩着（往后退了），要把那层缩放去掉。 */
  const restingBoxOf = (el: HTMLElement): Box => {
    const host = overview.value;
    const box = boxOf(el);
    if (!host) return box;
    const style = getComputedStyle(host);
    if (style.transform === 'none') return box;
    // 总览往后退时绕顶边中点缩放（见 CardDeck.css 的 .deck-overview）。
    return unscaledBox(box, boxOf(host), new DOMMatrixReadOnly(style.transform), { x: 0.5, y: 0 });
  };

  const radiusOf = (el: HTMLElement) => Number.parseFloat(getComputedStyle(el).borderTopLeftRadius) || 34;

  const settle = (current: Morph) => {
    if (morph !== current) return;
    morph = null;
    if (current.kind === 'open') current.animation.cancel();
    else current.closed?.();
  };

  const track = (next: Morph) => {
    morph = next;
    next.animation.finished.then(() => settle(next), () => undefined);
  };

  /** 没有源卡可对（直接打开的链接、源卡不在画面里）：从后面浮上来。 */
  const rise = (el: HTMLElement) => {
    el.animate(
      [
        { opacity: 0, transform: 'translateY(18px) scale(.97)', filter: 'blur(6px)' },
        { opacity: 1, transform: 'none', filter: 'blur(0px)' },
      ],
      { duration: 380, easing: OPEN_EASE },
    );
  };

  /** 总览里的 `id` 那张卡长成打开的大卡。 */
  const open = (id: string) => {
    const el = card.value;
    if (!el || reducedMotion()) return;
    if (morph && morph.id === id && morph.kind === 'close' && morph.animation.playState === 'running') {
      morph.kind = 'open';
      morph.animation.reverse();
      return;
    }
    if (morph) {
      const previous = morph;
      morph = null;
      previous.animation.cancel();
      if (previous.kind === 'close') previous.closed?.();
    }
    const source = sourceOf(id);
    const from = source ? boxOf(source) : null;
    if (!from || from.width < 24 || from.height < 24) {
      rise(el);
      return;
    }
    const radius = radiusOf(el);
    const to = boxOf(el);
    const collapsed = collapsedFrame(from, to, radius);
    const rest = openFrame(radius);
    const animation = el.animate(
      [
        { ...collapsed, transformOrigin: '0 0', opacity: 0 },
        { opacity: 1, offset: 0.3 },
        { ...rest, transformOrigin: '0 0', opacity: 1 },
      ],
      { duration: OPEN_MS, easing: OPEN_EASE, fill: 'both' },
    );
    track({ animation, id, kind: 'open' });
  };

  /**
   * 打开的大卡缩回总览里 `id` 那张卡的位置；放完调 `closed`（调用方借此卸掉大卡）。
   * 正在打开时关：把打开动画倒着放。
   *
   * `fromTop`：关卡前这张大卡顶边在屏幕上的位置。返回总览时滚动区会先被拉回顶部，
   * 人要是正看着卡的下半截，大卡在布局里就「跳」到了顶上——以前看起来就是凭空消失。
   * 给了它，缩回去的第一帧就停在人刚才看到的那个位置。
   */
  const close = (id: string, closed: () => void, fromTop: number | null = null) => {
    const el = card.value;
    if (!el || reducedMotion()) { closed(); return; }
    if (morph && morph.id === id && morph.kind === 'open' && morph.animation.playState === 'running') {
      morph.kind = 'close';
      morph.closed = closed;
      morph.animation.reverse();
      return;
    }
    if (morph) {
      const previous = morph;
      morph = null;
      previous.animation.cancel();
    }
    const source = sourceOf(id);
    if (!source) { closed(); return; }
    const radius = radiusOf(el);
    const to = boxOf(el);
    const collapsed = collapsedFrame(restingBoxOf(source), to, radius);
    const rest = openFrame(radius);
    const lift = fromTop === null ? 0 : fromTop - to.top;
    if (lift) rest.transform = `translate(0px, ${lift}px) scale(1)`;
    const animation = el.animate(
      [
        { ...rest, transformOrigin: '0 0', opacity: 1 },
        // 大半程保持不透明：看得见它落回那一张卡上，而不是半路就淡没了。
        { opacity: 1, offset: 0.72 },
        { ...collapsed, transformOrigin: '0 0', opacity: 0 },
      ],
      { duration: CLOSE_MS, easing: CLOSE_EASE, fill: 'both' },
    );
    track({ animation, id, kind: 'close', closed });
  };

  /** 换形态之前记下每张卡此刻在画面上的位置（半路打断时，这就是它们正在飞的位置）。 */
  const snapshot = () => {
    const out = new Map<string, { box: Box; opacity: number }>();
    for (const el of overview.value?.querySelectorAll<HTMLElement>('[data-deck-card]') ?? []) {
      const id = el.dataset.deckCard;
      if (id) out.set(id, { box: boxOf(el), opacity: Number.parseFloat(getComputedStyle(el).opacity) || 0 });
    }
    return out;
  };

  /** coverflow ↔ 平铺：每张卡从旧形态里它所在的位置飞到新形态，按 `order` 依次出发。 */
  const fly = (before: Map<string, { box: Box; opacity: number }>, order: Map<string, number>) => {
    for (const animation of flights) animation.cancel();
    flights = [];
    if (reducedMotion()) return;
    for (const el of overview.value?.querySelectorAll<HTMLElement>('[data-deck-card]') ?? []) {
      const id = el.dataset.deckCard;
      const from = id ? before.get(id) : undefined;
      if (!id || !from) continue;
      const flight = flightFrom(from.box, boxOf(el), layoutCenter(el));
      const opacity = Number.parseFloat(getComputedStyle(el).opacity) || 0;
      const animation = el.animate(
        [
          { translate: `${flight.translate.x}px ${flight.translate.y}px`, scale: String(flight.scale), opacity: Math.min(1, from.opacity + 0.25) },
          { translate: '0px 0px', scale: '1', opacity },
        ],
        { duration: FLIGHT_MS, delay: (order.get(id) ?? 0) * FLIGHT_STAGGER_MS, easing: FLIGHT_EASE, fill: 'backwards' },
      );
      flights.push(animation);
    }
  };

  /** 翻到另一张（点下面的圆点跳过去）时，新内容轻轻浮上来。 */
  const swap = () => {
    const el = card.value;
    if (el && !reducedMotion()) rise(el);
  };

  onBeforeUnmount(() => {
    morph?.animation.cancel();
    morph = null;
    for (const animation of flights) animation.cancel();
    flights = [];
  });

  return { open, close, snapshot, fly, swap };
};
