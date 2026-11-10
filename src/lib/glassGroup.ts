/**
 * 玻璃组（2026-11-10，计划 D1）：一组玻璃控件共用的几何与交互状态。纯函数，组件只管把结果写进样式。
 *
 * 以前胶囊（SegmentTrack）和滚轮（CapsuleWheel）各管各的：拉长多少、朝哪边钉住、弹回去怎么走、镜片多宽，
 * 都散在组件里。这里把它们收成一份「姿态」（GlassPose：位移、缩放、锚点、是否浮起），外加成组时要用的
 * 成员矩形、间距、并拢程度。外观和以前一模一样：数值、曲线、时长原样搬过来，边界约束和形变上限不变
 * （单个透镜的摆法仍在 segmentGlass.ts）。
 *
 * 成组的合并 / 分离（D2）建立在这份状态上：两块玻璃靠得足够近时并成一块，组里垫一块并集形状的板。
 */
import type { LensRect } from './segmentGlass';
import { squash } from './segmentGlass';

/** 一块玻璃此刻的姿态。缩放按锚点那一侧钉住（朝手指那边被拉长）。 */
export interface GlassPose {
  /** 位移（布局像素）。 */
  x: number;
  y: number;
  /** 横向缩放；竖向随之收一点（见 `squash`），所以只记横向。 */
  sx: number;
  /** 钉住哪一端：`start` 钉左（往右拉长），`end` 钉右（往左拉长）。 */
  anchor: 'start' | 'end' | 'center';
  /** 浮起来了（按住、拖动、浮着飞过去、滚轮转动中）。 */
  active: boolean;
}

export const RESTING: GlassPose = Object.freeze({ x: 0, y: 0, sx: 1, anchor: 'center', active: false });

/** 拖过两端被拉长 `stretch` 像素（带符号，左负右正）时的姿态。 */
export function stretchPose(stretch: number, trackWidth: number, active = false): GlassPose {
  if (!stretch) return { ...RESTING, active };
  return { x: 0, y: 0, sx: 1 + Math.abs(stretch) / Math.max(1, trackWidth), anchor: stretch < 0 ? 'end' : 'start', active };
}

const ORIGIN = { start: 'left center', end: 'right center', center: 'center' } as const;

/** 姿态写进样式的那一段（只有被拉长时才有）。 */
export function poseStyle(pose: GlassPose): Record<string, string> {
  if (pose.sx === 1) return {};
  return { scale: squash(pose.sx), transformOrigin: ORIGIN[pose.anchor] };
}

/**
 * 松手或大力一甩后弹回原样的关键帧：朝运动方向多冲一点、再往回收一点、停住。
 * `from` 是松手时还被拉长的像素（带符号），`flick` 是甩出去的形变比例（带符号，见 `flickDeform`）。
 * 不需要弹（没拉长也没甩、或宽度为 0）时返回 null。
 */
export function springFrames(from: number, flick: number, width: number): { frames: Keyframe[]; duration: number } | null {
  const dir = from ? Math.sign(from) : Math.sign(flick);
  if (!width || !dir) return null;
  const start = 1 + Math.abs(from) / width;
  const peak = Math.max(start, 1 + Math.abs(flick));
  const origin = dir < 0 ? ORIGIN.end : ORIGIN.start;
  const overshoots = peak > start + 0.001;
  const frames: Keyframe[] = [{ scale: squash(start), transformOrigin: origin, easing: 'cubic-bezier(.3, .7, .4, 1)' }];
  if (overshoots) frames.push({ scale: squash(peak), transformOrigin: origin, offset: 0.26, easing: 'cubic-bezier(.4, 0, .4, 1)' });
  frames.push(
    { scale: squash(1 - (peak - 1) * 0.3), transformOrigin: origin, offset: 0.62, easing: 'cubic-bezier(.4, 0, .4, 1)' },
    { scale: '1 1', transformOrigin: origin },
  );
  return { frames, duration: overshoots ? 560 : 460 };
}

/**
 * 滚轮镜片沿滚动方向的长度：在相邻两项的尺寸之间按浮点下标插值，拖动时跟着内容伸缩。
 * `loop` 时首尾相接。
 */
export function lensSpan(sizes: readonly number[], pos: number, loop: boolean): number {
  const n = sizes.length;
  if (!n) return 0;
  const p = loop ? ((pos % n) + n) % n : Math.min(n - 1, Math.max(0, pos));
  const lo = Math.floor(p);
  const hi = loop ? (lo + 1) % n : Math.min(n - 1, lo + 1);
  const f = p - lo;
  return (sizes[lo] ?? 0) * (1 - f) + (sizes[hi] ?? 0) * f;
}

