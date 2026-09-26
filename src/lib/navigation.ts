/** Detail routes keep the tab they were opened from. */
export const navigationBranch = (path: string): string => {
  if (path === '/ai' || path.startsWith('/ai/')) return '/ai';
  if (path === '/settings' || path === '/health-check' || path.startsWith('/devices')) return '/settings';
  return '/';
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
 */
export function segmentClip(
  thumb: { left: number; width: number; visible: boolean },
  trackWidth: number,
  pad = 3,
): string {
  if (!thumb.visible || thumb.width <= 0 || trackWidth <= 0) return 'inset(50%)';
  const left = Math.max(0, thumb.left);
  const right = Math.max(0, trackWidth - (thumb.left + thumb.width));
  return `inset(${pad}px ${right}px ${pad}px ${left}px round 999px)`;
}
