import { isFiniteNumber } from './format';
import type { WorkoutRoutePoint, WorkoutSeries } from '../types';

/*
 * 运动轨迹的示意图：把经纬度投影到一块固定大小的画布上，按配速给每一段上色。
 *
 * 纯函数，不碰 Vue——以前这些全写在 WorkoutDetail.vue 里，改一处就得点开界面看。
 * 规则和以前一样：跳点（两点之间超过两分钟或距离不合理）、暂停段、配速缺失段都不画，
 * 宁可断开也不画一条假的连线；配速样本少于 3 个时整条轨迹用中性色。
 */

export interface RouteCanvasPoint extends WorkoutRoutePoint {
  x: number;
  y: number;
  pace: number | null;
  paceDelta: number | null;
  paused: boolean;
}

export interface RouteSegment {
  d: string;
  color: string;
  from: RouteCanvasPoint;
  to: RouteCanvasPoint;
}

export interface GhostRoad {
  d: string;
  opacity: number;
}

export interface RouteCanvas {
  viewBox: string;
  ghosts: GhostRoad[];
  glow: string;
  segments: RouteSegment[];
  pauseMarkers: { x: number; y: number }[];
  start: RouteCanvasPoint;
  end: RouteCanvasPoint;
  validPaceCount: number;
  enoughPace: boolean;
}

/** 超过 max 个点时等距抽样，保留最后一个点。 */
export const downsample = <T>(items: T[], max = 800): T[] => {
  if (items.length <= max) return items;
  const step = Math.ceil(items.length / max);
  const sampled = items.filter((_, index) => index % step === 0);
  const last = items[items.length - 1];
  if (sampled[sampled.length - 1] !== last) sampled.push(last);
  return sampled;
};

export const toSvgPath = (points: Array<{ x: number; y: number }>): string => points
  .map((point, index) => `${index ? 'L' : 'M'}${point.x.toFixed(1)} ${point.y.toFixed(1)}`)
  .join(' ');

const offsetPolyline = (points: Array<{ x: number; y: number }>, distance: number) => points.map((point, index) => {
  const prev = points[Math.max(0, index - 1)];
  const next = points[Math.min(points.length - 1, index + 1)];
  const dx = next.x - prev.x;
  const dy = next.y - prev.y;
  const length = Math.hypot(dx, dy) || 1;
  return { x: point.x + (-dy / length) * distance, y: point.y + (dx / length) * distance };
});

/** 轨迹两侧几条若隐若现的「路」，只是底纹，不代表任何真实道路。 */
export const buildGhostRoads = (points: Array<{ x: number; y: number }>): GhostRoad[] => {
  if (points.length < 3) return [];
  const step = Math.max(1, Math.ceil(points.length / 48));
  const spine = points.filter((_, index) => index % step === 0);
  if (spine[spine.length - 1] !== points[points.length - 1]) spine.push(points[points.length - 1]);
  if (spine.length < 3) return [];
  const ghosts: GhostRoad[] = [
    { d: toSvgPath(offsetPolyline(spine, 16)), opacity: .13 },
    { d: toSvgPath(offsetPolyline(spine, -13)), opacity: .1 },
    { d: toSvgPath(offsetPolyline(spine, 30)), opacity: .07 },
    { d: toSvgPath(offsetPolyline(spine, -27)), opacity: .06 },
  ];
  for (let index = 3; index < spine.length - 3; index += 5) {
    const prev = spine[index - 1];
    const next = spine[index + 1];
    const dx = next.x - prev.x;
    const dy = next.y - prev.y;
    const length = Math.hypot(dx, dy) || 1;
    const side = index % 10 < 5 ? 1 : -1;
    const stub = 16 + (index % 3) * 7;
    const nx = (-dy / length) * side * stub;
    const ny = (dx / length) * side * stub;
    ghosts.push({
      d: `M${spine[index].x.toFixed(1)} ${spine[index].y.toFixed(1)} L${(spine[index].x + nx).toFixed(1)} ${(spine[index].y + ny).toFixed(1)}`,
      opacity: .08,
    });
  }
  return ghosts;
};

export const haversineMeters = (a: WorkoutRoutePoint, b: WorkoutRoutePoint): number => {
  const rad = Math.PI / 180;
  const dLat = (b.latitude - a.latitude) * rad;
  const dLon = (b.longitude - a.longitude) * rad;
  const lat1 = a.latitude * rad;
  const lat2 = b.latitude * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 6_371_000 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(Math.max(0, 1 - h)));
};

export const percentile = (values: number[], ratio: number): number => {
  const sorted = [...values].sort((a, b) => a - b);
  if (!sorted.length) return 0;
  const index = Math.min(sorted.length - 1, Math.max(0, Math.floor((sorted.length - 1) * ratio)));
  return sorted[index];
};

/** 配速在 10%–90% 分位之间分四档；样本不够时一律中性色。 */
export const routeColor = (pace: number | null, low: number, high: number, enoughPace: boolean): string => {
  if (!enoughPace || pace === null) return 'var(--route-neutral)';
  const span = Math.max(high - low, 1e-6);
  const ratio = Math.max(0, Math.min(1, (pace - low) / span));
  if (ratio <= .2) return 'var(--route-mint)';
  if (ratio <= .45) return 'var(--route-cyan)';
  if (ratio <= .72) return 'var(--route-amber)';
  return 'var(--route-coral)';
};

