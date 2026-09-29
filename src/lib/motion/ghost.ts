/**
 * 幽灵板：卡片长成整页 / 大卡时，真正做形变的只是一块空的实色圆角板。
 *
 * 以前是直接对整页（或整张设置大卡）逐帧动 `clip-path`：clip-path 不在合成线程上，
 * 每一帧都要把整页连同图表重新画一遍，4K 屏上风扇狂转、掉帧。现在形变只落在这块
 * 没有子节点的板上（重画的是一块纯色），真实内容只动 opacity / transform，交给合成器。
 *
 * 用法：板先盖住旧画面从卡的位置长到终点，新内容在它后半程淡入，板最后淡出——
 * 看上去仍是「从那张卡里长出来」，代价只剩一块色板。
 */
import { exemptFromSettle } from './interrupt';
export interface GhostRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

export interface GhostOptions {
  /** 起点：那张卡在屏幕上的位置。 */
  from: GhostRect;
  /** 终点：长成的整页可视区 / 大卡。 */
  to: GhostRect;
  fromRadius: number;
  toRadius: number;
  /** 板挂在哪一层（要在顶栏下面，所以挂进应用骨架而不是 body）。 */
  host: HTMLElement;
  duration: number;
  /** 长大那一段的缓动。时间轴本身是线性的，缓动只落在「长大」这一段上。 */
  easing: string;
  /** 板在第几成时间长满、开始淡出（0–1）。新内容应在这之后才淡入。 */
  growUntil?: number;
  zIndex?: number;
}

const r2 = (value: number) => Number(value.toFixed(2));

/** 板默认在六成时间长满：旧画面到这时才被完全盖住，新内容从这里开始淡入。 */
export const GHOST_GROWN_AT = 0.6;

/** 新内容的淡入：板长满之前一直看不见（否则新旧两页叠成重影），长满以后和板的淡出交叉。 */
export const revealAfterGhost = (growUntil = GHOST_GROWN_AT): Keyframe[] => [
  { opacity: 0, transform: 'translateY(8px)' },
  { opacity: 0, transform: 'translateY(8px)', offset: growUntil, easing: 'ease-out' },
  { opacity: 1, transform: 'none' },
];

/** 起点矩形换算成终点板上的 inset 裁切（纯函数，方便测）。 */
export function ghostInset(from: GhostRect, to: GhostRect, radius: number): string {
  const top = Math.max(0, from.top - to.top);
  const left = Math.max(0, from.left - to.left);
  const right = Math.max(0, to.left + to.width - (from.left + from.width));
  const bottom = Math.max(0, to.top + to.height - (from.top + from.height));
  return `inset(${r2(top)}px ${r2(right)}px ${r2(bottom)}px ${r2(left)}px round ${r2(radius)}px)`;
}

/** 建一块还没开始动的幽灵板，铺在终点矩形上。 */
function ghostPlate(to: GhostRect, host: HTMLElement, zIndex = 25): HTMLDivElement {
  const el = document.createElement('div');
  el.setAttribute('aria-hidden', 'true');
  el.className = 'motion-ghost';
  Object.assign(el.style, {
    position: 'fixed',
    left: `${to.left}px`,
    top: `${to.top}px`,
    width: `${to.width}px`,
    height: `${to.height}px`,
    zIndex: String(zIndex),
    pointerEvents: 'none',
    contain: 'strict',
    background: 'var(--mat-card)',
    boxShadow: 'var(--mat-rim)',
  });
  host.appendChild(el);
  return el;
}

export interface HeldGhost {
  /** 板长满（完全盖住旧页）的时刻。 */
  grown: Promise<void>;
  /** 揭开：板淡出后自动移除。可以在长满之前调用，会等长满再淡。 */
  release: (fadeMs?: number) => void;
  /**
   * 撤回：从此刻的形状原路缩回起点那张卡（长大那段倒着放），落定后淡出、移除。
   * 用在「展开到一半按了 Esc」：不进去了，板回到它出来的地方。已经揭开过就什么都不做。
   */
  retract: (fadeMs?: number) => Promise<void>;
}

/**
 * 长满以后停住、等调用方说「可以了」再淡出的幽灵板。
 *
 * 用在「从卡片展开进详情页」：新页首次加载还没完成时，板一直盖着——揭开的就是有内容的
 * 页面，而不是先露骨架屏、数据一到整块换掉（那一下就是「点开闪一下」）。
 */
