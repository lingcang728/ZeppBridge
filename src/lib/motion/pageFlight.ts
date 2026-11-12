import { cardFrame } from '../deck/morph';
import { NEARLY_HIDDEN } from './flight';
import { exemptFromSettle } from './interrupt';
import { BACK_EASE, paced } from './timing';
import { pageBackdrop, visibleWindow, WINDOW_OFFSETS, windowPoses, type WindowPose, type WindowRect } from './window';

/**
 * 卡 ↔ 页形变里「动页面」的那一段（composables/usePageMorph.ts 管什么时候动、动完怎么交接，这里管怎么动）。
 */
type Rect = WindowRect;

const r1 = (value: number) => Number(value.toFixed(1));
const r4 = (value: number) => Number(value.toFixed(4));

const rectOf = (el: Element): Rect => {
  const box = el.getBoundingClientRect();
  return { left: box.left, top: box.top, width: box.width, height: box.height };
};

/**
 * 卡 ↔ 页的分段淡入淡出和背后的模糊：
 * 打开：窗口刚开始长（OPEN_AT）卡拷贝就和页面内容交接（一段很短的交叉，前七成拷贝退、后七成内容进，
 * 中间任何一帧都至少有一样看得见）——内容在起飞前已经画好，窗口长大的一路上里面都是真页面。
 * 收回：页面内容留着跟窗口一起缩，板快缩到卡那么大（HANDOFF_BACK）时才交给卡拷贝，落地那一帧就是真卡。
 * 底板从卡色过渡到页面底色（plateIn / plateOut，见 window.ts 的 pageBackdrop）。
 * 被打断时从此刻的透明度接着走（`from`），不先跳回起点。
 */
/*
 * 2026-11-12 第二轮（用户录屏：「每次都会重绘，动画也很快，闪来闪去的不够优雅」）：
 * - 时长 480 → 540（×PACE）。曲线换成**缓起**的：旧曲线（OPEN_EASE）一上来就是全速，头 150ms 走掉一半；新页第一次上屏那一两帧
 *   只要慢一点，放出来的第一帧窗口已经长到三四成——看上去就是「啪」一下一块大板。缓起以后头 60ms 只走 5%，
 *   起步那几帧掉了也看不出跳，后半程照旧长长地减速落定、不回弹。
 * - 交接提前（OPEN_AT）：页面内容在起飞前就画好了（composables/pageMorph/expand.ts 先停在起点等第一帧），
 *   窗口刚开始长就换手，长到四成时窗口里已经是整页的内容（连图表）。以前等到 28% 才开始换，那时窗口已经长了六成，
 *   卡拷贝缩在左上角、其余是一块空板，接着内容蹦出来、图表落地后又蹦一次。
 */
/* 2026-11-12 第四轮（用户：「可以把动画速度放慢一点，但务必连贯」）：540 → 600（×PACE），曲线回到第二轮那条缓起的。
   OPEN_EASE 头 100ms 就走掉四成，录屏里运动详情展开实际是 60 帧，但每帧跨得太大，看上去像二十帧。 */
export const PAGE_WINDOW_MS = paced(600);
export const PAGE_WINDOW_EASE = 'cubic-bezier(.3, .1, .15, 1)';
/** 交接的两半：卡和页的内容不一样，**先后交替**（先走的那样先退、后来的那样后进，只在最淡的那一小段挨着），
    不是两边同时半透明叠成重影（用户 2026-10-03）；交接时窗口只比卡大一点，中间露出来的是卡色的底板。 */
