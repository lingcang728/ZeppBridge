/** 发牌规则共用的小函数：日期加减、运动大类、配速、距离、牌的构造。全是纯函数。大类和配速的规则在 sport.ts。 */
import { addDays } from '../../aiTask/bridgeScale';
import { BENCH_MAX, HAND_MAX, MIN_WORKOUT_SECONDS } from './constants';
import { paceOf, sportOf } from './sport';
import type { CardRole, Hand, HandCard, HandNight, HandWorkout, NightFlag } from './types';

export { addDays };

/** 两个本地日相差几天（b − a）。 */
export const dayDiff = (a: string, b: string): number => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000);

/** 大类：跑、骑、游、徒步各算一类，其余就是类型本身（力量不和瑜伽比）。同一路线、同距离段、同类只在同一个大类里比。 */
export const familyOf = (type: string): string => {
  const sport = sportOf(type);
  return sport === 'run' || sport === 'ride' || sport === 'swim' || sport === 'hike' ? sport : type;
};
export const isRun = (workout: HandWorkout): boolean => sportOf(workout.workout_type) === 'run';

/** 够长、值得上牌的一次运动。 */
export const substantial = (workout: HandWorkout): boolean => workout.duration_s >= MIN_WORKOUT_SECONDS;

export { paceOf };

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
