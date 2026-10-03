import { onBeforeUnmount, type Ref } from 'vue';
import {
  centerOf, flightOffset, morphFrames, peekBox, shownRect, unscaledBox, type Box, type Point,
} from '../lib/deck/morph';
import { SLIDE_IN_EASE, SLIDE_IN_MS, slideInFrames } from '../lib/deck/physics';
import { exemptFromSettle } from '../lib/motion/interrupt';
import { BODY_IN, BODY_OUT, CLOSE_EASE, CLOSE_MS, OPEN_EASE, OPEN_MS } from '../lib/motion/timing';

/**
 * 设置卡组在三种形态之间的形变：coverflow ↔ 卡包（洗牌式飞出 / 收拢）、总览 ↔ 打开一张。
 *
 * 开 / 合是**真卡自己的容器形变**（2026-10-01 第三版）：打开的大卡自己做
 * `translate` + 定圆角的 `clip-path: inset()`，从小卡露在外面的那一条裁到整张卡；卡头从第 0 帧就在，
 * 第 0 帧和最后一帧都是卡本身，没有窗口板、没有替身交接、没有「板长满了等内容」的空档。
 * 不能只动 transform：小卡 760×78 变大卡约 900×1400，宽高比变了，纯缩放会把字拉变形。
 * 裁切的圆角整段固定（半径一变就退回主线程，见 lib/motion/window.ts 文件头），四边的 inset 交给合成器。
 *
 * 都可以打断：打开到一半关，所有动画一起 `reverse()` 原路倒回；关到一半再开同理。
 */
export interface DeckMorphRefs {
  /** 总览那一层（coverflow 或平铺）：打开一张卡时它整体往后退。 */
  overview: Ref<HTMLElement | null>;
  /** 打开的那张大卡。 */
  card: Ref<HTMLElement | null>;
  reducedMotion: () => boolean;
}

/* 时长、曲线和卡身的分段淡入淡出在 lib/motion/timing.ts：概览 ↔ 详情页用的是同一份。 */
/** coverflow 的卡正面和卡头长得不一样：从它打开时大卡在前 30% 里淡入盖上去，收回时在最后 30% 淡出露出它。 */
const COVER_FADE = 0.3;
/** 展开全部 / 收起：一张张飞出、收拢。 */
const FLIGHT_MS = 520;
const FLIGHT_STAGGER_MS = 8;
const FLIGHT_EASE = 'cubic-bezier(.3, .7, .2, 1)';

const r2 = (value: number) => Number(value.toFixed(2));
const r4 = (value: number) => Number(value.toFixed(4));

const boxOf = (el: Element): Box => {
  const rect = el.getBoundingClientRect();
  return { left: rect.left, top: rect.top, width: rect.width, height: rect.height };
};

const radiusOf = (el: HTMLElement) => Number.parseFloat(getComputedStyle(el).borderTopLeftRadius) || 26;

/** 卡包里一张卡此刻露在外面的那一段（下一张盖住的空白卡身不算）；coverflow 的卡整张都露着。 */
const seenBoxOf = (el: HTMLElement): Box => {
  const box = boxOf(el);
  const next = el.nextElementSibling;
  if (el.closest('.cover-stage') || !next?.hasAttribute('data-deck-card')) return box;
  return peekBox(box, next.getBoundingClientRect().top);
};

/** 元素布局框的中心（不受它自己 transform 的影响）——也就是它变换原点的屏幕坐标。 */
const layoutCenter = (el: HTMLElement): Point => {
  const parent = el.offsetParent as HTMLElement | null;
  if (!parent) return centerOf(boxOf(el));
  const host = parent.getBoundingClientRect();
  return {
    x: host.left + parent.clientLeft + el.offsetLeft + el.offsetWidth / 2,
    y: host.top + parent.clientTop + el.offsetTop + el.offsetHeight / 2,
  };
};