const OUT_PART = 0.55;
const IN_FROM = 0.45;
/** 卡 → 页：换手从这个进度开始、占这么长（线性时间）。 */
const OPEN_AT = 0.04;
const OPEN_SPAN = 0.2;
/*
 * 页 → 卡（2026-11-12 第三轮，用户 4K 录屏：「收回到最后一刻会像截图一样定格卡一下，再变回原样」）：
 * 以前收回和展开用同一条前冲的曲线（OPEN_EASE 在线性 0.5 已走完 89%），后四成时间窗口几乎不动，
 * 换手（0.64–0.78）就落在这段「停住」里——画面上是：缩到卡上、定住、内容一下换成卡、模糊最后一帧才撤。
 * 现在收回单独一条不那么前冲的曲线（PAGE_BACK_EASE），并且落地是**一段淡入淡出**而不是一帧交接：
 * 1. 窗口还在明显地缩（线性 0.40–0.62，走过 65%→89%）时页面内容和卡拷贝换手；
 * 2. 0.58–0.80 来处页上那张真卡在窗口底下亮起来（窗口始终包着它，看不见），背后的模糊同时散完；
 * 3. 0.80–1.00 整个窗口（此刻就是卡拷贝，和真卡逐像素一样）淡掉，露出底下早已亮好的真卡。
 * 任何一帧画面上都是「窗口 ∪ 真卡」，两者重合的部分是同一张卡，所以既没有定格、也没有最后一帧的跳。
 */
export const PAGE_BACK_EASE = BACK_EASE;
/*
 * 2026-11-12 第四轮（用户 4K 录屏：「最后总会闪一下……能否让它随着收回的过程，逐步完整形变成最终的首页卡片」）：
 * 第三轮的换手是「页面内容先淡没、卡拷贝再淡出来」——两样排版完全不同，中间有一段两边都淡着，录屏里就是
 * 亮 → 暗 → 换成卡 → 亮，像闪了一下。现在收回是**容器形变**：页面内容和卡拷贝都跟着窗口一起缩放
 * （宽度始终等于窗口宽，左上角钉在窗口左上角），两层几何上对得齐，拷贝从一开始就叠在内容上面慢慢变实——
 * 画面上是整页缩成卡、内容逐渐变成卡上的内容，没有哪一帧是两边都淡着的。缩放只动 transform，走合成器。
 * 时长也放慢一点（用户：「可以把动画速度放慢一点」）。
 */
export const PAGE_BACK_MS = PAGE_WINDOW_MS;
const BACK_AT = 0.4;
const BACK_SPAN = 0.22;
/** 真卡在窗口底下亮起来的那一段，和窗口整个淡掉的那一段（线性时间）。 */
const CARD_IN_AT = 0.58;
const CARD_IN_END = 0.8;
const WINDOW_OUT_AT = 0.8;
const keep = (from: number, at: number, to: number, end: number): Keyframe[] => [
  { opacity: from }, { opacity: from, offset: at }, { opacity: to, offset: Math.min(1, end) }, { opacity: to },
];
export const replicaOut = (from = 1): Keyframe[] => keep(from, OPEN_AT, 0, OPEN_AT + OPEN_SPAN * OUT_PART);
export const contentIn = (from = 0): Keyframe[] => keep(Math.max(NEARLY_HIDDEN, from), OPEN_AT + OPEN_SPAN * IN_FROM, 1, OPEN_AT + OPEN_SPAN);
export const contentOut = (from = 1): Keyframe[] => keep(from, BACK_AT, 0, BACK_AT + BACK_SPAN * OUT_PART);
export const replicaIn = (from = 0): Keyframe[] => keep(Math.max(NEARLY_HIDDEN, from), BACK_AT + BACK_SPAN * IN_FROM, 1, BACK_AT + BACK_SPAN);
/** 容器形变的换手（线性时间）：拷贝叠在内容上面先变实，内容随后才淡掉——拷贝盖住的那块里一直是实的。 */
const MORPH_REPLICA = [0.1, 0.46] as const;
const MORPH_CONTENT = [0.18, 0.56] as const;
export const contentMorphOut = (from = 1): Keyframe[] => keep(from, MORPH_CONTENT[0], 0, MORPH_CONTENT[1]);
export const replicaMorphIn = (from = 0): Keyframe[] => keep(Math.max(NEARLY_HIDDEN, from), MORPH_REPLICA[0], 1, MORPH_REPLICA[1]);
/** 开到一半就返回、窗口里两样都还淡着：卡拷贝立刻亮回来，窗口里一直是那张卡，不留一段空板。 */
export const replicaBack = (from = 0): Keyframe[] => [{ opacity: from }, { opacity: 1, offset: 0.25 }, { opacity: 1 }];
/** 底板上层（页面底色）：开的时候跟着窗口长成整页盖上来，收的时候在换手结束前平滑退成卡色。 */
export const plateIn = (from = 0): Keyframe[] => [{ opacity: Math.max(NEARLY_HIDDEN, from) }, { opacity: Math.max(NEARLY_HIDDEN, from), offset: 0.2 }, { opacity: 1, offset: 0.8 }, { opacity: 1 }];
export const plateOut = (from = 1): Keyframe[] => [{ opacity: from }, { opacity: from, offset: 0.2 }, { opacity: NEARLY_HIDDEN, offset: BACK_AT + BACK_SPAN }, { opacity: NEARLY_HIDDEN }];
/** 收回的最后一段：整个窗口淡掉（真卡已经在它底下亮好了）。 */
export const windowOut = (from = 1): Keyframe[] => keep(from, WINDOW_OUT_AT, 0, 1);
/** 掉头重新展开：窗口从此刻的透明度很快亮回来。 */
export const windowBack = (from = 1): Keyframe[] => [{ opacity: Math.max(NEARLY_HIDDEN, from) }, { opacity: 1, offset: 0.2 }, { opacity: 1 }];
/** 来处页上的那张真卡：收回时在窗口底下提前亮起来（窗口完全包着它，亮的过程看不见）。 */
export const cardIn = (): Keyframe[] => keep(0, CARD_IN_AT, 1, CARD_IN_END);
/** 背后的模糊：开的时候跟着窗口慢慢糊上（前七成）；收的时候和真卡亮起来同一刻散完——窗口淡掉时露出来的是清楚的卡。 */
export const veilIn = (from = 0, duration = PAGE_WINDOW_MS): { frames: Keyframe[]; options: KeyframeAnimationOptions } => ({
  frames: [{ opacity: Math.max(NEARLY_HIDDEN, from) }, { opacity: 1 }],
  options: { duration: duration * 0.7, easing: 'ease-out', fill: 'both' },
});
export const veilOut = (from = 1, duration = PAGE_WINDOW_MS): { frames: Keyframe[]; options: KeyframeAnimationOptions } => ({
  frames: [{ opacity: from }, { opacity: from * 0.85, offset: 0.3 }, { opacity: 0, offset: CARD_IN_END }, { opacity: 0 }],
  options: { duration, easing: 'linear', fill: 'both' },
});

