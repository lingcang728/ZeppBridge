/**
 * 运动大类与用户画像：今日一问按用户自己常练什么来问，不默认人人都跑步。
 *
 * - `sportOf`：运动类型（`workout_type`）归到几个大类。跑、骑、游按距离比快慢；徒步按路线比；
 *   力量、拉伸和其余（球类、操课、器械有氧……）没有可比的距离，按一次次的时长、心率、负荷比。
 * - `sportProfile`：最近 `SPORT_PROFILE_DAYS` 天里够长的运动按大类数次数，够 `SPORT_MIN_SESSIONS` 次的才算常练，多 → 少。
 *   和距离、路线有关的问题只问画像里有的那几类（偶尔跑过一两次的人，不问他 5K 进步了没有）；画像是空的（最近没怎么动）就不限。
 * 全是规则，不调模型。阈值在 constants.ts。
 */
import { addDays } from '../../aiTask/bridgeScale';
import { MIN_WORKOUT_SECONDS, PACE_RANGES, SPORT_MIN_SESSIONS, SPORT_PROFILE_DAYS } from './constants';
import type { HandWorkout } from './types';

export type Sport = 'run' | 'ride' | 'swim' | 'hike' | 'strength' | 'mobility' | 'other';
/** 按距离比快慢的几类（同距离段、刷 PR、像不像比赛）。 */
export type DistanceSport = 'run' | 'ride' | 'swim';
export const DISTANCE_SPORTS: readonly DistanceSport[] = ['run', 'ride', 'swim'];
/** 有户外路线可比的几类（同一条路线）。 */
export const ROUTE_SPORTS: readonly Sport[] = ['run', 'ride', 'hike'];

const RULES: ReadonlyArray<readonly [Sport, RegExp]> = [
  ['run', /^(run|running|outdoor_run|indoor_run|trail_run|trail_running|treadmill)$/],
  ['ride', /^(ride|cycling|outdoor_cycling|indoor_cycling|road_cycling|mountain_biking|e_bike|spinning|bmx)$/],
  ['swim', /^(swim|swimming|pool_swimming|open_water_swimming|finswimming)$/],
  ['hike', /^(hiking|walking|indoor_walking|race_walking|rucking|dog_walking|mountaineering)$/],
  ['strength', /^(strength|weight_training|functional_training|core_training|hiit|indoor_fitness|cross_training|free_training|crossfit|battle_rope|wall_ball|horizontal_bar|parallel_bars|gymnastics)$/],
  ['mobility', /^(yoga|pilates|stretching|flexibility|tai_chi)$/],
];

export const sportOf = (type: string): Sport => {
  const key = type.trim().toLowerCase();
  return RULES.find(([, pattern]) => pattern.test(key))?.[0] ?? 'other';
};
export const isDistanceSport = (sport: Sport): sport is DistanceSport => (DISTANCE_SPORTS as readonly Sport[]).includes(sport);

/** 配速（秒 / 公里）；不按距离比的类型、距离或时长缺、或者超出这一类的合理范围（多半是数据坏了），就是 null。 */
export const paceOf = (workout: HandWorkout): number | null => {
  const sport = sportOf(workout.workout_type);
  const range = sport === 'hike' ? PACE_RANGES.hike : isDistanceSport(sport) ? PACE_RANGES[sport] : null;
  const km = (workout.distance_m ?? 0) / 1000;
  if (!range || km <= 0 || workout.duration_s <= 0) return null;
  const pace = workout.duration_s / km;
  return pace >= range[0] && pace <= range[1] ? pace : null;
};

/** 用户最近常练的大类，多 → 少（同样多的按最近一次在前）。 */
export const sportProfile = (workouts: readonly HandWorkout[], today: string): Sport[] => {
  const from = addDays(today, -(SPORT_PROFILE_DAYS - 1));
  const tally = new Map<Sport, { count: number; last: string }>();
  for (const workout of workouts) {
    if (workout.date < from || workout.date > today || workout.duration_s < MIN_WORKOUT_SECONDS) continue;
    const sport = sportOf(workout.workout_type);
    const entry = tally.get(sport) ?? { count: 0, last: '' };
    tally.set(sport, { count: entry.count + 1, last: workout.start_time > entry.last ? workout.start_time : entry.last });
  }
  return [...tally]
    .filter(([, entry]) => entry.count >= SPORT_MIN_SESSIONS)
    .sort(([, a], [, b]) => b.count - a.count || b.last.localeCompare(a.last))
    .map(([sport]) => sport);
};

/** 这几类里用户常练的，按画像的顺序；画像是空的就原样全给（最近没怎么动，不替他挑）。 */
export const practiced = <S extends Sport>(candidates: readonly S[], profile: readonly Sport[]): S[] => {
  if (!profile.length) return [...candidates];
  return profile.filter((sport): sport is S => (candidates as readonly Sport[]).includes(sport));
};
