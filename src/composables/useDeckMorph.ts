import { onBeforeUnmount, type Ref } from 'vue';
import { flightFrom, unscaledBox, type Box } from '../lib/deck/morph';
import { collapseGhost, playGhost, revealAfterGhost } from '../lib/motion/ghost';

/**
 * 设置卡组在三种形态之间的形变：coverflow ↔ 卡包（洗牌式飞出 / 收拢）、总览 ↔ 打开一张。
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

const OPEN_MS = 420;
const CLOSE_MS = 220;
const OPEN_EASE = 'cubic-bezier(.2, .9, .22, 1)';
const CLOSE_EASE = 'cubic-bezier(.4, 0, .2, 1)';
/** 关卡：板收回源卡。和概览页「返回」同一条曲线（先快后慢、没有回弹）。 */
const RETURN_MS = 440;
const RETURN_EASE = 'cubic-bezier(.32, .72, 0, 1)';
/** 展开全部 / 收起：一张张飞出、收拢。 */
const FLIGHT_MS = 460;
const FLIGHT_STAGGER_MS = 24;
const FLIGHT_EASE = 'cubic-bezier(.2, .85, .25, 1)';

const boxOf = (el: Element): Box => {
  const rect = el.getBoundingClientRect();
  return { left: rect.left, top: rect.top, width: rect.width, height: rect.height };
};

/** `plate`：关卡时那块收回源卡的板——它不能倒着放回「打开」，要重开就先取消。 */
type Morph = { animation: Animation; id: string; kind: 'open' | 'close'; closed?: () => void; plate?: boolean };