/** 计算样式里的 `translate` / `scale` 读回数字（'none' 就是没有）。 */
const translateOf = (value: string): Point => {
  if (!value || value === 'none') return { x: 0, y: 0 };
  const [x = 0, y = 0] = value.split(/\s+/).map((part) => Number.parseFloat(part) || 0);
  return { x, y };
};
const scaleOf = (value: string): number => {
  if (!value || value === 'none') return 1;
  return Number.parseFloat(value.split(/\s+/)[0]) || 1;
};

/** 换形态前一张卡的样子：画面上的外接框、变换原点、透明度，以及它此刻的 translate / scale（半路打断时是飞行中的值）。 */
interface CardShot {
  box: Box;
  origin: Point;
  opacity: number;
  translate: Point;
  scale: number;
}

/** 换形态前的整组卡：每张卡的样子，以及一份冻结在那一刻的拷贝（换形态后它从旧位置飞走、淡掉）。 */
export interface DeckSnapshot {
  cards: Map<string, CardShot>;
  ghost: HTMLElement | null;
}

interface Morph {
  id: string;
  kind: 'open' | 'close';
  /** 一起放、一起倒放的那几段（大卡的形状、卡身淡入淡出、coverflow 的交叉淡化）。 */
  anims: Animation[];
  main: Animation;
  /** 收尾：撤掉动画、把源卡露回来、停掉尺寸监听。 */
  cleanup: () => void;
  /** 不跟着倒放的附带动画（总览的滚动补偿）：倒放时直接撤掉。 */
  extra?: Animation | null;
  closed?: () => void;
}

