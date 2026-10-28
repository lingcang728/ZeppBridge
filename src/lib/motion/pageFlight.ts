import { cardFrame } from '../deck/morph';
import { exemptFromSettle } from './interrupt';
import { OPEN_EASE, paced } from './timing';
import { pageBackdrop, visibleWindow, WINDOW_OFFSETS, windowPoses, type WindowPose, type WindowRect } from './window';

/**
 * 卡 ↔ 页形变里「动页面」的那一段（composables/usePageMorph.ts 管什么时候动、动完怎么交接，这里管怎么动）。
 */
type Rect = WindowRect;

const r1 = (value: number) => Number(value.toFixed(1));

const rectOf = (el: Element): Rect => {
  const box = el.getBoundingClientRect();
  return { left: box.left, top: box.top, width: box.width, height: box.height };
};

/**
 * 卡 ↔ 页的分段淡入淡出和背后的模糊，照履历页弹窗（lib/motion/dialogFlight.ts 的 windowOpen / windowClose）抄过来
 * （用户 2026-10-28：「直接照抄履历页卡片的动画，那些动画太好了」）：
 * 打开：卡拷贝前三成淡完，窗口长到四成半以前里面只有一块底板在长，之后页面内容才淡入——不在小框里挤一屏字。
 * 收回：内容前三成淡完，剩底板缩回去；卡拷贝在快落地那一段（四成到八成）亮回来，落地那一帧就是真卡。
 * 文字按线性时间轴先后交替，卡和页的字永远不同时半透明叠着。
 * 被打断时从此刻的透明度接着走（`from`），不先跳回起点。
 */
export const PAGE_WINDOW_MS = paced(480);
export const PAGE_WINDOW_EASE = OPEN_EASE;
/** 起点不是 0：透明度为 0 的层 Chromium 可能不合成，第一帧可见时才去光栅化，又是一跳。 */
const NEARLY_HIDDEN = 0.001;
export const replicaOut = (from = 1): Keyframe[] => [{ opacity: from }, { opacity: 0, offset: 0.3 }, { opacity: 0 }];
export const replicaIn = (from = 0): Keyframe[] => [{ opacity: from }, { opacity: from, offset: 0.4 }, { opacity: 1, offset: 0.8 }, { opacity: 1 }];
export const contentIn = (from = 0): Keyframe[] => [{ opacity: from }, { opacity: from, offset: 0.45 }, { opacity: 1 }];
export const contentOut = (from = 1): Keyframe[] => [{ opacity: from }, { opacity: 0, offset: 0.3 }, { opacity: 0 }];
/** 背后的模糊：开的时候跟着窗口慢慢糊上（前七成）；收的时候前四成几乎不退、落地时才散掉。 */
export const veilIn = (from = 0): { frames: Keyframe[]; options: KeyframeAnimationOptions } => ({
  frames: [{ opacity: Math.max(NEARLY_HIDDEN, from) }, { opacity: 1 }],
  options: { duration: PAGE_WINDOW_MS * 0.7, easing: 'ease-out', fill: 'both' },
});
export const veilOut = (from = 1): { frames: Keyframe[]; options: KeyframeAnimationOptions } => ({
  frames: [{ opacity: from }, { opacity: from * 0.88, offset: 0.4 }, { opacity: 0 }],
  options: { duration: PAGE_WINDOW_MS, easing: 'linear', fill: 'both' },
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

/** 卡在原位藏着（窗口就是从它长出来、落回它身上的）：用一段不参与快进的动画盖住，行内样式不动。 */
export const hide = (el: HTMLElement) =>
  exemptFromSettle(el.animate([{ opacity: 0 }, { opacity: 0 }], { duration: 1, fill: 'forwards' }));

/** 一段窗口形变此刻的样子：被下一次切页打断时，接手的那一段从这里接着走。 */
export interface FlightSnapshot {
  /** 屏幕上看得见的那个框（裁切以后）。 */
  window: Rect;
  /** 页面左上角此刻在屏幕上的位置。 */
  anchor: { x: number; y: number };
  /** 页面内容（以页头为准）和卡拷贝此刻的透明度。 */
  content: number;
  replica: number;
}

export interface Flight {
  main: Animation;
  anims: Animation[];
  snapshot: () => FlightSnapshot;
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
  // 打断由 usePageMorph 自己接手（停住、从此刻接着走），全局的 settleMotion 不能把它快进成一下跳。
  const anims: Animation[] = [];
  const track = (animation: Animation) => { anims.push(exemptFromSettle(animation)); return animation; };
  const main = track(page.animate(frames(), timing));
  if (o.replica) {
    const { el } = o.replica;
    el.dataset.morphLayer = '';
    Object.assign(el.style, { left: `${r1(o.replicaAt?.x ?? 0)}px`, top: `${r1(o.replicaAt?.y ?? 0)}px`, zIndex: '50' });
    page.appendChild(el);
    track(el.animate(o.replicaFade, linear));
  }
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
      return {
        window: visibleWindow(page),
        anchor: { x: box.left, y: box.top },
        content: Number.isFinite(content) ? content : 1,
        replica: Number.isFinite(replica) ? replica : 0,
      };
    },
    retarget: (next) => {
      to = next;
      (main.effect as KeyframeEffect | null)?.setKeyframes(frames());
    },
    dispose,
  };
};