/**
 * 蒙在来处页上的那层模糊（样式见 shell.css 的 .page-veil，和弹窗遮罩同一组值）：静态的模糊，只动这一层的透明度。
 * 它是来处页自己的子元素（层次最高）：页面是 KeepAlive 缓存的，挂在它身上就跟着它进出文档；要是挂到页面外面，
 * 层次会压到正在长的窗口上面。来处页临时 isolation: isolate，页面里 z-index 高的块（吸顶的条）不会穿出来。
 */
export const pageVeil = (under: HTMLElement, viewport: Rect): HTMLElement => {
  const veil = document.createElement('div');
  veil.className = 'page-veil';
  veil.setAttribute('aria-hidden', 'true');
  veil.dataset.morphLayer = '';
  if (getComputedStyle(under).position === 'static') under.style.position = 'relative';
  under.style.isolation = 'isolate';
  under.appendChild(veil);
  const box = under.getBoundingClientRect();
  Object.assign(veil.style, {
    left: `${r1(viewport.left - box.left - under.clientLeft)}px`,
    top: `${r1(viewport.top - box.top - under.clientTop)}px`,
    width: `${r1(viewport.width)}px`,
    height: `${r1(viewport.height)}px`,
  });
  return veil;
};
/** 撤掉模糊层，来处页的临时样式还原。 */
export const removeVeil = (under: HTMLElement | null, veil: HTMLElement | null) => {
  veil?.getAnimations().forEach((animation) => animation.cancel());
  veil?.remove();
  if (!under) return;
  under.style.isolation = '';
  under.style.position = '';
};

const opacityOf = (el: Element | null | undefined) => (el ? Number.parseFloat(getComputedStyle(el).opacity) : Number.NaN);

