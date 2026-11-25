/**
 * 「按问题发牌」的四种牌型：同一路线的历次、同距离段 / 刷新 PR、比赛复盘、恢复异常夜。
 *
 * 用户提问的方式是「我最近跑步进步了吗」「上次比赛前练得怎么样」，不是「哪一次」——
 * 所以按问题挑牌，挑出来的一手牌摊在桌上，用户只需要抽掉或换一张。阈值在 constants.ts。
 */
import {
  OWN_BUCKET_MIN_KM, DISTANCE_BUCKETS, DISTANCE_MIN_RUNS, DISTANCE_RECENT, HRV_LOW_RATIO, OUTLIER_BASELINE_DAYS, OUTLIER_BASELINE_MIN, OUTLIER_KEEP,
  OUTLIER_LOOKBACK_DAYS, PR_KEEP, RACE_BASELINE_DAYS, RACE_BASELINE_MIN, RACE_LEAD_DAYS, RACE_MIN_KM_BY_SPORT, RACE_SPEED_RATIO, RHR_HIGH_BPM,
  RIDE_BUCKET_KM, RIDE_BUCKET_MIN_KM, ROUTE_ANCHOR_SCAN, ROUTE_DISTANCE_RATIO, ROUTE_END_METERS, ROUTE_MIN_RUNS, ROUTE_TRACK_METERS, SLEEP_SHORT_RATIO,
  SWIM_BUCKET_M, SWIM_BUCKET_MIN_M,
} from './constants';
import type { HandCard, HandFacts, HandLines, HandNight, HandResult, HandWorkout, NightFlag } from './types';
import { addDays, dayDiff, familyOf, finishHand, haversine, mean, median, nightCard, paceOf, substantial, workoutCard } from './util';
import { DISTANCE_SPORTS, isDistanceSport, practiced, ROUTE_SPORTS, sportOf, sportProfile, type DistanceSport } from './sport';

/* —————————— 同一路线的历次 —————————— */

/** 两次运动起终点、距离都对得上（轨迹还要等小图来了再细筛，见 refineSameRoute）。 */
export const sameRouteRough = (a: HandWorkout, b: HandWorkout): boolean => {
  if (!a.start || !a.end || !b.start || !b.end || !a.distance_m || !b.distance_m) return false;
  if (familyOf(a.workout_type) !== familyOf(b.workout_type)) return false;
  if (Math.abs(a.distance_m - b.distance_m) / a.distance_m > ROUTE_DISTANCE_RATIO) return false;
  return haversine(a.start, b.start) <= ROUTE_END_METERS && haversine(a.end, b.end) <= ROUTE_END_METERS;
};

/** 两条轨迹缩略的相似度：双向「每个点到另一条最近点」的平均距离（米）。越小越像；任何一条没有点就是 Infinity。 */
export const trackDistance = (a: ReadonlyArray<readonly [number, number]>, b: ReadonlyArray<readonly [number, number]>): number => {
  if (!a.length || !b.length) return Infinity;
  const oneWay = (from: typeof a, to: typeof b) => from.reduce((sum, p) => sum + Math.min(...to.map((q) => haversine(p, q))), 0) / from.length;
  return (oneWay(a, b) + oneWay(b, a)) / 2;
};

