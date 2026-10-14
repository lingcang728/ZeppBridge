/**
 * 首页小图表的几何：刻度、断档分段、平滑路径。
 *
 * 首页那张心率卡以前用 ECharts 画——为了一条五小时的曲线，首屏要多下载、解析
 * 一个 580 KB 的图表引擎，还要常驻一个 canvas 实例。这里只做那张卡真正用到的
 * 几件事，交给 SVG 画；二级页的交互图表仍然用 ECharts。
 */
import type { TimedValue } from './chartGaps';

export interface PlotPoint {
  x: number;
  y: number;
}

/** 纵轴刻度：步长取 1 / 2 / 2.5 / 5 × 10ⁿ，至少覆盖 [min, max]。 */
export function niceTicks(min: number, max: number, count = 3): number[] {
  if (!Number.isFinite(min) || !Number.isFinite(max)) return [];
  if (max <= min) max = min + 1;
  const raw = (max - min) / Math.max(count, 1);
  const magnitude = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((f) => f * magnitude).find((s) => s >= raw) ?? raw;
  const first = Math.floor(min / step) * step;
  const last = Math.ceil(max / step) * step;
  const ticks: number[] = [];
  for (let value = first; value <= last + step / 2; value += step) ticks.push(Math.round(value * 100) / 100);
  return ticks;
}

const HOUR = 3_600_000;

/**
 * 横轴刻度：落在整点（或整半点）上，间距不小于 `minGapPx`。
 * 时间按本机时区取整——轴上写的是本机钟面时间。
 */
export function timeTicks(start: number, end: number, widthPx: number, minGapPx = 80): number[] {
  if (!(end > start) || widthPx <= 0) return [];
  const pxPerMs = widthPx / (end - start);
  const step = [HOUR / 2, HOUR, 2 * HOUR, 3 * HOUR, 6 * HOUR, 12 * HOUR].find((s) => s * pxPerMs >= minGapPx) ?? 24 * HOUR;
  const offset = new Date(start).getTimezoneOffset() * 60_000;
  let tick = Math.ceil((start - offset) / step) * step + offset;
  const ticks: number[] = [];
  for (; tick <= end; tick += step) ticks.push(tick);
  return ticks;
}

/** 相邻两点间隔超过 `gapMs` 就断开：缺的时间画成空白，而不是一条直线。 */
export function splitAtGaps(points: readonly TimedValue[], gapMs: number): TimedValue[][] {
  const segments: TimedValue[][] = [];
  let current: TimedValue[] = [];
  for (const point of points) {
    const previous = current[current.length - 1];
    if (previous && point.ts - previous.ts > gapMs) {
      segments.push(current);
      current = [];
    }
    current.push(point);
  }
  if (current.length) segments.push(current);
  return segments;
}

/** 过每个点的平滑曲线（Catmull-Rom 转三次贝塞尔，张力 1/6，与 Sparkline 一致）。 */
export function smoothPath(points: readonly PlotPoint[]): string {
  if (!points.length) return '';
  const f = (value: number) => value.toFixed(1);
  let d = `M${f(points[0].x)} ${f(points[0].y)}`;
  if (points.length === 1) return `${d} h0.01`;
  for (let i = 0; i < points.length - 1; i += 1) {
    const p0 = points[i - 1] ?? points[i];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = points[i + 2] ?? p2;
    d += ` C${f(p1.x + (p2.x - p0.x) / 6)} ${f(p1.y + (p2.y - p0.y) / 6)} ${f(p2.x - (p3.x - p1.x) / 6)} ${f(p2.y - (p3.y - p1.y) / 6)} ${f(p2.x)} ${f(p2.y)}`;
  }
  return d;
}

/** 按横坐标找最近的点（`points` 按 x 升序）。 */
export function nearestByX<T extends { x: number }>(points: readonly T[], x: number): T | null {
  if (!points.length) return null;
  let lo = 0;
  let hi = points.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (points[mid].x < x) lo = mid + 1;
    else hi = mid;
  }
  const before = points[lo - 1];
  return before && x - before.x < points[lo].x - x ? before : points[lo];
}
