/**
 * 设置卡叠的手势物理。纯函数，方便测：拖动 → 变换、松手时判定翻不翻、往哪翻。
 *
 * 跟手 0.85 倍、不设硬边界（拖到哪卡就在哪，不会在某个位置被一刀截住）；拖过
 * min(110px, 宽度 18%) 或者快速一甩（松手前 100ms 内速度 > 0.5px/ms 且移动 > 25px）
 * 才翻页，否则弹回。被拖的卡始终清晰——模糊的是它身后那一层，不是手里这张。
 */

export interface DeckDrag {
  dx: number;
  dy: number;
}

export interface DeckFrame {
  transform: string;
  filter: string;
  /** 0 → 1：拖得越远越接近 1，用来驱动身后压底卡的视差。 */
  progress: number;
  dx: number;
  dy: number;
}

export const DECK_FOLLOW = 0.85;

/** 被拖着的那张卡此刻的样子：跟手位移 + 一点平面旋转。不模糊、不做 3D、不放大——
 *  满是字的大卡一旦 perspective / rotateX / scale，字每帧重新栅格化，边缘出一圈黑线、
 *  字一闪一闪的；平面位移和旋转只是合成。 */
export function dragFrame(drag: DeckDrag, width: number, _reducedMotion = false): DeckFrame {
  const safeWidth = Math.max(1, width);
  const dx = drag.dx * DECK_FOLLOW;
  // 竖向和横向一样不设边界：拖到哪卡就在哪。以前竖向卡在 ±160px，拖过去卡片被一刀
  // 截住不动了，手却还在走。
  const dy = drag.dy * DECK_FOLLOW;
  const progress = Math.min(1, Math.hypot(drag.dx, drag.dy) / 240);
  const r = (value: number) => Number(value.toFixed(2));
  return {
    transform: `translate3d(${r(dx)}px, ${r(dy)}px, 0px) rotate(${r((dx / safeWidth) * 4)}deg)`,
    filter: 'none',
    progress: r(progress),
    dx: r(dx),
    dy: r(dy),
  };
}

export interface DeckRelease extends DeckDrag {
  /** 松手前最后一段的速度，px/ms。 */
  velocity: number;
  /** 距离最后一次 pointermove 过了多少毫秒。 */
  sinceLastMove: number;
  width: number;
}

/** 松手时往哪翻：1 = 下一张，-1 = 上一张，0 = 弹回原位。横向优先看 dx，纵向拖看 dy。 */
export function releaseDirection(release: DeckRelease): -1 | 0 | 1 {
  const distance = Math.hypot(release.dx, release.dy);
  const flick = release.sinceLastMove < 100 && Math.abs(release.velocity) > 0.5 && distance > 25;
  const threshold = Math.min(110, release.width * 0.18);
  if (distance < threshold && !flick) return 0;
  const vertical = Math.abs(release.dy) > Math.abs(release.dx);
  const axis = vertical ? release.dy : release.dx;
  if (axis === 0) return 0;
  // 往左 / 往上甩 = 看下一张（像把最上面那张扔走）；往右 / 往下 = 回上一张。
  return axis < 0 ? 1 : -1;
}

/** 循环翻页：最后一张之后回到第一张。 */
export function wrapIndex(index: number, length: number): number {
  if (length <= 0) return 0;
  return ((index % length) + length) % length;
}

/** 甩出去那张卡的关键帧：整张飞出画面，一路渐渐融进背景（飞到窗口边上不是被一刀截断）。
    起点不写透明度，接着拖动时已经变淡的那个值往下走。 */
export function flingOutFrames(direction: -1 | 1, width: number, from: string, vertical = false): Keyframe[] {
  const throwX = vertical ? 0 : -direction * (width * 1.25 + 120);
  const throwY = vertical ? -direction * 900 : -30;
  return [
    { transform: from || 'none' },
    { transform: `translate3d(${throwX}px, ${throwY}px, 0) rotate(${-direction * (vertical ? 0 : 9)}deg)`, opacity: 0.15 },
  ];
}

/** 下一张从身后浮上来：淡入 + 上浮。不加模糊（整张大卡逐帧模糊是甩卡卡顿的一大头）。 */
export const RISE_IN_FRAMES: Keyframe[] = [
  { transform: 'translateY(16px)', opacity: 0 },
  { transform: 'none', opacity: 1 },
];

/** 下一张从另一侧滑进来（接着甩出去的方向，像一叠卡被推着走），先快后慢地停住。
 *  以前是从下方 16px 淡入，和「往左甩」的方向对不上，看上去是换了一张硬切进来的卡。
 *  竖着甩的就从上 / 下进来。只动 transform / opacity。 */
export function slideInFrames(direction: -1 | 1, width: number, vertical = false): Keyframe[] {
  const shift = Math.min(360, Math.max(120, width * 0.36));
  const from = vertical
    ? `translate3d(0px, ${direction * 140}px, 0px)`
    : `translate3d(${Math.round(direction * shift)}px, 0px, 0px) rotate(${direction * 2.5}deg)`;
  return [
    { transform: from, opacity: 0 },
    { transform: 'none', opacity: 1 },
  ];
}
/** 滑进来的曲线和时长（和页面展开同一族：先快后慢、不回弹）。 */
export const SLIDE_IN_MS = 460;
export const SLIDE_IN_EASE = 'cubic-bezier(.22, .88, .26, 1)';
