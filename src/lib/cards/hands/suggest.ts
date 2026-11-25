/**
 * 首页建议卡点进来的几手牌：复盘这次、排个恢复日、排个轻松的回归、帮我排明天、最近几次同类训练。
 * 和「按问题发牌」同一套牌的形状，交给 AI 的时候也走同一条路（toTask.ts）。
 */
import { COMEBACK_LAST, COMEBACK_SPAN_DAYS, RECENT_DAYS, SESSION_DAYS, SESSION_KEEP, SESSION_MIN } from './constants';
import { DISTANCE_SPORTS, sportOf, sportProfile, type Sport } from './sport';
import type { HandFacts, HandResult, HandWorkout } from './types';
import { addDays, familyOf, finishHand, nightCard, substantial, workoutCard } from './util';

const RECOVERY_CATEGORIES = ['sleep', 'recovery', 'resting_hr'] as const;

/** 「复盘这次」：这一次 + 同类最近几次（后端给了就按后端的，没给就自己找同一大类的最近几次）。 */
export const reviewWorkout = (facts: HandFacts, workoutId: string, sameTypeIds: string[] = []): HandResult => {
  const anchor = facts.workouts.find((w) => w.workout_id === workoutId);
  if (!anchor) return { ok: false, kind: 'review_workout', reason: 'no_data' };
  const byId = new Map(facts.workouts.map((w) => [w.workout_id, w]));
  const given = sameTypeIds.map((id) => byId.get(id)).filter((w): w is HandWorkout => !!w);
  const family = familyOf(anchor.workout_type);
  const others = facts.workouts
    .filter((w) => w.workout_id !== anchor.workout_id && substantial(w) && familyOf(w.workout_type) === family && w.start_time < anchor.start_time)
    .reverse();
  const same = given.length ? given : others.slice(0, 4);
  return {
    ok: true,
    hand: finishHand(
      { kind: 'review_workout', span: { from: addDays(anchor.date, -(RECENT_DAYS - 1)), to: anchor.date, categories: [...RECOVERY_CATEGORIES] }, params: { date: anchor.date, type: anchor.workout_type } },
      [workoutCard(anchor, 'anchor'), ...same.map((w) => workoutCard(w, 'same'))],
      others.filter((w) => !same.includes(w)).map((w) => workoutCard(w, 'same')),
    ),
  };
};

/** 最近 `days` 天（含今天）里够长的运动，新 → 旧。 */
const recentWorkouts = (facts: HandFacts, days: number) => {
  const from = addDays(facts.today, -(days - 1));
  return facts.workouts.filter((w) => w.date >= from && substantial(w)).reverse();
};

/** 「排个恢复日」：昨晚 + 前几晚，加上最近三天的运动；近一周的恢复读数一起交。 */
export const recoveryDay = (facts: HandFacts, night: string): HandResult => {
  const from = addDays(facts.today, -(RECENT_DAYS - 1));
  const nights = facts.nights.filter((n) => n.date >= from && n.date <= night && n.duration_min !== null).reverse();
  if (!nights.length) return { ok: false, kind: 'recovery_day', reason: 'no_data' };
  const [last, ...earlier] = nights;
  return {
    ok: true,
    hand: finishHand(
      { kind: 'recovery_day', span: { from, to: facts.today, categories: [...RECOVERY_CATEGORIES] }, params: { night } },
      [nightCard(last!, 'anchor'), ...recentWorkouts(facts, 3).map((w) => workoutCard(w, 'recent')), ...earlier.slice(0, 3).map((n) => nightCard(n, 'night'))],
      earlier.slice(3).map((n) => nightCard(n, 'night')),
    ),
  };
};

