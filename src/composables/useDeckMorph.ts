import { onBeforeUnmount, type Ref } from 'vue';
import {
  centerOf, flightOffset, morphFrames, peekBox, shownRect, unscaledBox, type Box, type Point,
} from '../lib/deck/morph';
import { SLIDE_IN_EASE, SLIDE_IN_MS, slideInFrames } from '../lib/deck/physics';
import { createFlight, type Flight } from '../lib/motion/flight';
import {
  BACK_EASE, BODY_IN, BODY_OUT, CLOSE_MS, COMPRESS_MS, OPEN_EASE, OPEN_MS, RECEDE_SCALE, paced,
} from '../lib/motion/timing';

/**
 * 设置卡组在三种形态之间的形变：coverflow ↔ 卡包（洗牌式飞出 / 收拢）、总览 ↔ 打开一张。
 *
 * 开 / 合是**真卡自己的容器形变**（2026-10-01 第三版）：打开的大卡自己做
 * `translate` + 定圆角的 `clip-path: inset()`，从小卡露在外面的那一条裁到整张卡；卡头从第 0 帧就在，
 * 第 0 帧和最后一帧都是卡本身，没有窗口板、没有替身交接、没有「板长满了等内容」的空档。
 * 不能只动 transform：小卡 760×78 变大卡约 900×1400，宽高比变了，纯缩放会把字拉变形。
 * 裁切的圆角整段固定（半径一变就退回主线程，见 lib/motion/window.ts 文件头），四边的 inset 交给合成器。
 *
 * 都可以打断（lib/motion/flight.ts）：打开到一半关，整组动画掉头原路回去、走了多久就花多久；关到一半再开同理。
 * 整组不被 settleMotion 快进，连点不设保护：点几下就来回翻几下，停在最后一次要的那一头。
 */
export interface DeckMorphRefs {
  /** 总览那一层（coverflow 或平铺）：打开一张卡时它整体往后退。 */
  overview: Ref<HTMLElement | null>;
  /** 打开的那张大卡。 */
  card: Ref<HTMLElement | null>;
  reducedMotion: () => boolean;
}

/* 时长、曲线和卡身的分段淡入淡出在 lib/motion/timing.ts：概览 ↔ 详情页用的是同一份。 */
/** coverflow 的卡正面和卡头长得不一样：从它打开时大卡在前 30% 里淡入盖上去。 */
const COVER_FADE = 0.3;
/* 收回 coverflow：卡头的字和身后正面的字排版不同，同时看得见就是两份标题叠在一起（录屏里关「反馈」「隐私」时的重影）。
   卡头的字和卡身一起先淡掉，剩一块空板飞过去，落地前就化开——正面通常比短卡高，空板长不到它那么大，
   放到最后才淡出的话，最后一帧是一块比正面矮的板「啪」地换成正面。 */
const COVER_OUT: Keyframe[] = [{ opacity: 1 }, { opacity: 1, offset: 0.4 }, { opacity: 0, offset: 0.85 }, { opacity: 0 }];
/** 展开全部 / 收起：一张张飞出、收拢。 */
const FLIGHT_MS = paced(520);
const FLIGHT_STAGGER_MS = 8;
const FLIGHT_EASE = 'cubic-bezier(.3, .7, .2, 1)';
/** 关回小卡的落地（2026-11-12 第三轮）：源卡在大卡底下先亮好，大卡最后一段整张淡掉——不在小卡上停一下再一帧换掉。 */
const SOURCE_IN: Keyframe[] = [{ opacity: 0 }, { opacity: 0, offset: 0.58 }, { opacity: 1, offset: 0.8 }, { opacity: 1 }];
const CARD_OUT: Keyframe[] = [{ opacity: 1 }, { opacity: 1, offset: 0.8 }, { opacity: 0 }];
/** 大卡滚下去很远再关（卡头远在屏幕上方）：内容钉在窗口上跟着走、前三成就淡掉，窗口缩回源卡的途中源卡在底下亮起来，
    大卡后半程整张化开——不再先把大卡「卷」回顶上再缩（2026-11-12 第四轮录屏：那一下像往上回弹）。 */
