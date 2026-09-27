/** Detail routes keep the tab they were opened from. */
export const navigationBranch = (path: string): string => {
  if (path === '/ai' || path.startsWith('/ai/')) return '/ai';
  if (path === '/settings' || path.startsWith('/settings/') || path === '/health-check' || path.startsWith('/devices')) return '/settings';
  return '/';
};

/** 三个主入口在导航胶囊里的顺序；横向切页的方向按它算。 */
export const TAB_ORDER = ['/', '/ai', '/settings'] as const;

export type PageMotion = 'forward' | 'back' | 'left' | 'right' | 'none';

const isTabRoot = (path: string) => (TAB_ORDER as readonly string[]).includes(path);

/**
 * 切页时画面往哪儿走。
 *
 * 同一个入口里往深处走（概览 → 睡眠详情）是「聚焦进去」，回来是「退出来」；
 * 换入口是横向滑，方向跟导航胶囊里的左右顺序一致——手指往哪边拨，画面就从哪边来。
 */
export const pageMotion = (from: string, to: string): PageMotion => {
  if (from === to) return 'none';
  const a = navigationBranch(from);
  const b = navigationBranch(to);
  if (a === b) {
    const da = isTabRoot(from) ? 0 : 1;
    const db = isTabRoot(to) ? 0 : 1;
    if (db > da) return 'forward';
    if (db < da) return 'back';
    return 'forward';
  }
  return TAB_ORDER.indexOf(b as (typeof TAB_ORDER)[number]) > TAB_ORDER.indexOf(a as (typeof TAB_ORDER)[number])
    ? 'left'
    : 'right';
};

export interface SegmentStop<T = string> {
  left: number;
  width: number;
  value: T;
}

export function dragThumb<T>(stops: SegmentStop<T>[], center: number, velocity = 0) {
  if (!stops.length) return { left: 0, width: 0 };
  const centers = stops.map((stop) => stop.left + stop.width / 2);
  const clamped = Math.max(centers[0], Math.min(centers[centers.length - 1], center));
  const right = Math.max(1, centers.findIndex((value) => value >= clamped));
  const a = stops[right - 1];
  const b = stops[right] ?? a;
  const span = (centers[right] ?? centers[right - 1]) - centers[right - 1] || 1;
  const fraction = Math.max(0, Math.min(1, (clamped - centers[right - 1]) / span));
  const width = a.width + (b.width - a.width) * fraction + Math.min(10, Math.abs(velocity) * 6);
  const maxLeft = stops[stops.length - 1].left + stops[stops.length - 1].width - width;
  return { left: Math.max(stops[0].left, Math.min(maxLeft, clamped - width / 2)), width };
}

export function snapStop<T>(stops: SegmentStop<T>[], center: number, velocity: number): SegmentStop<T> {
  const projected = center + Math.max(-90, Math.min(90, velocity * 110));
  return stops.reduce((best, stop) =>
    Math.abs(stop.left + stop.width / 2 - projected) < Math.abs(best.left + best.width / 2 - projected) ? stop : best);
}

/**
 * 上层「选中字」的裁剪框：正好是滑块覆盖的那一段（上下各留轨道内边距）。
 * 滑块还没量出来时整层藏掉，免得第一帧所有标签都是选中色。
 *
 * `grow`：拖动时滑块变成放大的透镜（横向放大 grow 倍、纵向顶满轨道），裁剪框
 * 必须跟着一样大——否则透镜边缘那一圈露出底下的原字，看起来就是重影。
 */
export function segmentClip(
  thumb: { left: number; width: number; visible: boolean },
  trackWidth: number,
  pad = 3,
  grow = 1,
): string {
  if (!thumb.visible || thumb.width <= 0 || trackWidth <= 0) return 'inset(50%)';
  const extra = (thumb.width * (grow - 1)) / 2;
  const left = Math.max(0, thumb.left - extra);
  const right = Math.max(0, trackWidth - (thumb.left + thumb.width) - extra);
  const vertical = grow > 1 ? 0 : pad;
  return `inset(${vertical}px ${right}px ${vertical}px ${left}px round 999px)`;
}
