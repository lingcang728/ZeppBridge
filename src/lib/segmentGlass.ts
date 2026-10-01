/**
 * 胶囊选择器（SegmentTrack）上那块玻璃的几何：浮起来的透镜摆在哪、多大，拖过两端时整条胶囊被拉长多少，
 * 甩出去时整条胶囊形变多少。纯函数，组件只管把结果写进样式。
 *
 * 2026-10-01 反馈（第五版）：
 * - 透镜以前按「浮起那一刻的滑块宽 × 1.28」定尺寸、浮着的时候不变：从「交给 AI」拖到「设置」，玻璃还是
 *   「交给 AI」那么大，停到最后一项时被两端收住、字也不在正中。现在透镜跟着滑块（也就是底下那一项的宽度）走，
 *   两边各多出固定的几像素，不再按比例放大。
 * - 拖过两端：整条胶囊像橡皮筋一样被拉长，越拉越费劲、有上限；玻璃在胶囊里面，跟着一起被拉，绝不出界。
 * - 大力一甩：整条胶囊朝甩的方向形变再回弹。
 */

export interface ThumbBox {
  left: number;
  width: number;
  top: number;
  height: number;
}

export interface LensRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** 浮起来的透镜比滑块左右各宽这么多（布局像素）。 */
export const LIFT_PAD_X = 7;
/** 浮起来的透镜比整条胶囊（这一行）高两成，伸出上下沿。 */
export const LIFT_Y = 1.2;

/**
 * 透镜的位置和尺寸（轨道坐标）。中心永远是滑块中心（字在正中）；横向绝不伸出轨道——
 * 停在第一项 / 最后一项时，透镜两边对称地收窄到刚好贴住轨道两端，而不是整块往里挪（挪了字就不居中）。
 * 竖向比整条胶囊高两成，伸出上下沿（浮起来的样子）。
 * `pad` 是轨道内边距：一行的高度 = 滑块高 + 上下内边距。
 */
export function liftRect(thumb: ThumbBox, trackWidth: number, pad: number): LensRect {
  const row = thumb.height + pad * 2;
  const h = Math.round(row * LIFT_Y);
  const cx = thumb.left + thumb.width / 2;
  const room = 2 * Math.min(cx, trackWidth - cx);
  const want = Math.max(h, thumb.width + LIFT_PAD_X * 2);
  const w = Math.round(Math.max(thumb.width, Math.min(want, room)));
  return { x: cx - w / 2, y: thumb.top + thumb.height / 2 - h / 2, w, h };
}

/**
 * 橡皮筋：手指拖过两端的距离（带符号，左负右正）换成整条胶囊被拉长多少像素。
 * 越拉越费劲，永远到不了 `max`。
 */
export function rubberStretch(over: number, max: number): number {
  if (!over || max <= 0) return 0;
  const reach = Math.abs(over);
  return Math.sign(over) * max * (1 - 1 / ((reach / max) * 0.55 + 1));
}

/** 拉长的上限：轨道宽的 5%，最多 18 像素。 */
export const stretchLimit = (trackWidth: number): number => Math.min(18, trackWidth * 0.05);

/** 甩出去时整条胶囊的形变（比例，带方向）。速度单位：布局像素 / 毫秒。 */
export function flickDeform(velocity: number): number {
  return Math.sign(velocity) * Math.min(0.035, Math.abs(velocity) * 0.012);
}

/** 横向拉长 `s` 倍时竖向收一点（看上去是同一团东西被拉长，而不是被放大）。 */
export const squash = (s: number): string => `${s.toFixed(4)} ${(1 - (s - 1) * 0.35).toFixed(4)}`;