type TimedPace = { time: number; pace: number };

const nearestPace = (items: TimedPace[], timestamp: number): { value: number | null; delta: number | null } => {
  if (!items.length) return { value: null, delta: null };
  let lo = 0;
  let hi = items.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (items[mid].time < timestamp) lo = mid + 1;
    else hi = mid;
  }
  let best = items[lo];
  if (lo > 0 && Math.abs(items[lo - 1].time - timestamp) < Math.abs(best.time - timestamp)) best = items[lo - 1];
  const delta = Math.abs(best.time - timestamp);
  return delta <= 45_000 ? { value: best.pace, delta } : { value: null, delta };
};

/** 从一条运动的序列算出整张轨迹图；少于两个点时返回 null（界面显示「没有轨迹」）。 */
export const buildRouteCanvas = (series: WorkoutSeries | null | undefined): RouteCanvas | null => {
  const points = downsample([...(series?.route ?? [])]
    .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()));
  if (points.length < 2) return null;
  const paces: TimedPace[] = (series?.samples ?? [])
    .map((sample) => ({ time: new Date(sample.timestamp).getTime(), pace: sample.pace }))
    .filter((item): item is TimedPace => Number.isFinite(item.time) && isFiniteNumber(item.pace) && item.pace > 0)
    .sort((a, b) => a.time - b.time);
  const pauses = (series?.pauses ?? []).map((pause) => ({
    start: new Date(pause.start_time).getTime(),
    end: new Date(pause.end_time).getTime(),
  })).filter((pause) => Number.isFinite(pause.start) && Number.isFinite(pause.end) && pause.end > pause.start);
  const isPaused = (from: number, to: number) => pauses.some((pause) => Math.max(from, pause.start) <= Math.min(to, pause.end));

  const lats = points.map((point) => point.latitude);
  const lons = points.map((point) => point.longitude);
  const minLat = Math.min(...lats);
  const maxLat = Math.max(...lats);
  const minLon = Math.min(...lons);
  const maxLon = Math.max(...lons);
  const viewW = 1000;
  const viewH = 620;
  const midLat = (minLat + maxLat) / 2;
  const lonFactor = Math.max(Math.cos(midLat * Math.PI / 180), .2);
  const rawW = Math.max(maxLon - minLon, 1e-7) * lonFactor;
  const rawH = Math.max(maxLat - minLat, 1e-7);
  const scale = Math.min((viewW - 120) / rawW, (viewH - 96) / rawH);
  const originX = (viewW - rawW * scale) / 2;
  const originY = (viewH - rawH * scale) / 2;

  const canvasPoints: RouteCanvasPoint[] = points.map((point) => {
    const time = new Date(point.timestamp).getTime();
    const pace = nearestPace(paces, time);
    return {
      ...point,
      x: originX + (point.longitude - minLon) * lonFactor * scale,
      y: originY + (maxLat - point.latitude) * scale,
      pace: pace.value,
      paceDelta: pace.delta,
      paused: Number.isFinite(time) && pauses.some((pause) => time >= pause.start && time <= pause.end),
    };
  });
  const validPaces = canvasPoints.map((point) => point.pace).filter((pace): pace is number => isFiniteNumber(pace) && pace > 0 && pace < 60);
  const enoughPace = validPaces.length >= 3;
  const low = enoughPace ? percentile(validPaces, .1) : 0;
  const high = enoughPace ? percentile(validPaces, .9) : 0;
  const segments: RouteSegment[] = [];
  for (let index = 1; index < canvasPoints.length; index += 1) {
    const from = canvasPoints[index - 1];
    const to = canvasPoints[index];
    const fromTime = new Date(from.timestamp).getTime();
    const toTime = new Date(to.timestamp).getTime();
    const seconds = (toTime - fromTime) / 1000;
    const distance = haversineMeters(from, to);
    const jump = !Number.isFinite(seconds) || seconds <= 0 || seconds > 120 || distance > Math.max(500, seconds * 12 + 100);
    const paused = from.paused || to.paused || isPaused(fromTime, toTime);
    const paceMissing = enoughPace && (from.pace === null || to.pace === null || (from.paceDelta ?? Infinity) > 45_000 || (to.paceDelta ?? Infinity) > 45_000);
    if (jump || paused || paceMissing) continue;
    const pace = from.pace !== null && to.pace !== null ? (from.pace + to.pace) / 2 : null;
    segments.push({ d: `M${from.x.toFixed(1)} ${from.y.toFixed(1)} L${to.x.toFixed(1)} ${to.y.toFixed(1)}`, color: routeColor(pace, low, high, enoughPace), from, to });
  }
  const pauseMarkers = pauses.map((pause) => {
    const target = canvasPoints.reduce((best, point) => {
      const distance = Math.abs(new Date(point.timestamp).getTime() - pause.start);
      return distance < best.distance ? { point, distance } : best;
    }, { point: canvasPoints[0], distance: Infinity }).point;
    return { x: target.x, y: target.y };
  });
  return {
    viewBox: `0 0 ${viewW} ${viewH}`,
    ghosts: buildGhostRoads(canvasPoints),
    glow: toSvgPath(canvasPoints),
    segments,
    pauseMarkers,
    start: canvasPoints[0],
    end: canvasPoints[canvasPoints.length - 1],
    validPaceCount: validPaces.length,
    enoughPace,
  };
};
