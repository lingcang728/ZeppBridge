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