/** 页面的「卡头」（页头）和其余部分。没有页头的页（运动详情）拿第一块当卡头，免得中间有一段什么都没有。 */
export const partsOf = (page: HTMLElement) => {
  const children = [...page.children]
    .filter((child): child is HTMLElement => child instanceof HTMLElement && !child.hasAttribute('data-morph-layer'));
  const head = children.find((child) => child.matches('.page-header-wrap, .page-header, .page-heading')) ?? children[0] ?? null;
  return { head, body: children.filter((child) => child !== head) };
};

/**
 * 起飞前把两页里正在放的 CSS 过渡直接放完（2026-11-12 第四轮）：形变一开始动着的页就不接指针（shell.css 的
 * html[data-motion]），刚才悬停着的那一行 / 那张卡随即放一段「退回」的底色、位移过渡——这一小段每帧都要重画，
 * 而页面一重画就得整页重新分层（4K 下每帧 14–18ms），收回从头到尾掉到三四十帧。getAnimations 顺带把样式刷新到此刻，
 * 指针换了以后才开始的那段也拿得到。
 */
export const settleTransitions = (...roots: Array<Element | null | undefined>) => {
  for (const root of roots) {
    if (!root?.isConnected) continue;
    for (const animation of root.getAnimations({ subtree: true })) {
      if (animation instanceof CSSTransition) animation.finish();
    }
  }
};

/** 卡在原位藏着（窗口就是从它长出来、落回它身上的）：用一段不参与快进的动画盖住，行内样式不动。 */
export const hide = (el: HTMLElement) =>
  exemptFromSettle(el.animate([{ opacity: 0 }, { opacity: 0 }], { duration: 1, fill: 'forwards' }));

/** 一段窗口形变此刻的样子：被下一次切页打断时，接手的那一段从这里接着走。 */
export interface FlightSnapshot {
  /** 屏幕上看得见的那个框（裁切以后）。 */
  window: Rect;
  /** 页面左上角此刻在屏幕上的位置。 */
  anchor: { x: number; y: number };
  /** 页面内容（以页头为准）、卡拷贝、底板上层此刻的透明度。 */
  content: number;
  replica: number;
  plate: number;
  /** 整个窗口（页面元素自己）此刻的透明度：收回最后一段在淡掉。 */
  page: number;
}

export interface Flight {
  main: Animation;
  anims: Animation[];
  snapshot: () => FlightSnapshot;
  /** 此刻画面上的框和锚点，按形变开始时的版面算（页面随后被 Vue 挪了位置也不受影响）：掉头接力用。 */
  pose: () => WindowPose;
  /** 整组掉头（合成器上原路往回走，不等主线程）。 */
  turn: () => void;
  /** 终点换成另一个位置（收回时真卡晚一点才找到）：时间轴不变。 */
  retarget: (to: WindowPose) => void;
  /** 撤掉全部动画、垫底和卡拷贝，页面回到它自己的样子。 */
  dispose: () => void;
}

/** 垫在页面底下的底（lib/motion/window.ts 的 pageBackdrop）：可视区、应用骨架都按此刻量。 */
export const backdropFor = (page: HTMLElement, viewport: Rect, host: HTMLElement, radius: number) =>
  pageBackdrop(page, rectOf(page), viewport, rectOf(host), radius);

/**
 * 一段窗口形变：**只有页面这一个元素在动**（translate + 定圆角的 clip-path，lib/motion/window.ts 的 windowPoses），
 * 垫底和卡拷贝都是它的子元素，吃同一道裁切——一道合成器动画，三样东西逐帧严丝合缝。卡拷贝放在页面左上角，
 * 页面的左上角正是锚点（打开时从卡的左上角出发、收回时落到卡的左上角），所以拷贝自然跟着走。
 * 页头、其余部分和拷贝的透明度按线性时间轴分段走。
 */