/** 同一条路线：只在跑、骑、徒步里，且是用户常练的那几类（画像是空的就不限）；指定了锚点就照它。 */
export const sameRoute = (facts: HandFacts, anchorId?: string | null): HandResult => {
  const sports = anchorId ? ROUTE_SPORTS : practiced(ROUTE_SPORTS, sportProfile(facts.workouts, facts.today));
  const routed = facts.workouts.filter((w) => w.start && w.end && w.distance_m && substantial(w) && sports.includes(sportOf(w.workout_type)));
  const newest = [...routed].reverse();
  const groupOf = (anchor: HandWorkout) => newest.filter((w) => w.workout_id !== anchor.workout_id && sameRouteRough(anchor, w));
  // 锚点：指定的那一次；否则最近一次「这条路线跑过至少三次」的；都没有就取同路线最多的那次。
  let anchor = anchorId ? routed.find((w) => w.workout_id === anchorId) ?? null : null;
  let group = anchor ? groupOf(anchor) : [];
  if (!anchor) {
    let best: { anchor: HandWorkout; group: HandWorkout[] } | null = null;
    for (const candidate of newest.slice(0, ROUTE_ANCHOR_SCAN)) {
      const found = groupOf(candidate);
      if (found.length + 1 >= ROUTE_MIN_RUNS) { best = { anchor: candidate, group: found }; break; }
      if (found.length && (!best || found.length > best.group.length)) best = { anchor: candidate, group: found };
    }
    anchor = best?.anchor ?? null;
    group = best?.group ?? [];
  }
  if (!anchor || !group.length) return { ok: false, kind: 'same_route', reason: 'no_routes' };
  const cards = [workoutCard(anchor, 'anchor'), ...group.map((w) => workoutCard(w, 'same'))];
  return {
    ok: true,
    hand: finishHand({ kind: 'same_route', span: null, params: { km: Math.round((anchor.distance_m ?? 0) / 100) / 10, count: group.length + 1, anchor: anchor.workout_id } }, cards),
  };
};

/** 小图到了：轨迹对不上锚点的从主牌挪进候补（起终点相同、中间走了另一条路的不算同一路线）。 */
export const refineSameRoute = (hand: HandResult & { ok: true }, lines: HandLines[]): HandResult => {
  const routeOf = new Map(lines.map((line) => [line.workout_id, line.route]));
  const anchor = hand.hand.cards.find((card) => card.role === 'anchor');
  const anchorRoute = anchor?.kind === 'workout' ? routeOf.get(anchor.workout.workout_id) : undefined;
  if (!anchor || !anchorRoute?.length) return hand;
  const off = (card: HandCard) => {
    if (card.kind !== 'workout' || card.role === 'anchor') return false;
    const route = routeOf.get(card.workout.workout_id);
    return !!route?.length && trackDistance(anchorRoute, route) > ROUTE_TRACK_METERS;
  };
  const kept = hand.hand.cards.filter((card) => !off(card));
  if (kept.length < 2) return { ok: false, kind: 'same_route', reason: 'no_routes' };
  return { ok: true, hand: { ...hand.hand, cards: kept, bench: hand.hand.bench.filter((card) => !off(card)), params: { ...hand.hand.params, count: kept.length } } };
};

/* —————————— 同距离段 / 刷新 PR —————————— */

export const bucketOf = (workout: HandWorkout) => {
  const km = (workout.distance_m ?? 0) / 1000;
  return DISTANCE_BUCKETS.find((bucket) => km >= bucket.min && km <= bucket.max) ?? null;
};

/** 自己常跑的整公里数这一段的键：`km:15`。界面按它写「15 公里」。 */
export const ownBucketKm = (key: string): number | null => (key.startsWith('km:') ? Number(key.slice(3)) : null);

const groupBy = (runs: HandWorkout[], keyOf: (run: HandWorkout) => string | null) => {
  const byBucket = new Map<string, HandWorkout[]>();
  for (const run of runs) {
    const key = keyOf(run);
    if (key) byBucket.set(key, [...(byBucket.get(key) ?? []), run]);
  }
  return [...byBucket].filter(([, list]) => list.length >= DISTANCE_MIN_RUNS);
};

/** 游泳自己常游的距离这一段的键：`m:1500`。 */
export const ownBucketM = (key: string): number | null => (key.startsWith('m:') ? Number(key.slice(2)) : null);

/** 每一类怎么分距离段：先按标准段（只有跑步有），凑不够再按自己常练的距离分。 */
const BUCKETS: Record<DistanceSport, Array<(workout: HandWorkout) => string | null>> = {
  run: [
    (run) => bucketOf(run)?.key ?? null,
    (run) => { const km = (run.distance_m ?? 0) / 1000; return km >= OWN_BUCKET_MIN_KM ? `km:${Math.round(km)}` : null; },
  ],
  ride: [(ride) => { const km = (ride.distance_m ?? 0) / 1000; return km >= RIDE_BUCKET_MIN_KM ? `km:${Math.round(km / RIDE_BUCKET_KM) * RIDE_BUCKET_KM}` : null; }],
  swim: [(swim) => { const m = swim.distance_m ?? 0; return m >= SWIM_BUCKET_MIN_M ? `m:${Math.round(m / SWIM_BUCKET_M) * SWIM_BUCKET_M}` : null; }],
};