export const useDeckMorph = ({ overview, card, reducedMotion }: DeckMorphRefs) => {
  let morph: Morph | null = null;
  let ghost: Animation | null = null;
  let flights: Animation[] = [];

  const sourceOf = (id: string) =>
    overview.value?.querySelector<HTMLElement>(`[data-deck-card="${CSS.escape(id)}"]`) ?? null;

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
        { opacity: 0, transform: 'translateY(14px)' },
        { opacity: 1, transform: 'none' },
      ],
      { duration: 280, easing: OPEN_EASE },
    );
  };

  /** 大卡在画面上看得见的那一段：幽灵板只需要长到这么大。 */
  const visibleBoxOf = (el: HTMLElement): Box => {
    const box = boxOf(el);
    const top = Math.max(box.top, 0);
    const bottom = Math.min(box.top + box.height, window.innerHeight);
    return { left: box.left, top, width: box.width, height: Math.max(1, bottom - top) };
  };

  /**
   * 总览里的 `id` 那张卡长成打开的大卡。形变只落在幽灵板上（lib/motion/ghost.ts）：
   * 以前直接对整张大卡逐帧动 clip-path，大卡里是整段设置表单，每帧都得整张重画。
   * 大卡本身只做淡入 + 一点上浮。
   */
  const open = (id: string) => {
    const el = card.value;
    if (!el || reducedMotion()) return;
    if (morph && morph.id === id && morph.kind === 'close' && !morph.plate && morph.animation.playState === 'running') {
      morph.kind = 'open';
      morph.animation.reverse();
      if (ghost?.playState === 'running') ghost.reverse();
      return;
    }
    if (morph) {
      const previous = morph;
      morph = null;
      previous.animation.cancel();
      if (previous.kind === 'close') previous.closed?.();
    }
    // 关到一半又打开同一张：大卡上还挂着关卡时那段淡出（fill: both），不清掉它就一直是透明的。
    for (const animation of el.getAnimations()) animation.cancel();
    ghost?.cancel();
    ghost = null;
    const source = sourceOf(id);
    const from = source ? boxOf(source) : null;
    const host = document.getElementById('main-content')?.parentElement;
    if (!from || !host || from.width < 24 || from.height < 24) {
      rise(el);
      return;
    }
    ghost = playGhost({
      from,
      to: visibleBoxOf(el),
      fromRadius: source ? radiusOf(source) : 24,
      toRadius: radiusOf(el),
      host,
      duration: OPEN_MS,
      easing: OPEN_EASE,
    });
    const animation = el.animate(revealAfterGhost(), { duration: OPEN_MS, fill: 'both' });
    track({ animation, id, kind: 'open' });
  };

  /** 源卡在总览回到原大以后的位置（总览此刻正从「退后一层」往回放大）。 */
  const settledBoxOf = (source: HTMLElement): Box | null => {
    const layer = overview.value;
    if (!layer) return null;
    const transform = getComputedStyle(layer).transform;
    const scale = transform && transform !== 'none' ? new DOMMatrixReadOnly(transform).a : 1;
    const box = boxOf(layer);
    return unscaledBox(boxOf(source), { x: box.left + box.width / 2, y: box.top }, scale);
  };

  /** 原地淡出（找不到源卡、源卡不在画面里时）。 */
  const fadeOut = (el: HTMLElement, id: string, closed: () => void, lift: number) => {
    const animation = el.animate(
      [
        { opacity: 1, transform: `translate(0px, ${lift}px)` },
        { opacity: 0, transform: `translate(0px, ${lift + 14}px) scale(.98)` },
      ],
      { duration: CLOSE_MS, easing: CLOSE_EASE, fill: 'both' },
    );
    track({ animation, id, kind: 'close', closed });
  };

  /**
   * 关上：从哪里来回哪里去。大卡先淡掉，一块圆角板从大卡的位置自下而上收回它在总览里的
   * 那张源卡（和概览页返回同一种收法），落定后淡出，源卡亮一下。总览同时从后面回到前面。
   * 放完调 `closed`。正在打开时关：把打开动画倒着放。
   *
   * `fromTop`：关卡前这张大卡顶边在屏幕上的位置。返回总览时滚动区会先被拉回顶部，
   * 给了它，淡出的第一帧就停在人刚才看到的那个位置，不会先跳一下。
   */
  const close = (id: string, closed: () => void, fromTop: number | null = null) => {
    const el = card.value;
    if (!el || reducedMotion()) { ghost?.cancel(); ghost = null; closed(); return; }
    // 开到一半就关（Esc、再点一下）：大卡和那块板一起倒着放回源卡，而不是板一下消失。
    if (morph && morph.id === id && morph.kind === 'open' && morph.animation.playState === 'running') {
      morph.kind = 'close';
      morph.closed = closed;
      morph.animation.reverse();
      if (ghost?.playState === 'running') ghost.reverse();
      else { ghost?.cancel(); ghost = null; }
      return;
    }
    ghost?.cancel();
    ghost = null;
    if (morph) {
      const previous = morph;
      morph = null;
      previous.animation.cancel();
    }
    const lift = fromTop === null ? 0 : fromTop - boxOf(el).top;
    const source = sourceOf(id);
    const host = document.getElementById('main-content')?.parentElement;
    const target = source ? settledBoxOf(source) : null;
    const onScreen = Boolean(target && target.width >= 24 && target.top < window.innerHeight && target.top + target.height > 0);
    if (!source || !host || !target || !onScreen) { fadeOut(el, id, closed, lift); return; }
    const box = boxOf(el);
    const top = Math.max(box.top + lift, 0);
    const bottom = Math.min(box.top + lift + box.height, window.innerHeight);
    const from = { left: box.left, top, width: box.width, height: Math.max(1, bottom - top) };
    el.animate(
      [{ opacity: 1, transform: `translate(0px, ${lift}px)` }, { opacity: 0, transform: `translate(0px, ${lift - 10}px) scale(.985)` }],
      { duration: 150, easing: 'ease-in', fill: 'both' },
    );
    // 源卡在板底下先藏着，板淡出时它正好接上（coverflow 卡的透明度写在行内样式里，用动画盖住，不去改它）。
    const hide = source.animate([{ opacity: 0 }, { opacity: 0 }], { duration: RETURN_MS, fill: 'forwards' });
    const plate = collapseGhost({
      viewport: from,
      to: target,
      fromRadius: radiusOf(el),
      radius: radiusOf(source),
      host,
      duration: RETURN_MS,
      fadeIn: 80,
      landAt: 0.52,
      easing: RETURN_EASE,
    });
    let lit = false;
    const light = () => {
      if (lit) return;
      lit = true;
      hide.cancel();
      source.animate(
        [{ opacity: 0, filter: 'brightness(1.3)' }, { opacity: 1, filter: 'brightness(1.3)', offset: 0.35 }, { filter: 'brightness(1)' }],
        { duration: 520, easing: 'ease-out' },
      );
    };
    void plate.landed.then(light);
    plate.done.addEventListener('cancel', light);
    track({ animation: plate.done, id, kind: 'close', closed, plate: true });
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

  /** 换形态之前记下每张卡此刻在画面上的位置（半路打断时，这就是它们正在飞的位置）。 */
  const snapshot = () => {
    const out = new Map<string, { box: Box; opacity: number }>();
    for (const el of overview.value?.querySelectorAll<HTMLElement>('[data-deck-card]') ?? []) {
      const id = el.dataset.deckCard;
      if (id) out.set(id, { box: boxOf(el), opacity: Number.parseFloat(getComputedStyle(el).opacity) || 0 });
    }
    return out;
  };

  /**
   * coverflow ↔ 卡包：像洗牌一样，每张卡从旧形态里它所在的位置飞到新形态，按 `order`
   * 依次出发（抽出来从正中那张往两边，插回去反过来）。只动独立的 translate / scale /
   * opacity 属性，叠在卡片自己的 transform（coverflow 的侧转）之外，全在合成器上。
   * 返回全部落定的时刻。
   */
  const fly = (before: Map<string, { box: Box; opacity: number }>, order: Map<string, number>) => {
    for (const animation of flights) animation.cancel();
    flights = [];
    if (reducedMotion()) return Promise.resolve();
    for (const el of overview.value?.querySelectorAll<HTMLElement>('[data-deck-card]') ?? []) {
      const id = el.dataset.deckCard;
      const from = id ? before.get(id) : undefined;
      if (!id || !from) continue;
      const flight = flightFrom(from.box, boxOf(el), layoutCenter(el));
      const opacity = Number.parseFloat(getComputedStyle(el).opacity) || 0;
      flights.push(el.animate(
        [
          { translate: `${flight.translate.x}px ${flight.translate.y}px`, scale: String(flight.scale), opacity: Math.min(1, from.opacity + 0.25) },
          { translate: '0px 0px', scale: '1', opacity },
        ],
        { duration: FLIGHT_MS, delay: (order.get(id) ?? 0) * FLIGHT_STAGGER_MS, easing: FLIGHT_EASE, fill: 'backwards' },
      ));
    }
    return Promise.all(flights.map((animation) => animation.finished.then(() => undefined, () => undefined)))
      .then(() => undefined);
  };

  /** 正在打开（板还在长）：这时按 Esc 是「不开了」，把它倒回去。 */
  const opening = () => Boolean(morph && morph.kind === 'open' && morph.animation.playState === 'running');

  /** 翻到另一张（点下面的圆点跳过去）时，新内容轻轻浮上来。 */
  const swap = () => {
    const el = card.value;
    if (el && !reducedMotion()) rise(el);
  };

  onBeforeUnmount(() => {
    morph?.animation.cancel();
    morph = null;
    ghost?.cancel();
    ghost = null;
    for (const animation of flights) animation.cancel();
    flights = [];
  });

  return { open, close, snapshot, fly, opening, swap };
};