export const fly = (o: {
  page: HTMLElement;
  backdrop: HTMLElement;
  radius: number;
  from: WindowPose;
  to: WindowPose;
  duration: number;
  easing: string;
  replica: { el: HTMLElement; rect: Rect } | null;
  /** 卡拷贝在页面里的位置（页面坐标）。默认左上角（锚点就是页面左上角）；定位到某张卡时是那张卡的位置，
      滚下去再返回时是此刻看得见的那一段的顶上——拷贝和锚点一起走，落在卡上。 */
  replicaAt?: { x: number; y: number };
  /** 和页头一起早一点出来 / 晚一点走的那一块（定位的那张卡所在的块；滚下去时看得见的那几块）。 */
  early?: (part: HTMLElement) => boolean;
  replicaFade: Keyframe[];
  head: Keyframe[];
  body: Keyframe[];
  /** 底板上层（页面底色）的透明度。 */
  plate: Keyframe[];
  /** 整个窗口（页面元素自己）的透明度：收回最后一段淡掉，掉头时亮回来。不给就一直是 1。 */
  fade?: Keyframe[];
  /** 容器形变：页面内容和卡拷贝跟着窗口一起缩放（宽度始终等于窗口宽，左上角钉在窗口左上角）。收回用。 */
  scale?: boolean;
}): Flight => {
  const { page } = o;
  const start = rectOf(page);
  let box: Rect = { left: start.left, top: start.top, width: page.offsetWidth, height: page.offsetHeight };
  let to = o.to;
  const timing: KeyframeAnimationOptions = { duration: o.duration, easing: o.easing, fill: 'both' };
  const linear: KeyframeAnimationOptions = { duration: o.duration, easing: 'linear', fill: 'both' };
  const frames = () => windowPoses(o.from, to).map((pose, index) => ({ ...cardFrame(pose, box, o.radius), offset: WINDOW_OFFSETS[index] }));
  // 页面平时横向是 clip 的（.page 的 overflow-x）：垫底要伸出页面两侧一点，形变期间放开（外面有 clip-path 裁着）。
  const overflowX = page.style.overflowX;
  page.style.overflowX = 'visible';
  const { head, body } = partsOf(page);
  // 打断由 usePageMorph 自己接手（从此刻掉头接着走），全局的 settleMotion 不能把它快进成一下跳。
  const anims: Animation[] = [];
  const track = (animation: Animation) => { anims.push(exemptFromSettle(animation)); return animation; };
  const main = track(page.animate(frames(), timing));
  if (o.fade) track(page.animate(o.fade, linear));
  if (o.replica) {
    const { el } = o.replica;
    el.dataset.morphLayer = '';
    Object.assign(el.style, { left: `${r1(o.replicaAt?.x ?? 0)}px`, top: `${r1(o.replicaAt?.y ?? 0)}px`, zIndex: '50' });
    page.appendChild(el);
    track(el.animate(o.replicaFade, linear));
  }
  const plate = o.backdrop.firstElementChild;
  if (plate instanceof HTMLElement) track(plate.animate(o.plate, linear));
  if (head) track(head.animate(o.head, linear));
  const parts = new Map<HTMLElement, Animation>();
  const leavingParts = new WeakSet<HTMLElement>();
  const fadePart = (part: HTMLElement) => {
    const animation = track(part.animate(o.early?.(part) ? o.head : o.body, linear));
    animation.currentTime = main.currentTime;
    if (main.playState === 'paused') animation.pause();
    parts.set(part, animation);
  };
  for (const part of body) fadePart(part);

  /* 容器形变：每块内容绕「窗口左上角」（页面坐标）缩放，拷贝绕自己的左上角缩放；关键帧和窗口同一组进度、同一条曲线，
     逐帧对得上。终点换了（retarget）就跟着重算。 */
  const scaled: Array<{ animation: Animation; frames: () => Keyframe[] }> = [];
  if (o.scale) {
    const widths = () => windowPoses(o.from, to).map((pose) => pose.rect.width);
    const pin = { x: o.to.rect.left - o.to.anchor.x, y: o.to.rect.top - o.to.anchor.y };
    const base = Math.max(1, o.from.rect.width);
    const scaleFrames = (of: number, origin: string) => () =>
      widths().map((width, index) => ({ transform: `scale(${r4(width / of)})`, transformOrigin: origin, offset: WINDOW_OFFSETS[index] }));
    for (const part of [head, ...body]) {
      if (!part) continue;
      const box = rectOf(part);
      const origin = `${r1(start.left + pin.x - box.left)}px ${r1(start.top + pin.y - box.top)}px`;
      const frames = scaleFrames(base, origin);
      scaled.push({ animation: track(part.animate(frames(), timing)), frames });
    }
    if (o.replica) {
      const frames = scaleFrames(Math.max(1, o.replica.rect.width), '0 0');
      scaled.push({ animation: track(o.replica.el.animate(frames(), timing)), frames });
    }
  }

  // 新页的内容晚一点长高（数据回来、骨架换成内容）：裁切的底边是相对页面算的，跟着换，时间轴不变。
  const resized = typeof ResizeObserver === 'function'
    ? new ResizeObserver(() => {
      if (disposed || main.playState === 'finished') return;
      box = { ...box, width: page.offsetWidth, height: page.offsetHeight };
      (main.effect as KeyframeEffect | null)?.setKeyframes(frames());
    })
    : null;
  resized?.observe(page);
  // 骨架在形变途中换成了内容：新出来的块接着按同一段淡入走，不是一下全亮；正在离场的骨架
  // （shell.css 的 skeleton-out）从此刻的透明度淡掉——这里的淡入盖着它自己那条 CSS 淡出。
  const added = typeof MutationObserver === 'function'
    ? new MutationObserver((records) => {
      if (disposed || main.playState === 'finished') return;
      for (const record of records) {
        for (const node of record.addedNodes) {
          if (node instanceof HTMLElement && node !== head && !parts.has(node) && !node.hasAttribute('data-morph-layer')) fadePart(node);
        }
      }
      for (const [part, animation] of parts) {
        if (leavingParts.has(part) || !/-leave-active(\s|$)/.test(part.className)) continue;
        leavingParts.add(part);
        const now = Number.parseFloat(getComputedStyle(part).opacity) || 0;
        animation.cancel();
        track(part.animate([{ opacity: now }, { opacity: 0 }], { duration: 320, easing: 'ease', fill: 'forwards' }));
      }
    })
    : null;
  added?.observe(page, { childList: true });

  let disposed = false;
  const dispose = () => {
    if (disposed) return;
    disposed = true;
    resized?.disconnect();
    added?.disconnect();
    for (const animation of anims) animation.cancel();
    o.backdrop.remove();
    o.replica?.el.remove();
    page.style.overflowX = overflowX;
  };
  return {
    main,
    anims,
    snapshot: () => {
      const box = page.getBoundingClientRect();
      const content = opacityOf(head);
      const replica = opacityOf(o.replica?.el);
      const plateNow = opacityOf(plate);
      const pageNow = opacityOf(page);
      return {
        window: visibleWindow(page),
        anchor: { x: box.left, y: box.top },
        content: Number.isFinite(content) ? content : 1,
        replica: Number.isFinite(replica) ? replica : 0,
        plate: Number.isFinite(plateNow) ? plateNow : 1,
        page: Number.isFinite(pageNow) ? pageNow : 1,
      };
    },
    pose: () => {
      const style = getComputedStyle(page);
      const matrix = style.transform && style.transform !== 'none' ? new DOMMatrixReadOnly(style.transform) : null;
      const anchor = { x: box.left + (matrix?.e ?? 0), y: box.top + (matrix?.f ?? 0) };
      const clip = style.clipPath.match(/^inset\((.*?)(?: round|\))/);
      const edges = clip?.[1].trim().split(/\s+/).map(Number.parseFloat) ?? [];
      const [top = 0, right = top, bottom = top, left = right] = edges.every(Number.isFinite) ? edges : [];
      return {
        anchor,
        rect: { left: anchor.x + left, top: anchor.y + top, width: Math.max(1, box.width - left - right), height: Math.max(1, box.height - top - bottom) },
      };
    },
    turn: () => {
      for (const animation of anims) {
        const rate = -(animation.playbackRate || 1);
        if (typeof animation.updatePlaybackRate === 'function') animation.updatePlaybackRate(rate);
        else animation.playbackRate = rate;
      }
    },
    retarget: (next) => {
      to = next;
      (main.effect as KeyframeEffect | null)?.setKeyframes(frames());
      for (const { animation, frames: of } of scaled) (animation.effect as KeyframeEffect | null)?.setKeyframes(of());
    },
    dispose,
  };
};
