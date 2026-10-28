/**
 * 年轮上点开的那次运动的「运动名片」（components/rings/StarCard.vue）：选哪几格、心率区间五色条、今年之最的徽章、
 * 路线剪影。全是纯函数——缺的格子整格不出（不编造数据，不拿 0 填空）。
 */
import type { HeartRateZoneBucket, WorkoutRoutePoint } from '../../types/workout';
import type { RingStar, RingYear } from '../../types/rings';

/** 跑走徒步看配速，骑行看速度，其余（力量、游泳、球类）两样都不出——它们的「每公里几分」没有意义。 */
export type StarRate = 'pace' | 'speed' | null;
export const rateOf = (kind: string, isRun: boolean): StarRate => {
  const k = kind.toLowerCase();
  if (isRun || /run|walk|hik|trek|treadmill|trail/.test(k)) return 'pace';
  if (/cycl|bik|ride|spinning/.test(k)) return 'speed';
  return null;
};

export interface StarFacts {
  kind: string;
  isRun: boolean;
  distanceM: number | null | undefined;
  /** 运动时长（不含暂停）；详情还没到时用年轮里的时长。 */
  seconds: number | null | undefined;
  avgHr: number | null | undefined;
}

export type CellKey = 'distance' | 'duration' | 'pace' | 'speed' | 'hr';
export interface StarCell { key: CellKey; meters?: number; seconds?: number; secondsPerKm?: number; kmh?: number; bpm?: number }

const positive = (value: number | null | undefined): value is number => typeof value === 'number' && Number.isFinite(value) && value > 0;

/** 名片上的格子，最多四格：距离、时长、配速或速度、平均心率。数值保持原单位，排版交给界面（它知道公制 / 英制）。 */
export function starCells(facts: StarFacts): StarCell[] {
  const cells: StarCell[] = [];
  const { distanceM, seconds } = facts;
  if (positive(distanceM)) cells.push({ key: 'distance', meters: distanceM });
  if (positive(seconds)) cells.push({ key: 'duration', seconds });
  const rate = rateOf(facts.kind, facts.isRun);
  // 不到 200 米的距离算出来的配速只是噪声。
  if (rate && positive(distanceM) && positive(seconds) && distanceM >= 200) {
    if (rate === 'pace') cells.push({ key: 'pace', secondsPerKm: seconds / (distanceM / 1000) });
    else cells.push({ key: 'speed', kmh: distanceM / 1000 / (seconds / 3600) });
  }
  if (positive(facts.avgHr)) cells.push({ key: 'hr', bpm: Math.round(facts.avgHr) });
  return cells;
}

/** 心率区间五色条：每段占多少。没有心率、或者总时长为 0 时返回 null（不画空条）。 */
export function zoneShares(zones: HeartRateZoneBucket[] | null | undefined): Array<{ index: number; share: number }> | null {
  const list = [...(zones ?? [])].sort((a, b) => a.index - b.index);
  const total = list.reduce((sum, zone) => sum + Math.max(0, zone.seconds), 0);
  if (!list.length || total <= 0) return null;
  return list.filter(zone => zone.seconds > 0).map(zone => ({ index: zone.index, share: zone.seconds / total }));
}

/** 只有真是今年之最才挂徽章：跑得最远的一跑、练得最久的一次（后端 longest_run / longest_workout）。 */
export type StarBadge = 'farthestRun' | 'longestSession' | null;
export function starBadge(star: Pick<RingStar, 'workout_id'>, year: Pick<RingYear, 'longest_run' | 'longest_workout'> | null): StarBadge {
  if (!year) return null;
  if (year.longest_run?.workout_id === star.workout_id) return 'farthestRun';
  if (year.longest_workout?.workout_id === star.workout_id) return 'longestSession';
  return null;
}

/**
 * 路线剪影：轨迹按经纬度等距投影（经度乘 cos 纬度）塞进 w×h 的框，保持长宽比、居中，最多取 160 个点。
 * 只画线形，不上地图、不标坐标；少于两个有效点返回 null。
 */
export function routePath(points: Pick<WorkoutRoutePoint, 'latitude' | 'longitude'>[], w = 64, h = 40, pad = 3): string | null {
  const valid = points.filter(p => Number.isFinite(p.latitude) && Number.isFinite(p.longitude) && (p.latitude !== 0 || p.longitude !== 0));
  if (valid.length < 2) return null;
  const step = Math.max(1, Math.ceil(valid.length / 160));
  const picked = valid.filter((_, i) => i % step === 0 || i === valid.length - 1);
  const mid = (Math.min(...picked.map(p => p.latitude)) + Math.max(...picked.map(p => p.latitude))) / 2;
  const k = Math.cos((mid * Math.PI) / 180);
  const xs = picked.map(p => p.longitude * k), ys = picked.map(p => -p.latitude);
  const minX = Math.min(...xs), minY = Math.min(...ys);
  const spanX = Math.max(...xs) - minX, spanY = Math.max(...ys) - minY;
  if (spanX <= 0 && spanY <= 0) return null;
  const scale = Math.min((w - pad * 2) / (spanX || Number.POSITIVE_INFINITY), (h - pad * 2) / (spanY || Number.POSITIVE_INFINITY));
  const ox = (w - spanX * scale) / 2, oy = (h - spanY * scale) / 2;
  return picked.map((_, i) => `${i ? 'L' : 'M'}${(ox + (xs[i] - minX) * scale).toFixed(1)} ${(oy + (ys[i] - minY) * scale).toFixed(1)}`).join('');
}

/** 指针从 `from` 转到 `to`（一年里的第几成）走最短的那段弧：返回 -0.5…0.5 的差。 */
export const shortestArc = (from: number, to: number): number => {
  const d = (((to - from) % 1) + 1) % 1;
  return d > 0.5 ? d - 1 : d;
};