/** 「排个轻松的回归」：空档前最后几次 + 最近两周的恢复。 */
export const comeback = (facts: HandFacts): HandResult => {
  const done = facts.workouts.filter(substantial).reverse();
  if (!done.length) return { ok: false, kind: 'comeback', reason: 'no_data' };
  return {
    ok: true,
    hand: finishHand(
      { kind: 'comeback', span: { from: addDays(facts.today, -(COMEBACK_SPAN_DAYS - 1)), to: facts.today, categories: [...RECOVERY_CATEGORIES] }, params: { last: done[0]!.date } },
      done.slice(0, COMEBACK_LAST).map((w, i) => workoutCard(w, i === 0 ? 'anchor' : 'recent')),
      done.slice(COMEBACK_LAST).map((w) => workoutCard(w, 'recent')),
    ),
  };
};

/** 「帮我排明天」：近 7 天的运动当牌，近 7 天的恢复、负荷一起交；问题里写明只排明天那一天。 */
export const planTomorrow = (facts: HandFacts): HandResult => {
  const workouts = recentWorkouts(facts, RECENT_DAYS);
  const from = addDays(facts.today, -(RECENT_DAYS - 1));
  const lastNight = [...facts.nights].reverse().find((n) => n.date >= from && n.duration_min !== null);
  const cards = [...(lastNight ? [nightCard(lastNight, 'night')] : []), ...workouts.map((w) => workoutCard(w, 'recent'))];
  if (!cards.length) return { ok: false, kind: 'plan_tomorrow', reason: 'no_data' };
  return {
    ok: true,
    hand: finishHand(
      { kind: 'plan_tomorrow', span: { from, to: facts.today, categories: [...RECOVERY_CATEGORIES, 'training'] }, params: { tomorrow: addDays(facts.today, 1) } },
      cards,
    ),
  };
};

/** 不按距离比的几类（力量、拉伸、球类、操课……）。跑、骑、游有同距离段，徒步有同一条路线。 */
const SESSION_SPORTS: readonly Sport[] = ['strength', 'mobility', 'other'];

/**
 * 「最近的 X 练得怎么样」：没有距离可比的运动，按一次次的时长、心率、负荷比。
 * 练哪一种：最近 `SESSION_DAYS` 天里这几类中次数最多的那一个类型（同样多取最近练的），至少 `SESSION_MIN` 次；
 * 而且这一大类得是用户常练的（画像里有，或者画像里压根没有跑、骑、游——不给天天跑步的人问他偶尔一次的瑜伽）。
 */
export const sessionReview = (facts: HandFacts): HandResult => {
  const profile = sportProfile(facts.workouts, facts.today);
  const allowed = SESSION_SPORTS.filter((sport) => profile.includes(sport) || !profile.some((one) => (DISTANCE_SPORTS as readonly Sport[]).includes(one)));
  const from = addDays(facts.today, -(SESSION_DAYS - 1));
  const tally = new Map<string, HandWorkout[]>();
  for (const w of facts.workouts) {
    if (w.date < from || !substantial(w) || !allowed.includes(sportOf(w.workout_type))) continue;
    tally.set(w.workout_type, [...(tally.get(w.workout_type) ?? []), w]);
  }
  const picked = [...tally.values()]
    .filter((list) => list.length >= SESSION_MIN)
    .sort((a, b) => b.length - a.length || b[b.length - 1]!.start_time.localeCompare(a[a.length - 1]!.start_time))[0];
  if (!picked) return { ok: false, kind: 'session_review', reason: 'no_data' };
  const newest = [...picked].reverse();
  const kept = newest.slice(0, SESSION_KEEP);
  const first = kept[kept.length - 1]!.date;
  return {
    ok: true,
    hand: finishHand(
      { kind: 'session_review', span: { from: first, to: facts.today, categories: [...RECOVERY_CATEGORIES] }, params: { type: picked[0]!.workout_type, count: picked.length } },
      kept.map((w, i) => workoutCard(w, i === 0 ? 'anchor' : 'recent')),
      newest.slice(SESSION_KEEP).map((w) => workoutCard(w, 'same')),
    ),
  };
};
