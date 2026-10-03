import { cardFrame } from '../deck/morph';
import { exemptFromSettle } from './interrupt';
import { pageBackdrop, WINDOW_OFFSETS, windowPoses, type WindowPose, type WindowRect } from './window';

/**
 * 卡 ↔ 页形变里「动页面」的那一段（composables/usePageMorph.ts 管什么时候动、动完怎么交接，这里管怎么动）。
 */
type Rect = WindowRect;

const rectOf = (el: Element): Rect => {
  const box = el.getBoundingClientRect();
  return { left: box.left, top: box.top, width: box.width, height: box.height };
};

/**
 * 卡和页的内容先后交替，只在交接处叠一小段（线性时间轴）。卡和详情页的排版本来就不一样（字、图都不在同一个地方），
 * 两边同时半透明叠着就是一屏重影——2026-10-03 第二轮用户说的「表面是延伸，字完全不同」。所以：
 * 打开时卡的拷贝先在前 24% 淡掉，页头 16%–42% 接上，页面其余部分 20%–56% 再出来；收回时页面内容前 28% 先走、
 * 页头 24%–48% 淡掉、卡的拷贝 40%–68% 回来。收回的形状走得靠前（40% 的时间已经缩到卡上八成），卡要跟着它一起回来——
 * 以前按 70%–95% 才回来，窗口早早落在卡上，中间一百多毫秒只剩一个页头标题，像一张空卡。落地那一帧就是卡本身。
 */
export const REPLICA_OUT: Keyframe[] = [{ opacity: 1 }, { opacity: 0, offset: 0.24 }, { opacity: 0 }];
export const HEAD_IN: Keyframe[] = [{ opacity: 0 }, { opacity: 0, offset: 0.16 }, { opacity: 1, offset: 0.42 }, { opacity: 1 }];
export const PAGE_BODY_IN: Keyframe[] = [{ opacity: 0 }, { opacity: 0, offset: 0.2 }, { opacity: 1, offset: 0.56 }, { opacity: 1 }];
export const PAGE_BODY_OUT: Keyframe[] = [{ opacity: 1 }, { opacity: 0, offset: 0.28 }, { opacity: 0 }];
export const HEAD_OUT: Keyframe[] = [{ opacity: 1 }, { opacity: 1, offset: 0.24 }, { opacity: 0, offset: 0.48 }, { opacity: 0 }];
export const REPLICA_IN: Keyframe[] = [{ opacity: 0 }, { opacity: 0, offset: 0.4 }, { opacity: 1, offset: 0.68 }, { opacity: 1 }];

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

export interface Flight {
  main: Animation;
  anims: Animation[];
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
  const main = page.animate(frames(), timing);
  const anims = [main];
  if (o.replica) {
    const { el } = o.replica;
    el.dataset.morphLayer = '';
    Object.assign(el.style, { left: '0px', top: '0px', zIndex: '50' });
    page.appendChild(el);
    anims.push(el.animate(o.replicaFade, linear));
  }
  if (head) anims.push(head.animate(o.head, linear));
  const parts = new Map<HTMLElement, Animation>();
  const leavingParts = new WeakSet<HTMLElement>();
  const fadePart = (part: HTMLElement) => {
    const animation = part.animate(o.body, linear);
    animation.currentTime = main.currentTime;
    if (main.playState === 'paused') animation.pause();
    parts.set(part, animation);
    anims.push(animation);
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
        anims.push(part.animate([{ opacity: now }, { opacity: 0 }], { duration: 320, easing: 'ease', fill: 'forwards' }));
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
    retarget: (next) => {
      to = next;
      (main.effect as KeyframeEffect | null)?.setKeyframes(frames());
    },
    dispose,
  };
};
