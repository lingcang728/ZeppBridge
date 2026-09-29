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

/** 放一块幽灵板；动画结束（或被取消）时自动移除。返回动画，调用方可 reverse / cancel。 */
export function playGhost(options: GhostOptions): Animation {
  const { from, to, host } = options;
  const el = document.createElement('div');
  el.setAttribute('aria-hidden', 'true');
  el.className = 'motion-ghost';
  Object.assign(el.style, {
    position: 'fixed',
    left: `${to.left}px`,
    top: `${to.top}px`,
    width: `${to.width}px`,
    height: `${to.height}px`,
    zIndex: String(options.zIndex ?? 25),
    pointerEvents: 'none',
    contain: 'strict',
    background: 'var(--mat-card)',
    boxShadow: 'var(--mat-rim)',
  });
  host.appendChild(el);
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