export function holdGhost(options: Omit<GhostOptions, 'growUntil'>): HeldGhost {
  const { from, to, host } = options;
  const el = ghostPlate(to, host, options.zIndex);
  const full = ghostInset(to, to, options.toRadius);
  // fill: both：倒着放回起点时停在起点的形状上，而不是退回没有裁切的整块板。
  const grow = el.animate(
    [{ clipPath: ghostInset(from, to, options.fromRadius) }, { clipPath: full }],
    { duration: options.duration, easing: options.easing, fill: 'both' },
  );
  const remove = () => el.remove();
  grow.addEventListener('cancel', remove);
  const grown = grow.finished.then(() => undefined, () => undefined);
  let released = false;
  const retract = async (fadeMs = 160) => {
    if (released) return;
    released = true;
    // 板长满以后停住等数据：从终点倒着放；还在长：就地掉头。倒放比长出来稍快一点。
    // 撤回本身就是对 Esc 的回应：紧接着的切页会调 settleMotion，不能再被它快进成一下跳。
    exemptFromSettle(grow);
    grow.updatePlaybackRate(-1.25);
    if (grow.playState !== 'running') grow.play();
    try {
      await grow.finished;
    } catch {
      return;
    }
    const fade = exemptFromSettle(el.animate([{ opacity: 1 }, { opacity: 0 }], { duration: fadeMs, easing: 'ease-out', fill: 'forwards' }));
    await fade.finished.then(remove, remove);
  };
  const release = (fadeMs = 180) => {
    if (released) return;
    released = true;
    void grown.then(() => {
      const fade = el.animate(
        [{ clipPath: full, opacity: 1 }, { clipPath: full, opacity: 0 }],
        { duration: fadeMs, easing: 'ease-out', fill: 'forwards' },
      );
      fade.finished.then(remove, remove);
    });
  };
  return { grown, release, retract };
}

/**
 * 返回：展开的逆过程。板从整页开始、带着逐渐变大的圆角等比收回当初那张卡，落定后淡出，
 * 露出真卡（调用方让真卡亮一下）。
 *
 * 板一出现就在缩：前 `fadeIn` 毫秒里从透明变实，盖住正在淡出的详情页，所以不会有「整屏
 * 卡片色停在那里」的一拍（以前的「返回时黑一下」）；也不再把详情页本身非等比压扁到卡上——
 * 那样缩出来的是一块没有圆角、内容被挤扁截断的灰框。
 */
export function collapseGhost(options: {
  viewport: GhostRect;
  to: GhostRect;
  radius: number;
  /** 起点的圆角（整页是 0；设置里的大卡有自己的圆角）。 */
  fromRadius?: number;
  host: HTMLElement;
  duration: number;
  /** 板从透明变实的时长。 */
  fadeIn: number;
  /** 形状基本落定、板开始淡出（真卡接上）的时刻，占全程的比例。 */
  landAt: number;
  easing: string;
  zIndex?: number;
}): { landed: Promise<void>; done: Animation; plate: HTMLElement } {
  const { viewport, to, host, duration } = options;
  const el = ghostPlate(viewport, host, options.zIndex);
  el.animate(
    [{ clipPath: ghostInset(viewport, viewport, options.fromRadius ?? 0) }, { clipPath: ghostInset(to, viewport, options.radius) }],
    { duration, easing: options.easing, fill: 'both' },
  );
  const done = el.animate(
    [
      { opacity: 0 },
      { opacity: 1, offset: Math.min(options.landAt, options.fadeIn / duration) },
      { opacity: 1, offset: options.landAt, easing: 'ease-in-out' },
      { opacity: 0 },
    ],
    { duration, fill: 'both' },
  );
  const remove = () => el.remove();
  done.finished.then(remove, remove);
  done.addEventListener('cancel', remove);
  const landed = new Promise<void>((resolve) => {
    const timer = window.setTimeout(resolve, duration * options.landAt);
    const finish = () => { window.clearTimeout(timer); resolve(); };
    done.finished.then(finish, finish);
  });
  return { landed, done, plate: el };
}

/** 放一块幽灵板；动画结束（或被取消）时自动移除。返回动画，调用方可 reverse / cancel。 */
export function playGhost(options: GhostOptions): Animation {
  const { from, to, host } = options;
  const el = ghostPlate(to, host, options.zIndex);
  const growUntil = options.growUntil ?? GHOST_GROWN_AT;
  const full = ghostInset(to, to, options.toRadius);
  const animation = el.animate(
    [
      { clipPath: ghostInset(from, to, options.fromRadius), opacity: 1, easing: options.easing },
      { clipPath: full, opacity: 1, offset: growUntil, easing: 'ease-out' },
      { clipPath: full, opacity: 0 },
    ],
    { duration: options.duration, fill: 'both' },
  );
  const remove = () => el.remove();
  animation.finished.then(remove, remove);
  animation.addEventListener('cancel', remove);
  return animation;
}
