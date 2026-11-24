/**
 * 首页建议卡点进来的几手牌：复盘这次、排个恢复日、排个轻松的回归、帮我排明天。
 * 和「按问题发牌」同一套牌的形状，交给 AI 的时候也走同一条路（toTask.ts）。
 */
import { COMEBACK_LAST, COMEBACK_SPAN_DAYS, RECENT_DAYS } from './constants';
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