const bestIn = (facts: HandFacts, sport: DistanceSport): HandResult => {
  const done = facts.workouts.filter((w) => sportOf(w.workout_type) === sport && paceOf(w) !== null);
  let usable: Array<[string, HandWorkout[]]> = [];
  for (const keyOf of BUCKETS[sport]) {
    usable = groupBy(done, keyOf);
    if (usable.length) break;
  }
  if (!usable.length) return { ok: false, kind: 'distance_best', reason: 'no_distance' };
  // 哪一段：最近一次练的那一段（够两次的里面）；两段同一天就取次数多的。
  usable.sort(([, a], [, b]) => b[b.length - 1]!.start_time.localeCompare(a[a.length - 1]!.start_time) || b.length - a.length);
  const [key, list] = usable[0]!;
  // PR 链：按时间往后走，每刷新一次最好配速记一张。
  const chain: HandWorkout[] = [];
  let best = Infinity;
  for (const one of list) {
    const pace = paceOf(one)!;
    if (pace < best) { best = pace; chain.push(one); }
  }
  const prs = chain.slice(-PR_KEEP);
  const prIds = new Set(prs.map((one) => one.workout_id));
  const recent = list.slice(-DISTANCE_RECENT).filter((one) => !prIds.has(one.workout_id));
  const cards = [...prs.map((one) => workoutCard(one, 'pr', key)), ...recent.map((one) => workoutCard(one, 'recent', key))];
  const rest = list.filter((one) => !prIds.has(one.workout_id) && !recent.includes(one)).map((one) => workoutCard(one, 'same', key));
  return { ok: true, hand: finishHand({ kind: 'distance_best', span: null, params: { bucket: key, count: list.length, best: Math.round(best), sport } }, cards, rest) };
};

/**
 * 同距离段 / 刷 PR：跑、骑、游里用户常练的那几类，按画像的顺序找第一类凑得出一段的（`sport` 给了就只看那一类）。
 * 跑步先找 5K、10K、半马、全马，一段都凑不够两次（有人几乎只跑 15 公里）就按自己常跑的整公里数分段；
 * 骑行按 5 公里一档、游泳按 100 米一档。不发空牌，也不问一个用户不练的项目。
 */
export const distanceBest = (facts: HandFacts, sport?: DistanceSport): HandResult => {
  const order = sport ? [sport] : practiced(DISTANCE_SPORTS, sportProfile(facts.workouts, facts.today));
  for (const one of order) {
    const result = bestIn(facts, one);
    if (result.ok) return result;
  }
  return { ok: false, kind: 'distance_best', reason: 'no_distance' };
};

/* —————————— 比赛复盘 —————————— */

/** 像比赛的一次：比赛记录里挂了它；或者配速比此前 90 天同类中位数快 8% 以上、距离够长。 */
export const raceLike = (workout: HandWorkout, all: HandWorkout[]): boolean => {
  if (workout.race) return true;
  // 没标比赛：只在按距离比快慢的几类里按配速猜，而且要够长（短途通勤骑得快不算比赛）。
  const sport = sportOf(workout.workout_type);
  if (!isDistanceSport(sport)) return false;
  const pace = paceOf(workout);
  if (pace === null || (workout.distance_m ?? 0) / 1000 < RACE_MIN_KM_BY_SPORT[sport]) return false;
  const family = familyOf(workout.workout_type);
  const since = addDays(workout.date, -RACE_BASELINE_DAYS);
  const before = all
    .filter((w) => w.workout_id !== workout.workout_id && familyOf(w.workout_type) === family && w.date >= since && w.start_time < workout.start_time)
    .map(paceOf).filter((p): p is number => p !== null);
  if (before.length < RACE_BASELINE_MIN) return false;
  const usual = median(before)!;
  return usual / pace >= RACE_SPEED_RATIO;
};