const FAR_BODY_OUT: Keyframe[] = [{ opacity: 1 }, { opacity: 0, offset: 0.32 }, { opacity: 0 }];
const FAR_SOURCE_IN: Keyframe[] = [{ opacity: 0 }, { opacity: 0, offset: 0.28 }, { opacity: 1, offset: 0.62 }, { opacity: 1 }];
const FAR_CARD_OUT: Keyframe[] = [{ opacity: 1 }, { opacity: 1, offset: 0.4 }, { opacity: 0, offset: 0.82 }, { opacity: 0 }];

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

/** 元素不受自身 transform / clip-path 影响的真实布局外接框。 */
const layoutBox = (el: HTMLElement, fallback: Box): Box => {
  const parent = el.offsetParent as HTMLElement | null;
  if (!parent) return { left: fallback.left, top: fallback.top, width: el.offsetWidth, height: el.offsetHeight };
  const host = parent.getBoundingClientRect();
  return {
    left: host.left + parent.clientLeft + el.offsetLeft,
    top: host.top + parent.clientTop + el.offsetTop,
    width: el.offsetWidth,
    height: el.offsetHeight,
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
  /** 这次飞行建起来时往哪走；掉头以后实际方向看 `kindOf()`。 */
  forward: 'open' | 'close';
  flight: Flight;
  /** 原地淡出（fadeOut）带着滚动补偿，倒回去落不到原处：不掉头，另起一段打开。 */
  turnable: boolean;
  /** 落在「关上」那一头时调：大卡下场（清掉 closingId）。在撤动画之前调，中间不闪整张大卡。 */
  closed?: () => void;
  done: Promise<void>;
  resolve: () => void;
}

const kindOf = (current: Morph): 'open' | 'close' => {
  if (current.flight.direction === 1) return current.forward;
  return current.forward === 'open' ? 'close' : 'open';
};

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
  /** 卡头里调用方给的内容（图标、标题、摘要）。和 coverflow 正面交接时要单独淡入淡出。 */
  const headOf = (el: HTMLElement) => [
    ...el.querySelectorAll<HTMLElement>(':scope > .open-head > :not(.deck-grip):not(.deck-close)'),
  ];
  /** 卡组上面同一页里的东西（页头、提示条）：路由一换滚动区回顶，它们和总览一起跳。 */
  const aboveDeck = (): HTMLElement[] => {
    const deck = overview.value?.closest<HTMLElement>('.card-deck');
    const page = deck?.parentElement;
    if (!deck || !page) return [];
    const out: HTMLElement[] = [];
    for (const child of page.children) {
      if (child === deck) break;
      if (child instanceof HTMLElement) out.push(child);
    }
    return out;
  };

  /** 收尾：落在「关上」那头先让大卡下场，再撤动画、还原源卡。 */
  const finish = (current: Morph) => {
    if (morph === current) morph = null;
    if (kindOf(current) === 'close') current.closed?.();
    current.closed = undefined;
    current.flight.dispose();
    current.resolve();
  };

  const begin = (id: string, forward: Morph['forward'], duration: number, closed?: () => void, turnable = true): Morph => {
    let resolve = () => {};
    const done = new Promise<void>((r) => { resolve = r; });
    let current: Morph | null = null;
    const flight = createFlight({ duration, keepOnLand: true, onLand: () => { if (current) finish(current); } });
    current = { id, forward, flight, turnable, closed, done, resolve };
    morph = current;
    return current;
  };

  const stopCurrent = () => {
    const previous = morph;
    morph = null;
    if (previous) finish(previous);
  };

  /** 同一张卡正在往反方向走：掉头（同一组动画翻速率，原路、原时长回去）。 */
  const turnTo = (id: string, kind: 'open' | 'close', closed?: () => void) => {
    const current = morph;
    if (!current || current.id !== id || !current.turnable || kindOf(current) === kind) return false;
    if (!current.flight.turn()) return false;
    current.closed = kind === 'close' ? closed : undefined;
    return true;
  };

  /** 没有源卡可对（直接打开的链接、源卡不在画面里）：从后面浮上来。 */
  const rise = (el: HTMLElement) => {
    el.animate(
      [
        { opacity: 0, transform: 'translateY(14px)' },
        { opacity: 1, transform: 'none' },
      ],
      { duration: paced(280), easing: OPEN_EASE },
    );
  };

  /**
   * 总览里的 `id` 那张卡长成打开的大卡。
   * `seen`：路由换过去之前那张小卡露在外面的那一段（滚动区随后会被拉回顶部）；没有就现量。
   */
  const open = (id: string, seen: Box | null = null) => {
    const el = card.value;
    if (!el) return;
    if (turnTo(id, 'open')) return;
    stopCurrent();
    if (reducedMotion()) return;
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
    const layout = (): Box => layoutBox(el, start);
    const frames = () => {
      const box = layout();
      return morphFrames(
        { rect: from, anchor: { x: from.left, y: from.top } },
        { rect: shownRect(box, window.innerHeight), anchor: { x: box.left, y: box.top } },
        box,
        radius,
      );
    };
    const current = begin(id, 'open', OPEN_MS);
    const { flight } = current;
    const main = flight.add(el, frames(), { easing: OPEN_EASE });
    for (const part of [...partsOf(el), ...(fromCover ? headOf(el) : [])]) flight.add(part, BODY_IN);
    if (fromCover) flight.add(el, [{ opacity: 0 }, { opacity: 1, offset: COVER_FADE }, { opacity: 1 }]);
    else flight.cover(source);
    // 卡包往下滚过再点开：路由一换滚动区就被拉回顶部，总览和页头第一帧整体跳一截。让它们从人刚才看到的位置
    // 走到新位置（总览的终点和 .is-receded 的 CSS 一样，放完交还给 CSS）。在同一组里：掉头时一起原路回去。
    const shift = source ? from.top - boxOf(source).top : 0;
    if (Math.abs(shift) > 1 && overview.value) {
      const layer = overview.value;
      flight.add(layer, [{ transform: `translateY(${r2(shift)}px)` }, { transform: `scale(${RECEDE_SCALE})` }], { easing: OPEN_EASE });
      for (const above of aboveDeck()) flight.add(above, [{ transform: `translateY(${r2(shift)}px)` }, { transform: 'none' }], { easing: OPEN_EASE });
      // 掉头落回起点时总览的 CSS 过渡可能还没走完：一并收掉，免得撤补偿那一帧它还在半路。
      flight.own(() => {
        for (const animation of layer.getAnimations()) {
          if (typeof CSSTransition !== 'undefined' && animation instanceof CSSTransition) animation.finish();
        }
      });
    }
    // 卡里的内容晚一点长高（数据回来）：形状还在走时换终点，时间轴不变。
    const resized = typeof ResizeObserver === 'function'
      ? new ResizeObserver(() => {
        if (morph === current && flight.running() && flight.direction === 1) (main.effect as KeyframeEffect | null)?.setKeyframes(frames());
      })
      : null;
    resized?.observe(el);
    flight.own(() => resized?.disconnect());
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

  /**
   * 原地淡出：停在人刚才看到的位置（`lift`），往后沉一点、化开。找不到源卡、源卡不在画面里时用；
   * 长卡滚到很下面再关也用它——卡头远在屏幕上方，缩回源卡要一口气走上千像素：带着卡身飞，满屏表单
   * 边飞边重新栅格化；先把卡身藏掉再飞，就是内容一下没了、剩一块空板滑过去（「高级卡滑到底返回时跳一下」）。
   * 缩放绕屏幕正中那一点（换成卡自己的坐标），不然高卡绕远在屏幕外的顶边缩，看得见的那一段会往上窜。
   */
  const fadeOut = (el: HTMLElement, id: string, closed: () => void, lift: number) => {
    const top = el.getBoundingClientRect().top + lift;
    const origin = `50% ${r2(window.innerHeight / 2 - top)}px`;
    const { flight } = begin(id, 'close', paced(260), closed, false);
    flight.add(el, [
      { opacity: 1, transformOrigin: origin, transform: `translate(0px, ${lift}px)` },
      { opacity: 0, transformOrigin: origin, transform: `translate(0px, ${lift + 12}px) scale(.97)` },
    ], { easing: 'cubic-bezier(.4, 0, .2, 1)' });
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
    if (!el) { stopCurrent(); closed(); return; }
    if (turnTo(id, 'close', closed)) return;
    stopCurrent();
    if (reducedMotion()) { closed(); return; }
    for (const animation of el.getAnimations()) animation.cancel();
    const start = boxOf(el);
    const lift = fromTop === null ? 0 : fromTop - start.top;
    const source = sourceOf(id);
    const target = source ? settledSeenBoxOf(source) : null;
    const onScreen = Boolean(target && target.width >= 24 && target.top < window.innerHeight && target.top + target.height > 0);
    const far = lift < -window.innerHeight * 0.5;
    if (!source || !target || !onScreen) { fadeOut(el, id, closed, lift); return; }
    const toCover = Boolean(source.closest('.cover-stage'));
    const box: Box = { left: start.left, top: start.top, width: el.offsetWidth, height: el.offsetHeight };
    const lifted: Box = { ...box, top: box.top + lift };
    const shown = shownRect(lifted, window.innerHeight);
    // 滚得很远：内容钉在窗口上跟着走（不从上千像素外把卡头拉回来），看得见的那一段就地淡掉。
    const toAnchor = far
      ? { x: target.left, y: target.top + (lifted.top - shown.top) }
      : { x: target.left, y: target.top };
    const frames = morphFrames(
      { rect: shown, anchor: { x: lifted.left, y: lifted.top } },
      { rect: target, anchor: toAnchor },
      box,
      radiusOf(el),
    );
    const { flight } = begin(id, 'close', CLOSE_MS, closed);
    flight.add(el, frames, { easing: BACK_EASE });
    for (const part of [...partsOf(el), ...(toCover || far ? headOf(el) : [])]) flight.add(part, far ? FAR_BODY_OUT : BODY_OUT);
    if (toCover) flight.add(el, COVER_OUT);
    else {
      // 源卡在大卡底下亮起来（大卡一直包着它，看不见），大卡最后整张淡掉。掉头时两段跟着原路倒回去。
      flight.add(source, far ? FAR_SOURCE_IN : SOURCE_IN);
      flight.add(el, far ? FAR_CARD_OUT : CARD_OUT);
    }
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

  /** 正在打开（给了 `id` 就只认这一张）：这时按 Esc / 再点一下是「不开了」，原路掉头。 */
  const opening = (id?: string) => Boolean(morph && morph.flight.running() && kindOf(morph) === 'open' && (!id || morph.id === id));
  /** 正在关上。 */
  const closing = () => Boolean(morph && morph.flight.running() && kindOf(morph) === 'close');
  /** 正在关的那张在 COMPRESS_MS 内收完（又点开了另一张：不硬切，压缩收尾）；返回它下场的时刻。 */
  const compress = (): Promise<void> => {
    const current = morph;
    if (!current || !closing()) return Promise.resolve();
    current.flight.hurry(COMPRESS_MS);
    return current.done;
  };

  /** 切卡、拖拽或按键翻页前立刻收清正在进行的开合形变及旧滑入动画，避免多段 WAAPI 叠加跳变。 */
  const settleNow = () => {
    stopCurrent();
    const el = card.value;
    if (!el) return;
    for (const animation of el.getAnimations()) animation.cancel();
    for (const part of [...partsOf(el), ...headOf(el)]) {
      for (const animation of part.getAnimations()) animation.cancel();
    }
  };

  /** 翻到另一张（点下面的圆点跳过去）时，新内容从跳去的那一侧滑进来（和拖着甩是同一种动作）。 */
  const swap = (direction: -1 | 1 = 1) => {
    settleNow();
    const el = card.value;
    if (!el || reducedMotion()) return;
    el.animate(slideInFrames(direction, el.clientWidth), { duration: SLIDE_IN_MS, easing: SLIDE_IN_EASE });
  };

  onBeforeUnmount(() => {
    stopCurrent();
    dropFlights();
  });

  return { open, close, seenBoxes, snapshot, fly, opening, closing, compress, settleNow, swap };
};
