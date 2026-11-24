/** 发牌规则共用的小函数：日期加减、运动大类、配速、距离、牌的构造。全是纯函数。 */
import { addDays } from '../../aiTask/bridgeScale';
import { BENCH_MAX, HAND_MAX, MIN_WORKOUT_SECONDS, PACE_RANGE } from './constants';
import type { CardRole, Hand, HandCard, HandNight, HandWorkout, NightFlag } from './types';

export { addDays };

/** 两个本地日相差几天（b − a）。 */
export const dayDiff = (a: string, b: string): number => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000);

const RUN = new Set(['run', 'running', 'trail_running', 'trail_run', 'treadmill', 'indoor_run', 'outdoor_run']);
const RIDE = new Set(['ride', 'cycling', 'outdoor_cycling', 'indoor_cycling', 'mountain_biking', 'road_cycling']);

/** 大类：跑、骑，其余就是类型本身。同一路线、同距离段只在同一个大类里比。 */
export const familyOf = (type: string): string => (RUN.has(type) ? 'run' : RIDE.has(type) ? 'ride' : type);
export const isRun = (workout: HandWorkout): boolean => familyOf(workout.workout_type) === 'run';

/** 够长、值得上牌的一次运动。 */
export const substantial = (workout: HandWorkout): boolean => workout.duration_s >= MIN_WORKOUT_SECONDS;

/** 配速（秒 / 公里）；距离或时长缺、或者离谱，就是 null，不拿 0 顶。 */
export const paceOf = (workout: HandWorkout): number | null => {
  const km = (workout.distance_m ?? 0) / 1000;
  if (km <= 0 || workout.duration_s <= 0) return null;
  const pace = workout.duration_s / km;
  return pace >= PACE_RANGE[0] && pace <= PACE_RANGE[1] ? pace : null;
};

/** 两点间的大圆距离（米）。 */
export const haversine = (a: readonly [number, number], b: readonly [number, number]): number => {
  const rad = Math.PI / 180;
  const dLat = (b[0] - a[0]) * rad;
  const dLng = (b[1] - a[1]) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a[0] * rad) * Math.cos(b[0] * rad) * Math.sin(dLng / 2) ** 2;
  return 2 * 6_371_000 * Math.asin(Math.min(1, Math.sqrt(h)));
};

export const median = (values: number[]): number | null => {
  if (!values.length) return null;
  const sorted = [...values].sort((x, y) => x - y);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
};

export const mean = (values: number[]): number | null => (values.length ? values.reduce((sum, v) => sum + v, 0) / values.length : null);

export const workoutCard = (workout: HandWorkout, role: CardRole, note: string | null = null): HandCard => ({
  kind: 'workout', id: `w:${workout.workout_id}`, date: workout.date, role, workout, note,
});
export const nightCard = (night: HandNight, role: CardRole, flags?: NightFlag[]): HandCard => ({
  kind: 'night', id: `n:${night.date}`, date: night.date, role, night, ...(flags ? { flags } : {}),
});

/** 按日期旧 → 新排；同一天运动排在那一晚后面（先睡醒再运动）。 */
export const byDate = (a: HandCard, b: HandCard): number => a.date.localeCompare(b.date)
  || (a.kind === b.kind ? (a.kind === 'workout' && b.kind === 'workout' ? a.workout.start_time.localeCompare(b.workout.start_time) : 0) : a.kind === 'night' ? -1 : 1);

/**
 * 收尾：去重，主牌留 `HAND_MAX` 张（`keep` 里的优先），多出来的和 `extra` 进候补（新 → 旧，最多 `BENCH_MAX`）。
 * 主牌按日期旧 → 新摆。
 */
export const finishHand = (base: Omit<Hand, 'cards' | 'bench'>, picked: HandCard[], extra: HandCard[] = []): Hand => {
  const seen = new Set<string>();
  const unique = (list: HandCard[]) => list.filter((card) => (seen.has(card.id) ? false : (seen.add(card.id), true)));
  const main = unique(picked);
  const cards = main.slice(0, HAND_MAX).sort(byDate);
  const bench = [...main.slice(HAND_MAX), ...unique(extra)]
    .sort((a, b) => -byDate(a, b))
    .slice(0, BENCH_MAX);
  return { ...base, cards, bench };
};