export const raceReview = (facts: HandFacts, raceId?: string | null): HandResult => {
  const race = raceId
    ? facts.workouts.find((w) => w.workout_id === raceId) ?? null
    : [...facts.workouts].reverse().find((w) => raceLike(w, facts.workouts)) ?? null;
  if (!race) return { ok: false, kind: 'race_review', reason: 'no_race' };
  const from = addDays(race.date, -RACE_LEAD_DAYS);
  const build = facts.workouts.filter((w) => w.workout_id !== race.workout_id && substantial(w) && w.date >= from && w.start_time < race.start_time);
  // 赛前的课挑「分量最重」的几次（负荷 / 时长），其余进候补。
  const weight = (w: HandWorkout) => w.training_load ?? w.duration_s / 60;
  const ranked = [...build].sort((a, b) => weight(b) - weight(a));
  return {
    ok: true,
    hand: finishHand(
      { kind: 'race_review', span: { from, to: race.date, categories: ['sleep', 'recovery', 'resting_hr', 'training'] }, params: { date: race.date, days: RACE_LEAD_DAYS, marked: race.race ? 1 : 0, race: race.workout_id } },
      [workoutCard(race, 'race'), ...ranked.map((w) => workoutCard(w, 'build'))],
    ),
  };
};

/* —————————— 恢复异常夜 —————————— */

/** 一晚偏离了哪几项（和它之前 28 晚比；某一项基线不足 7 晚就不判那一项）。 */
export const nightFlags = (night: HandNight, nights: HandNight[]): NightFlag[] => {
  const from = addDays(night.date, -OUTLIER_BASELINE_DAYS);
  const before = nights.filter((n) => n.date >= from && n.date < night.date);
  const base = (pick: (n: HandNight) => number | null) => {
    const values = before.map(pick).filter((v): v is number => v !== null && Number.isFinite(v));
    return values.length >= OUTLIER_BASELINE_MIN ? mean(values) : null;
  };
  const flags: NightFlag[] = [];
  const hrv = base((n) => n.hrv);
  if (night.hrv !== null && hrv !== null && night.hrv < hrv * HRV_LOW_RATIO) flags.push('hrv_low');
  const rhr = base((n) => n.resting_hr);
  if (night.resting_hr !== null && rhr !== null && night.resting_hr > rhr + RHR_HIGH_BPM) flags.push('rhr_high');
  const sleep = base((n) => n.duration_min);
  if (night.duration_min !== null && sleep !== null && night.duration_min < sleep * SLEEP_SHORT_RATIO) flags.push('sleep_short');
  return flags;
};

export const recoveryNights = (facts: HandFacts): HandResult => {
  const since = addDays(facts.today, -OUTLIER_LOOKBACK_DAYS);
  const flagged = facts.nights
    .filter((n) => n.date >= since)
    .map((night) => ({ night, flags: nightFlags(night, facts.nights) }))
    .filter((one) => one.flags.length)
    // 偏离项多的在前，同样多的取近的。
    .sort((a, b) => b.flags.length - a.flags.length || b.night.date.localeCompare(a.night.date));
  if (!flagged.length) return { ok: false, kind: 'recovery_nights', reason: 'no_outliers' };
  // 每一晚只带前一天分量最重（最长）的那次运动上主牌；同一天的其余几次进候补——主牌留给那几晚本身。
  const dayBefore = (date: string) => facts.workouts
    .filter((w) => w.date === addDays(date, -1) && substantial(w))
    .sort((a, b) => b.duration_s - a.duration_s);
  const keep = flagged.slice(0, OUTLIER_KEEP);
  const main = keep.flatMap(({ night, flags }) => [nightCard(night, 'outlier', flags), ...dayBefore(night.date).slice(0, 1).map((w) => workoutCard(w, 'day_before'))]);
  const bench = [
    ...keep.flatMap(({ night }) => dayBefore(night.date).slice(1).map((w) => workoutCard(w, 'day_before'))),
    ...flagged.slice(OUTLIER_KEEP).map(({ night, flags }) => nightCard(night, 'outlier', flags)),
  ];
  return {
    ok: true,
    hand: finishHand({ kind: 'recovery_nights', span: null, params: { count: flagged.length, days: OUTLIER_LOOKBACK_DAYS } }, main, bench),
  };
};

/** 两个日子之间相差几天（导出给界面写「赛前 N 天」之类）。 */
export { dayDiff };
