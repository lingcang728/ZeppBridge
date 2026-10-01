import { onBeforeUnmount, type Ref } from 'vue';
import { COVER_PERSPECTIVE as PERSPECTIVE, coverPoseOf, unscaledBox, type Box } from '../lib/deck/morph';
import { SLIDE_IN_EASE, SLIDE_IN_MS, slideInFrames } from '../lib/deck/physics';
import { revealAfterGhost } from '../lib/motion/ghost';
import { cardReplica, morphWindow, type WindowMorph } from '../lib/motion/window';

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

const OPEN_MS = 340;
const CLOSE_MS = 220;
const OPEN_EASE = 'cubic-bezier(.22, .88, .26, 1)';
const CLOSE_EASE = 'cubic-bezier(.4, 0, .2, 1)';
/** 关卡：窗口收回源卡。和概览页「返回」同一条曲线（先快后慢、没有回弹）。 */
const RETURN_MS = 380;
const RETURN_EASE = 'cubic-bezier(.25, .85, .3, 1)';
/** 展开全部 / 收起：一张张飞出、收拢。 */
const FLIGHT_MS = 420;
const FLIGHT_STAGGER_MS = 14;
const FLIGHT_EASE = 'cubic-bezier(.22, .88, .26, 1)';

const r2 = (value: number) => Number(value.toFixed(2));
const r4 = (value: number) => Number(value.toFixed(4));

/** 换形态前一张卡的样子：画面上的外接框、透明度，以及（coverflow 里的卡）侧转角和不含侧转的宽高。 */
export interface Snapshot {
  box: Box;
  opacity: number;
  rotate: number;
  width: number;
  height: number;
}

const boxOf = (el: Element): Box => {
  const rect = el.getBoundingClientRect();
  return { left: rect.left, top: rect.top, width: rect.width, height: rect.height };
};

/** `plate`：关卡时那块收回源卡的板——它不能倒着放回「打开」，要重开就先取消。 */
type Morph = { animation: Animation; id: string; kind: 'open' | 'close'; closed?: () => void; plate?: boolean };