/* —— 成组 —— */

/** 两块玻璃之间最近的空隙（像素）；重叠时为负（取重叠较少那个方向的深度）。 */
export function gapBetween(a: LensRect, b: LensRect): number {
  const dx = Math.max(b.x - (a.x + a.w), a.x - (b.x + b.w));
  const dy = Math.max(b.y - (a.y + a.h), a.y - (b.y + b.h));
  if (dx < 0 && dy < 0) return Math.max(dx, dy);
  return Math.hypot(Math.max(0, dx), Math.max(0, dy));
}

/**
 * 并拢程度：空隙 ≥ `reach` 时 0（各是各的），贴上时 1，中间平滑过渡（smoothstep，两头没有折角）。
 * `reach` 是我们自己调的距离，不冒充系统数值。
 */
export function mergeAmount(gap: number, reach: number): number {
  if (reach <= 0) return gap <= 0 ? 1 : 0;
  const t = Math.min(1, Math.max(0, 1 - gap / reach));
  return t * t * (3 - 2 * t);
}

/** 几块玻璃的并集外框（垫板的形状）。没有成员时返回 null。 */
export function unionRect(rects: readonly LensRect[]): LensRect | null {
  if (!rects.length) return null;
  let x1 = Infinity, y1 = Infinity, x2 = -Infinity, y2 = -Infinity;
  for (const r of rects) {
    x1 = Math.min(x1, r.x);
    y1 = Math.min(y1, r.y);
    x2 = Math.max(x2, r.x + r.w);
    y2 = Math.max(y2, r.y + r.h);
  }
  return { x: x1, y: y1, w: x2 - x1, h: y2 - y1 };
}

export interface GroupMember {
  id: string;
  rect: LensRect | null;
  pose: GlassPose;
}

export interface GroupState {
  /** 有成员浮起来了。 */
  active: boolean;
  /** 两两之间最大的并拢程度（0–1）。 */
  amount: number;
  /** 并拢程度过半：按一块玻璃画。 */
  merged: boolean;
  /** 所有有矩形的成员的并集外框。 */
  union: LensRect | null;
}

/** 一组玻璃此刻的整体状态。 */
export function groupState(members: readonly GroupMember[], reach: number): GroupState {
  const rects = members.map((m) => m.rect).filter((r): r is LensRect => r !== null);
  let amount = 0;
  for (let i = 0; i < rects.length; i++) {
    for (let j = i + 1; j < rects.length; j++) amount = Math.max(amount, mergeAmount(gapBetween(rects[i]!, rects[j]!), reach));
  }
  return { active: members.some((m) => m.pose.active), amount, merged: amount >= 0.5, union: unionRect(rects) };
}

/**
 * 两块玻璃之间的「颈」（D2 样机）：并拢时从 `from` 那边长出来、连住 `to`，分开时从中间掐断。
 * 只有两块在 `axis` 方向上隔着一道缝、另一个方向上有重叠，且缝小于 `reach` 时才有颈；否则 null。
 * 两端各伸进成员 `tuck` 像素，藏在成员的圆角底下，看起来是长在一起的。
 * 粗细取两块较小那边的 `ratio`，上限 `max`。坐标系和传进来的矩形一样。
 */
export function bridgeRect(
  from: LensRect,
  to: LensRect,
  axis: 'x' | 'y',
  reach: number,
  { tuck = 8, ratio = 0.5, max = 28 } = {},
): LensRect | null {
  const [lead, trail] = axis === 'y'
    ? (from.y <= to.y ? [from, to] : [to, from])
    : (from.x <= to.x ? [from, to] : [to, from]);
  const gap = axis === 'y' ? trail.y - (lead.y + lead.h) : trail.x - (lead.x + lead.w);
  if (gap < 0 || gap >= reach) return null;
  // 另一个方向上两块的重叠段，颈放在它中间。
  const lo = axis === 'y' ? Math.max(lead.x, trail.x) : Math.max(lead.y, trail.y);
  const hi = axis === 'y' ? Math.min(lead.x + lead.w, trail.x + trail.w) : Math.min(lead.y + lead.h, trail.y + trail.h);
  if (hi <= lo) return null;
  const smaller = axis === 'y' ? Math.min(lead.w, trail.w) : Math.min(lead.h, trail.h);
  const thick = Math.min(max, smaller * ratio, hi - lo);
  const centre = (lo + hi) / 2;
  if (axis === 'y') return { x: centre - thick / 2, y: lead.y + lead.h - tuck, w: thick, h: gap + tuck * 2 };
  return { x: lead.x + lead.w - tuck, y: centre - thick / 2, w: gap + tuck * 2, h: thick };
}
