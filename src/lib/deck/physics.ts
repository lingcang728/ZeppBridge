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

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

export const DECK_FOLLOW = 0.85;

/** 被拖着的那张卡此刻的样子：跟手位移 + 3D 倾斜 + 轻微放大。不模糊。 */
export function dragFrame(drag: DeckDrag, width: number, _reducedMotion = false): DeckFrame {
  const safeWidth = Math.max(1, width);
  const dx = drag.dx * DECK_FOLLOW;
  // 竖向拖只是翻页的另一种手势，不需要整张卡跟着上下跑太远。
  const dy = clamp(drag.dy * DECK_FOLLOW, -160, 160);
  const progress = Math.min(1, Math.hypot(drag.dx, drag.dy) / 240);
  const r = (value: number) => Number(value.toFixed(2));
  return {
    transform: `perspective(1000px) translate3d(${r(dx)}px, ${r(dy)}px, ${r(progress * 36)}px) `
      + `rotateX(${r(-dy / 26)}deg) rotateY(${r(dx / 65)}deg) rotate(${r((dx / safeWidth) * 4)}deg) `
      + `scale(${r(1 + progress * 0.025)})`,
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

/** 甩出去那张卡的关键帧：整张清晰地飞出画面（不在半路淡掉、也不被某条边截住）。 */
export function flingOutFrames(direction: -1 | 1, width: number, from: string, vertical = false): Keyframe[] {
  const throwX = vertical ? 0 : -direction * (width * 1.25 + 120);
  const throwY = vertical ? -direction * 900 : -30;
  return [
    { transform: from || 'none', opacity: 1 },
    { transform: `translate3d(${throwX}px, ${throwY}px, 0) rotate(${-direction * (vertical ? 0 : 9)}deg) scale(1.02)`, opacity: 1 },
  ];
}

/** 下一张从身后浮上来：由模糊变清晰，带一点回弹。 */
export const RISE_IN_FRAMES: Keyframe[] = [
  { transform: 'translateY(18px) scale(.94)', filter: 'blur(5px)', opacity: 0.5 },
  { transform: 'translateY(-3px) scale(1.012)', filter: 'blur(0px)', opacity: 1, offset: 0.72 },
  { transform: 'none', filter: 'blur(0px)', opacity: 1 },
];