export const useDeckMorph = ({ overview, card, reducedMotion }: DeckMorphRefs) => {
  let morph: Morph | null = null;
  let ghost: WindowMorph | null = null;
  /** 窗口的全部动画一起倒着放（开到一半关、关到一半开）。 */
  const reverseGhost = () => {
    const running = ghost?.animations().filter((animation) => animation.playState === 'running') ?? [];
    for (const animation of running) animation.reverse();
    return running.length > 0;
  };
  const dropGhost = () => {
    ghost?.remove();
    ghost = null;
  };
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
  /** `seen`：路由换过去之前那张小卡在屏幕上的位置（滚动区随后会被拉回顶部）；没有就现量。 */
  const open = (id: string, seen: Box | null = null) => {
    const el = card.value;
    if (!el || reducedMotion()) return;
    if (morph && morph.id === id && morph.kind === 'close' && !morph.plate && morph.animation.playState === 'running') {
      morph.kind = 'open';
      morph.animation.reverse();
      reverseGhost();
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
    dropGhost();
    const source = sourceOf(id);
    const from = seen ?? (source ? boxOf(source) : null);
    const host = document.getElementById('main-content')?.parentElement;
    if (!from || !host || from.width < 24 || from.height < 24) {
      rise(el);
      return;
    }
    // 窗口从那张小卡长成大卡（ColorOS 那种，见 lib/motion/window.ts）：窗口里先是小卡的拷贝，
    // 跟着放大、淡掉；大卡在后半程从窗口底下浮出，窗口同时淡出——两者交叉，不停一拍。
    const to = visibleBoxOf(el);
    const main = document.getElementById('main-content');
    const frameBox = main ? boxOf(main) : to;
    ghost = morphWindow({
      from,
      to,
      frame: { left: frameBox.left, top: frameBox.top, width: main?.clientWidth ?? frameBox.width, height: main?.clientHeight ?? frameBox.height },
      fromRadius: source ? radiusOf(source) : 24,
      toRadius: radiusOf(el),
      host,
      duration: OPEN_MS,
      easing: OPEN_EASE,
      surface: 'card',
      replica: source ? { ...cardReplica(source), at: 'from' } : null,
    });
    const opened = ghost;
    const animation = el.animate(revealAfterGhost(0.62), { duration: OPEN_MS, fill: 'both' });
    window.setTimeout(() => { if (ghost === opened) opened.release(OPEN_MS * 0.4, true); }, OPEN_MS * 0.62);
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
    if (!el || reducedMotion()) { dropGhost(); closed(); return; }
    // 开到一半就关（Esc、再点一下）：大卡和那块板一起倒着放回源卡，而不是板一下消失。
    if (morph && morph.id === id && morph.kind === 'open' && morph.animation.playState === 'running') {
      morph.kind = 'close';
      morph.closed = closed;
      morph.animation.reverse();
      if (!reverseGhost()) dropGhost();
      return;
    }
    dropGhost();
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
    // 源卡在窗口底下先藏着（coverflow 卡的透明度写在行内样式里，用动画盖住，不去改它）：
    // 窗口落地时里面的拷贝和它严丝合缝，撤掉窗口它原样接上。不再「亮一下」——那段 brightness
    // 滤镜在带玻璃的卡上逐帧重画，正是「收起时卡一下再回去」的那一下。
    const hide = source.animate([{ opacity: 0 }, { opacity: 0 }], { duration: RETURN_MS * 2, fill: 'forwards' });
    const main = document.getElementById('main-content');
    const frameBox = main ? boxOf(main) : from;
    const replica = cardReplica(source);
    // 拷贝按源卡回到原大以后的位置摆（总览此刻正从「退后一层」往回放大）。
    replica.rect = target;
    replica.el.style.width = `${target.width}px`;
    replica.el.style.height = `${target.height}px`;
    const plate = morphWindow({
      from,
      to: target,
      frame: { left: frameBox.left, top: frameBox.top, width: main?.clientWidth ?? frameBox.width, height: main?.clientHeight ?? frameBox.height },
      fromRadius: radiusOf(el),
      toRadius: radiusOf(source),
      host,
      duration: RETURN_MS,
      easing: RETURN_EASE,
      surface: 'card',
      replica: { ...replica, at: 'to' },
      fadeIn: 70,
    });
    ghost = plate;
    let landed = false;
    const land = () => {
      if (landed) return;
      landed = true;
      hide.cancel();
      plate.remove();
      if (ghost === plate) ghost = null;
    };
    void plate.arrived.then(land);
    plate.shape.addEventListener('cancel', land);
    track({ animation: plate.shape, id, kind: 'close', closed, plate: true });
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

  /** 换形态之前记下每张卡此刻在画面上的样子（半路打断时，这就是它们正在飞的样子）。
      coverflow 里的卡还记下它的侧转角和缩放：飞到卡包时从那个侧转「转正」，而不是第一帧就被拍平。 */
  const snapshot = () => {
    const out = new Map<string, Snapshot>();
    for (const el of overview.value?.querySelectorAll<HTMLElement>('[data-deck-card]') ?? []) {
      const id = el.dataset.deckCard;
      if (!id) continue;
      const pose = el.closest('.cover-stage') ? coverPoseOf(el.style.transform) : null;
      out.set(id, {
        box: boxOf(el),
        opacity: Number.parseFloat(getComputedStyle(el).opacity) || 0,
        rotate: pose?.rotate ?? 0,
        // 侧转的卡外接框比卡窄：转正时用卡自己（乘上它的缩放）的宽高，而不是外接框。
        width: el.offsetWidth * (pose?.scale ?? 1),
        height: el.offsetHeight * (pose?.scale ?? 1),
      });
    }
    return out;
  };

  /**
   * coverflow ↔ 卡包：像洗牌一样，每张卡从旧形态里它所在的样子飞到新形态，按 `order`
   * 依次出发（抽出来从正中那张往两边，插回去反过来）。
   *
   * 动的是整条 transform，起点和终点写成**同一串变换函数**（平移、透视、侧转、缩放），浏览器逐个函数插值——
   * 每一帧都在卡自己所在的 3D 空间里算。以前是在卡原有的 3D 变换外面再叠独立的 translate / scale，
   * 它们按 2D 外接框算、却在透视投影之前生效：除了正中那张，每张卡的起点都是歪的，420ms 里再收敛到终点，
   * 看上去就是「乱飞、忽大忽小」（2026-10-01 排查）。
   * 飞行期间按出发顺序管层级（先出发的在上面），落定后交还给形态自己的层级。
   * 全在合成器上（transform / opacity）。返回全部落定的时刻。
   */
  const fly = (before: Map<string, Snapshot>, order: Map<string, number>) => {
    for (const animation of flights) animation.cancel();
    flights = [];
    if (reducedMotion()) return Promise.resolve();
    const total = order.size;
    for (const el of overview.value?.querySelectorAll<HTMLElement>('[data-deck-card]') ?? []) {
      const id = el.dataset.deckCard;
      const from = id ? before.get(id) : undefined;
      if (!id || !from) continue;
      const w = el.offsetWidth || 1;
      const h = el.offsetHeight || 1;
      const layout = layoutCenter(el);
      const fromCenter = { x: from.box.left + from.box.width / 2, y: from.box.top + from.box.height / 2 };
      const opacity = Number.parseFloat(getComputedStyle(el).opacity) || 0;
      const rank = order.get(id) ?? 0;
      const zIndex = String(400 + total - rank);
      const pose = el.closest('.cover-stage') ? coverPoseOf(el.style.transform) : null;
      let keyframes: Keyframe[];
      if (pose) {
        // 飞进 coverflow：终点就是它的姿态；起点用同一串函数，只是不侧转、不往里推，中心和大小对上旧的样子。
        // 姿态里先平移 -50%（卡的左上角钉在舞台中心），所以中心偏移要按布局框换算。
        const x = fromCenter.x - layout.x + w / 2;
        const y = fromCenter.y - layout.y + h / 2;
        keyframes = [
          { transform: `translate3d(calc(-50% + ${r2(x)}px), calc(-50% + ${r2(y)}px), 0px) rotateY(${r2(from.rotate)}deg) scale(${r4(from.width / w)}, ${r4(from.height / h)})`, opacity: Math.min(1, from.opacity + 0.25), zIndex },
          { transform: `translate3d(calc(-50% + ${r2(pose.x)}px), calc(-50% + ${r2(pose.y)}px), ${r2(pose.z)}px) rotateY(${r2(pose.rotate)}deg) scale(${r4(pose.scale)}, ${r4(pose.scale)})`, opacity, zIndex },
        ];
      } else {
        // 飞进卡包（卡自己没有 transform）：从旧的侧转转正。透视写进变换里（卡包没有透视舞台）。
        keyframes = [
          { transform: `translate(${r2(fromCenter.x - layout.x)}px, ${r2(fromCenter.y - layout.y)}px) perspective(${PERSPECTIVE}px) rotateY(${r2(from.rotate)}deg) scale(${r4(from.width / w)}, ${r4(from.height / h)})`, opacity: Math.min(1, from.opacity + 0.25), zIndex },
          { transform: `translate(0px, 0px) perspective(${PERSPECTIVE}px) rotateY(0deg) scale(1, 1)`, opacity, zIndex },
        ];
      }
      flights.push(el.animate(keyframes, { duration: FLIGHT_MS, delay: rank * FLIGHT_STAGGER_MS, easing: FLIGHT_EASE, fill: 'backwards' }));
    }
    return Promise.all(flights.map((animation) => animation.finished.then(() => undefined, () => undefined)))
      .then(() => undefined);
  };

  /** 正在打开（板还在长）：这时按 Esc 是「不开了」，把它倒回去。 */
  const opening = () => Boolean(morph && morph.kind === 'open' && morph.animation.playState === 'running');

  /** 翻到另一张（点下面的圆点跳过去）时，新内容从跳去的那一侧滑进来（和拖着甩是同一种动作）。 */
  const swap = (direction: -1 | 1 = 1) => {
    const el = card.value;
    if (!el || reducedMotion()) return;
    el.animate(slideInFrames(direction, el.clientWidth), { duration: SLIDE_IN_MS, easing: SLIDE_IN_EASE });
  };

  onBeforeUnmount(() => {
    morph?.animation.cancel();
    morph = null;
    dropGhost();
    for (const animation of flights) animation.cancel();
    flights = [];
  });

  return { open, close, snapshot, fly, opening, swap };
};
