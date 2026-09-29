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
  const grow = el.animate(
    [{ clipPath: ghostInset(from, to, options.fromRadius) }, { clipPath: full }],
    { duration: options.duration, easing: options.easing, fill: 'forwards' },
  );
  const remove = () => el.remove();
  grow.addEventListener('cancel', remove);
  const grown = grow.finished.then(() => undefined, () => undefined);
  let released = false;
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
  return { grown, release };
}

export interface CollapsingGhost {
  /** 板铺满、盖住正在离场的页面的时刻。 */
  covered: Promise<void>;
  /** 缩回到这张卡的位置，再淡出露出真卡。`to` 为空时（找不到那张卡）原地淡出。 */
  shrinkTo: (to: GhostRect | null, radius: number) => Promise<void>;
}

/**
 * 返回时反着来：板先在整页上浮现盖住详情页，再从四周均匀缩回当初那张卡，最后淡出——
 * 淡出后露出来的就是那张真卡。缩的这一段用「先快后慢」的减速，像被卡片吸回去。
 */
export function collapseGhost(options: {
  viewport: GhostRect;
  host: HTMLElement;
  coverMs: number;
  shrinkMs: number;
  easing: string;
  zIndex?: number;
}): CollapsingGhost {
  const { viewport, host } = options;
  const el = ghostPlate(viewport, host, options.zIndex);
  const full = ghostInset(viewport, viewport, 0);
  const cover = el.animate(
    [{ clipPath: full, opacity: 0 }, { clipPath: full, opacity: 1 }],
    { duration: options.coverMs, easing: 'ease-out', fill: 'forwards' },
  );
  const remove = () => el.remove();
  const covered = cover.finished.then(() => undefined, () => undefined);
  const shrinkTo = async (to: GhostRect | null, radius: number) => {
    await covered;
    if (!to) {
      const fade = el.animate([{ clipPath: full, opacity: 1 }, { clipPath: full, opacity: 0 }], { duration: 180, fill: 'forwards' });
      await fade.finished.catch(() => undefined);
      remove();
      return;
    }
    const target = ghostInset(to, viewport, radius);
    const shrink = el.animate(
      [{ clipPath: full, opacity: 1 }, { clipPath: target, opacity: 1 }],
      { duration: options.shrinkMs, easing: options.easing, fill: 'forwards' },
    );
    await shrink.finished.catch(() => undefined);
    const fade = el.animate([{ clipPath: target, opacity: 1 }, { clipPath: target, opacity: 0 }], { duration: 140, fill: 'forwards' });
    await fade.finished.catch(() => undefined);
    remove();
  };
  return { covered, shrinkTo };
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