export const useDeckMorph = ({ overview, card, reducedMotion }: DeckMorphRefs) => {
  let morph: Morph | null = null;
  let flights: Animation[] = [];
  let flightGhost: HTMLElement | null = null;

  const sourceOf = (id: string) =>
    overview.value?.querySelector<HTMLElement>(`[data-deck-card="${CSS.escape(id)}"]`) ?? null;
  const cardEls = () => [...(overview.value?.querySelectorAll<HTMLElement>('[data-deck-card]') ?? [])];
  /** 大卡里要晚一点出现的部分：卡身、×、把手，以及下面的圆点。 */
  const partsOf = (el: HTMLElement) => [
    ...el.querySelectorAll<HTMLElement>(':scope > .deck-body, .deck-close, .deck-grip'),
    ...(el.parentElement?.querySelectorAll<HTMLElement>(':scope > .deck-dots') ?? []),
  ];

  const running = (current: Morph | null) => Boolean(current && current.main.playState === 'running');

  const settle = (current: Morph) => {
    if (morph !== current) return;
    morph = null;
    // 先让大卡下场（closed 清掉 closingId，Vue 在这一帧画之前就把它藏起来），再撤动画：中间不会闪出整张大卡。
    if (current.kind === 'close') current.closed?.();
    current.cleanup();
  };

  const begin = (next: Morph) => {
    morph = next;
    next.main.finished.then(() => settle(next), () => undefined);
  };

  const stopCurrent = () => {
    const previous = morph;
    morph = null;
    previous?.cleanup();
  };

  const reverse = (current: Morph, kind: 'open' | 'close', closed?: () => void) => {
    current.kind = kind;
    current.closed = closed;
    current.extra?.cancel();
    current.extra = null;
    for (const animation of current.anims) animation.reverse();
  };

  /** 源卡在形变期间藏着（行内样式不动，用一段不参与快进的动画盖住）。 */
  const hide = (el: HTMLElement | null) =>
    el ? exemptFromSettle(el.animate([{ opacity: 0 }, { opacity: 0 }], { duration: 1, fill: 'forwards' })) : null;

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

  /**
   * 总览里的 `id` 那张卡长成打开的大卡。
   * `seen`：路由换过去之前那张小卡露在外面的那一段（滚动区随后会被拉回顶部）；没有就现量。
   */
  const open = (id: string, seen: Box | null = null) => {
    const el = card.value;
    if (!el || reducedMotion()) return;
    if (morph && morph.id === id && morph.kind === 'close' && running(morph)) {
      reverse(morph, 'open');
      return;
    }
    if (morph?.kind === 'close') morph.closed?.();
    stopCurrent();
    for (const animation of el.getAnimations()) animation.cancel();
    const source = sourceOf(id);
    const from = seen ?? (source ? seenBoxOf(source) : null);
    if (!from || from.width < 24 || from.height < 24) {
      rise(el);
      return;
    }
    const fromCover = Boolean(source?.closest('.cover-stage'));
    const start = boxOf(el);
    const radius = radiusOf(el);
    const layout = (): Box => ({ left: start.left, top: start.top, width: el.offsetWidth, height: el.offsetHeight });
    const frames = () => {
      const box = layout();
      return morphFrames(
        { rect: from, anchor: { x: from.left, y: from.top } },
        { rect: shownRect(box, window.innerHeight), anchor: { x: box.left, y: box.top } },
        box,
        radius,
      );
    };
    const timing: KeyframeAnimationOptions = { duration: OPEN_MS, easing: OPEN_EASE, fill: 'both' };
    const main = el.animate(frames(), timing);
    const linear: KeyframeAnimationOptions = { duration: OPEN_MS, easing: 'linear', fill: 'both' };
    const anims = [
      main,
      ...partsOf(el).map((part) => part.animate(BODY_IN, linear)),
    ];
    if (fromCover) anims.push(el.animate([{ opacity: 0 }, { opacity: 1, offset: COVER_FADE }, { opacity: 1 }], linear));
    const hidden = fromCover ? null : hide(source);
    // 卡包往下滚过再点开：路由一换滚动区就被拉回顶部，总览第一帧整体跳一截。让它从人刚才看到的位置
    // 退到后面去（终点和 .is-receded 的 CSS 一样，放完交还给 CSS）。
    const shift = source ? from.top - boxOf(source).top : 0;
    const extra = Math.abs(shift) > 1 && overview.value
      ? overview.value.animate(
        [{ transform: `translateY(${r2(shift)}px)` }, { transform: 'scale(.94)' }],
        { duration: 300, easing: OPEN_EASE },
      )
      : null;
    // 卡里的内容晚一点长高（数据回来）：形状还在走时换终点，时间轴不变。
    const resized = typeof ResizeObserver === 'function'
      ? new ResizeObserver(() => {
        if (morph?.main === main && main.playState === 'running') (main.effect as KeyframeEffect | null)?.setKeyframes(frames());
      })
      : null;
    resized?.observe(el);
    begin({
      id,
      kind: 'open',
      anims,
      main,
      extra,
      cleanup: () => {
        resized?.disconnect();
        extra?.cancel();
        hidden?.cancel();
        for (const animation of anims) animation.cancel();
      },
    });
  };

  /** 源卡在总览回到原大以后的样子（总览此刻正从「退后一层」往回放大）：卡包里只算露在外面的那一段。 */
  const settledSeenBoxOf = (source: HTMLElement): Box | null => {
    const layer = overview.value;
    if (!layer) return null;
    const transform = getComputedStyle(layer).transform;
    const scale = transform && transform !== 'none' ? new DOMMatrixReadOnly(transform).a : 1;
    const box = boxOf(layer);
    const origin = { x: box.left + box.width / 2, y: box.top };
    const settled = unscaledBox(boxOf(source), origin, scale);
    const next = source.nextElementSibling;
    if (source.closest('.cover-stage') || !next?.hasAttribute('data-deck-card')) return settled;
    return peekBox(settled, unscaledBox(boxOf(next), origin, scale).top);
  };

  /** 原地淡出（找不到源卡、源卡不在画面里时）。 */
  const fadeOut = (el: HTMLElement, id: string, closed: () => void, lift: number) => {
    const main = el.animate(
      [
        { opacity: 1, transform: `translate(0px, ${lift}px)` },
        { opacity: 0, transform: `translate(0px, ${lift + 14}px) scale(.98)` },
      ],
      { duration: 220, easing: 'cubic-bezier(.4, 0, .2, 1)', fill: 'both' },
    );
    begin({ id, kind: 'close', anims: [main], main, closed, cleanup: () => main.cancel() });
  };

  /**
   * 关上：从哪里来回哪里去。大卡自己缩回它在总览里那张源卡露在外面的那一段，卡身先淡掉、卡头一直在；
   * 落定那一帧大卡下场、源卡原样接上——画面上始终只有一份卡。总览同时从后面回到前面。
   * 放完调 `closed`。正在打开时关：把打开的动画倒着放。
   *
   * `fromTop`：关卡前这张大卡顶边在屏幕上的位置。返回总览时滚动区会先被拉回顶部，
   * 给了它，第一帧就停在人刚才看到的那个位置，不会先跳一下。
   */
  const close = (id: string, closed: () => void, fromTop: number | null = null) => {
    const el = card.value;
    if (!el || reducedMotion()) { stopCurrent(); closed(); return; }
    if (morph && morph.id === id && morph.kind === 'open' && running(morph)) {
      reverse(morph, 'close', closed);
      return;
    }
    stopCurrent();
    for (const animation of el.getAnimations()) animation.cancel();
    const start = boxOf(el);
    const lift = fromTop === null ? 0 : fromTop - start.top;
    const source = sourceOf(id);
    const target = source ? settledSeenBoxOf(source) : null;
    const onScreen = Boolean(target && target.width >= 24 && target.top < window.innerHeight && target.top + target.height > 0);
    if (!source || !target || !onScreen) { fadeOut(el, id, closed, lift); return; }
    const toCover = Boolean(source.closest('.cover-stage'));
    const box: Box = { left: start.left, top: start.top, width: el.offsetWidth, height: el.offsetHeight };
    const lifted: Box = { ...box, top: box.top + lift };
    const frames = morphFrames(
      { rect: shownRect(lifted, window.innerHeight), anchor: { x: lifted.left, y: lifted.top } },
      { rect: target, anchor: { x: target.left, y: target.top } },
      box,
      radiusOf(el),
    );
    const main = el.animate(frames, { duration: CLOSE_MS, easing: CLOSE_EASE, fill: 'both' });
    const linear: KeyframeAnimationOptions = { duration: CLOSE_MS, easing: 'linear', fill: 'both' };
    const anims = [
      main,
      ...partsOf(el).map((part) => part.animate(BODY_OUT, linear)),
    ];
    if (toCover) anims.push(el.animate([{ opacity: 1 }, { opacity: 1, offset: 1 - COVER_FADE }, { opacity: 0 }], linear));
    const hidden = toCover ? null : hide(source);
    begin({
      id,
      kind: 'close',
      anims,
      main,
      closed,
      cleanup: () => {
        hidden?.cancel();
        for (const animation of anims) animation.cancel();
      },
    });
  };

  /** 拍下画面里那组卡（不带拷贝）：开卡时要的是每张小卡露在外面的那一段。 */
  const seenBoxes = () => {
    const out = new Map<string, Box>();
    for (const el of cardEls()) {
      if (el.dataset.deckCard) out.set(el.dataset.deckCard, seenBoxOf(el));
    }
    return out;
  };

  /**
   * 换形态之前记下每张卡此刻的样子（半路打断时，就是它们正在飞的样子），并把整组卡拷一份冻结在那一刻：
   * 换形态后旧的那组从原处飞向新位置、淡掉，新的那组从旧位置飞过去、淡入——两组走同一条路，
   * coverflow 的正面和卡包的卡头交叉淡化，而不是把同一段字拉扁拉长。
   */
  const snapshot = (): DeckSnapshot => {
    const cards = new Map<string, CardShot>();
    const els = cardEls();
    for (const el of els) {
      const id = el.dataset.deckCard;
      if (!id) continue;
      const style = getComputedStyle(el);
      cards.set(id, {
        box: boxOf(el),
        origin: layoutCenter(el),
        opacity: Number.parseFloat(style.opacity) || 0,
        translate: translateOf(style.translate),
        scale: scaleOf(style.scale),
      });
    }
    const container = els[0]?.parentElement;
    if (!container || reducedMotion()) return { cards, ghost: null };
    const rect = container.getBoundingClientRect();
    const ghost = container.cloneNode(true) as HTMLElement;
    ghost.setAttribute('aria-hidden', 'true');
    ghost.setAttribute('inert', '');
    for (const node of [ghost, ...ghost.querySelectorAll('[id]')]) node.removeAttribute('id');
    ghost.classList.add('deck-flight-ghost');
    Object.assign(ghost.style, {
      position: 'fixed',
      left: `${rect.left}px`,
      top: `${rect.top}px`,
      width: `${rect.width}px`,
      height: `${rect.height}px`,
      margin: '0',
      boxSizing: 'border-box',
      zIndex: '25',
      pointerEvents: 'none',
    });
    const copies = ghost.querySelectorAll<HTMLElement>('[data-deck-card]');
    els.forEach((el, index) => {
      const copy = copies[index];
      if (!copy) return;
      const style = getComputedStyle(el);
      // 卡包里的卡只拷露在外面的那一段：空白卡身飞起来会盖住别的卡头（「一叠空卡」）。
      // 正在飞的卡身上已经带着这道裁切（.is-switching），照抄；静止的按下一张卡的位置算。
      let clipPath = style.clipPath;
      if (clipPath === 'none' && !el.closest('.cover-stage')) {
        const box = boxOf(el);
        const covered = (box.height - seenBoxOf(el).height) * (el.offsetHeight / Math.max(1, box.height));
        const radius = radiusOf(el);
        if (covered > 1) clipPath = `inset(0px 0px ${r2(covered)}px 0px round ${radius}px ${radius}px 0px 0px)`;
      }
      Object.assign(copy.style, {
        transition: 'none',
        animation: 'none',
        translate: style.translate,
        scale: style.scale,
        opacity: style.opacity,
        clipPath,
      });
    });
    return { cards, ghost };
  };

  const dropFlights = () => {
    for (const animation of flights) animation.cancel();
    flights = [];
    flightGhost?.remove();
    flightGhost = null;
  };

  /**
   * coverflow ↔ 卡包：像洗牌一样，每张卡从旧形态里它所在的样子飞到新形态，按 `order`
   * 依次出发（抽出来从正中那张往两边，插回去反过来）。
   *
   * 动的是独立的 `translate` / `scale`（叠在卡自己的 transform 外面），缩放**等比**：coverflow 里的卡
   * 一路保持自己的侧转姿态，不再从别的侧转角转过来，也不再非等比地被拉成另一种宽高比
   * （以前 500×316 ↔ 760×184 纵向差 1.7 倍，字被拉扁拉长）。飞行中**不改层级**：卡包「后面压前面」的
   * 顺序保持不变，卡包里的卡飞行时只露卡头那一段（`.is-switching` 的裁切），空白卡身盖不住别的卡头。
   * 旧形态那组卡的拷贝同时飞向新位置、淡出。全在合成器上。返回全部落定的时刻。
   */
  const fly = (before: DeckSnapshot, order: Map<string, number>) => {
    dropFlights();
    const { cards: shots, ghost } = before;
    if (reducedMotion()) {
      ghost?.remove();
      return Promise.resolve();
    }
    const host = document.getElementById('main-content')?.parentElement;
    if (ghost && host) {
      host.appendChild(ghost);
      flightGhost = ghost;
    }
    const now = new Map<string, { el: HTMLElement; box: Box; origin: Point; opacity: number }>();
    for (const el of cardEls()) {
      const id = el.dataset.deckCard;
      if (id) now.set(id, { el, box: boxOf(el), origin: layoutCenter(el), opacity: Number.parseFloat(getComputedStyle(el).opacity) || 0 });
    }
    const timing = (id: string): KeyframeAnimationOptions => ({
      duration: FLIGHT_MS,
      delay: (order.get(id) ?? 0) * FLIGHT_STAGGER_MS,
      easing: FLIGHT_EASE,
      fill: 'backwards',
    });
    // 新形态那组：从旧位置、旧宽度（等比）飞到自己的位置，前 40% 淡入。
    for (const [id, card] of now) {
      const shot = shots.get(id);
      if (!shot || card.box.width < 1) continue;
      const k = shot.box.width / card.box.width;
      const t = flightOffset(centerOf(shot.box), card.origin, centerOf(card.box), k);
      flights.push(card.el.animate([
        { translate: `${r2(t.x)}px ${r2(t.y)}px`, scale: String(r4(k)), opacity: 0 },
        { opacity: card.opacity, offset: 0.4 },
        { translate: '0px 0px', scale: '1', opacity: card.opacity },
      ], timing(id)));
    }
    // 旧形态那组的拷贝：从原处飞向新位置，先留一下再淡出——拷贝在上面，淡掉后露出底下飞来的新卡。
    const copies = flightGhost?.querySelectorAll<HTMLElement>('[data-deck-card]') ?? [];
    for (const copy of copies) {
      const id = copy.dataset.deckCard;
      const shot = id ? shots.get(id) : undefined;
      const card = id ? now.get(id) : undefined;
      if (!id || !shot || !card || shot.box.width < 1) continue;
      // 拷贝上原有的 translate / scale 先拿掉，得到它「只有自己 transform」时的画面中心。
      const visual = {
        x: shot.origin.x + (centerOf(shot.box).x - shot.origin.x - shot.translate.x) / shot.scale,
        y: shot.origin.y + (centerOf(shot.box).y - shot.origin.y - shot.translate.y) / shot.scale,
      };
      const k = (shot.scale * card.box.width) / shot.box.width;
      const t = flightOffset(centerOf(card.box), shot.origin, visual, k);
      flights.push(copy.animate([
        { translate: `${r2(shot.translate.x)}px ${r2(shot.translate.y)}px`, scale: String(r4(shot.scale)), opacity: shot.opacity },
        { opacity: shot.opacity, offset: 0.12 },
        { opacity: 0, offset: 0.5 },
        { translate: `${r2(t.x)}px ${r2(t.y)}px`, scale: String(r4(k)), opacity: 0 },
      ], { ...timing(id), fill: 'both' }));
    }
    const mine = flightGhost;
    return Promise.all(flights.map((animation) => animation.finished.then(() => undefined, () => undefined)))
      .then(() => {
        if (flightGhost === mine) {
          mine?.remove();
          flightGhost = null;
        }
      });
  };

  /** 正在打开：这时按 Esc 是「不开了」，把它倒回去。 */
  const opening = () => Boolean(morph && morph.kind === 'open' && running(morph));

  /** 翻到另一张（点下面的圆点跳过去）时，新内容从跳去的那一侧滑进来（和拖着甩是同一种动作）。 */
  const swap = (direction: -1 | 1 = 1) => {
    const el = card.value;
    if (!el || reducedMotion()) return;
    el.animate(slideInFrames(direction, el.clientWidth), { duration: SLIDE_IN_MS, easing: SLIDE_IN_EASE });
  };

  onBeforeUnmount(() => {
    stopCurrent();
    dropFlights();
  });

  return { open, close, seenBoxes, snapshot, fly, opening, swap };
};
