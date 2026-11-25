/**
 * 「建议 → 发牌 → 交给 AI」的那一段胶水：取事实、发牌、把一手牌写进交给 AI 的任务。
 *
 * - 事实（`card_hand_facts`）一天取一次、全局共用：首页要先知道今天哪几问发得出牌，展开时又要用，不该取两遍。
 * - 牌面小图（`card_hand_lines`）只取这手牌（含候补）里还没取过的那几次；同一条路线发完先按起终点粗配，小图到了再按轨迹细筛。
 * - 写进任务：`handPicks` 算出交哪几类、哪几天、哪几次运动，走 `applyPicks`；换一张牌就再写一次（进撤销栈）。
 * - 首页「今日一问」：排序在 lib/cards/hands/rank.ts，摊牌、换牌、交出去都在首页那张卡里（SuggestCards）。
 */
import { ref, shallowRef } from 'vue';
import { backend } from '../lib/bridge';
import { useAiTaskDraft } from './useAiTaskDraft';
import {
  comeback, dealQuestion, FACT_DAYS, handPicks, ownBucketKm, ownBucketM, planTomorrow, recoveryDay, refineSameRoute, reviewWorkout, sessionReview, sportOf,
  type Hand, type Sport, type HandResult, type QuestionHandKind, type SuggestHandKind,
} from '../lib/cards/hands';
import { MAX_LINE_WORKOUTS } from '../lib/cards/hands/constants';
import type { HandFacts, HandLines, Suggestion } from '../types/hands';
import { formatDistance } from '../lib/format';
import { workoutLabel } from '../lib/labels';
import { displayDateTimeFormatter, parseDisplayDate } from '../lib/dateTime';
import type { useHandsText } from '../components/cards/hands.i18n';

type HandsText = ReturnType<typeof useHandsText>['value'];
export type HandKind = QuestionHandKind | SuggestHandKind;

const facts = shallowRef<HandFacts | null>(null);
const lines = ref<Record<string, HandLines>>({});
const loading = ref(false);
const failed = ref(false);
let inflight: Promise<HandFacts | null> | null = null;

const localToday = () => {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
};

/** 取事实：同一天里取过就直接用；`fresh` 时重取（刚同步完、刚从首页点进来）。 */
const loadFacts = async (fresh = false): Promise<HandFacts | null> => {
  if (!fresh && facts.value?.today === localToday()) return facts.value;
  if (inflight) return inflight;
  loading.value = true;
  failed.value = false;
  inflight = backend.cardHandFacts(FACT_DAYS)
    .then((value) => { facts.value = value; return value; })
    .catch(() => { failed.value = true; return null; })
    .finally(() => { loading.value = false; inflight = null; });
  return inflight;
};

/** 这手牌（含候补）里还没取过小图的几次运动。 */
const loadLines = async (hand: Hand): Promise<void> => {
  const ids = [...hand.cards, ...hand.bench]
    .flatMap((card) => (card.kind === 'workout' ? [card.workout.workout_id] : []))
    .filter((id) => !(id in lines.value))
    .slice(0, MAX_LINE_WORKOUTS);
  if (!ids.length) return;
  try {
    const got = await backend.cardHandLines(ids);
    const next = { ...lines.value };
    for (const id of ids) next[id] = got.find((line) => line.workout_id === id) ?? { workout_id: id, route: [], hr: [] };
    lines.value = next;
  } catch {
    // 小图只是锦上添花：取不到就不画。
  }
};

/** 发一手牌。首页那几种要带上触发它的那张建议卡。 */
const dealHand = (kind: HandKind, from: HandFacts, suggestion: Suggestion | null = null): HandResult => {
  switch (kind) {
    case 'review_workout':
      return suggestion?.code === 'workout_done' ? reviewWorkout(from, suggestion.workout_id, suggestion.same_type_ids) : { ok: false, kind, reason: 'no_data' };
    case 'recovery_day':
      return recoveryDay(from, suggestion?.code === 'sleep_poor' ? suggestion.night : from.today);
    case 'comeback':
      return comeback(from);
    case 'plan_tomorrow':
      return planTomorrow(from);
    case 'session_review':
      return sessionReview(from);
    default:
      return dealQuestion(kind, from);
  }
};

/** 同一条路线：小图到了以后按轨迹细筛；细筛完不够一手就留着粗配的那一手。 */
const refineRoute = async (result: HandResult): Promise<HandResult> => {
  if (!result.ok || result.hand.kind !== 'same_route') return result;
  await loadLines(result.hand);
  const refined = refineSameRoute(result, Object.values(lines.value));
  return refined.ok ? refined : result;
};

/** 距离段写成字：标准段用名字（5K、半马…），自己常练的距离写成距离（整数不带「.00」）。 */
const bucketLabel = (key: unknown, t: HandsText): string => {
  const km = ownBucketKm(String(key));
  const m = km !== null ? km * 1000 : ownBucketM(String(key));
  if (m !== null) return formatDistance(m).replace(/[.,]0+(?=\s)/, '');
  return t.bucket[key as keyof HandsText['bucket']] ?? String(key);
};

/**
 * 这一手牌围着哪一类运动：锚点、比赛、PR 那张（没有就第一张运动牌）。问题、图标都按它说，不默认是跑步；
 * 题目里的日期和项目都取自这同一次运动，不会写成「那天的骑行」而那天其实是跑步。
 */
export const handWorkout = (hand: Hand) => {
  const workouts = [...hand.cards, ...hand.bench].filter((card) => card.kind === 'workout');
  const main = workouts.find((card) => card.role === 'anchor' || card.role === 'race' || card.role === 'pr') ?? workouts[0];
  return main?.kind === 'workout' ? main.workout : null;
};
export const handSport = (hand: Hand): Sport | null => {
  const workout = handWorkout(hand);
  return workout ? sportOf(workout.workout_type) : null;
};
const STRENGTH_LIKE: ReadonlySet<Sport> = new Set(['strength']);

const md = (date: string) => displayDateTimeFormatter({ month: 'numeric', day: 'numeric' }).format(parseDisplayDate(date));

/** 这一手交给 AI 时带的模板问题（界面语言）。 */
export const handQuestion = (hand: Hand, t: HandsText, suggestion: Suggestion | null = null): string => {
  const q = t.question;
  const p = hand.params as Record<string, unknown>;
  switch (hand.kind) {
    case 'distance_best': {
      const bucket = bucketLabel(p.bucket, t);
      const sport = handSport(hand);
      return sport === 'ride' ? q.distanceBestRide(bucket) : sport === 'swim' ? q.distanceBestSwim(bucket) : q.distance_best(bucket);
    }
    case 'same_route': {
      const km = formatDistance(Number(p.km) * 1000);
      const sport = handSport(hand);
      return sport === 'ride' ? q.sameRouteRide(km) : sport === 'hike' ? q.sameRouteHike(km) : q.same_route(km);
    }
    case 'race_review': {
      const race = handWorkout(hand);
      return !race || sportOf(race.workout_type) === 'run' ? q.race_review(md(String(p.date))) : q.raceReviewAny(md(race.date), workoutLabel(race.workout_type));
    }
    case 'session_review': {
      const what = workoutLabel(String(p.type));
      const count = Number(p.count) || hand.cards.length;
      return STRENGTH_LIKE.has(sportOf(String(p.type))) ? q.sessionStrength(what, count) : q.sessionReview(what, count);
    }
    case 'recovery_nights': return q.recovery_nights;
    case 'review_workout': return q.review_workout;
    case 'recovery_day': return q.recovery_day;
    case 'comeback': return q.comeback(suggestion?.code === 'long_idle' ? suggestion.days : Math.max(1, Number(p.days ?? 0)));
    default: return q.plan_tomorrow(md(String(p.tomorrow)));
  }
};

/** 发牌桌标题下那一行：这一手是哪个距离段、哪条路线、哪一场。 */
export const handSubtitle = (hand: Hand, t: HandsText): string | null => {
  const p = hand.params as Record<string, unknown>;
  switch (hand.kind) {
    case 'distance_best': return bucketLabel(p.bucket, t);
    case 'same_route': return formatDistance(Number(p.km) * 1000);
    case 'race_review': return md(String(p.date));
    case 'recovery_nights': return t.kindSub.recovery_nights;
    case 'plan_tomorrow': return md(String(p.tomorrow));
    case 'session_review': return workoutLabel(String(p.type));
    default: return null;
  }
};

export const useHandDeal = () => {
  const ctl = useAiTaskDraft();

  /** 把一手牌写进任务（交哪几类、哪几天、哪几次运动）。抽掉的运动从 workout_ids 里拿掉。 */
  const applyHand = (hand: Hand) => {
    const today = facts.value?.today ?? localToday();
    const picks = handPicks(hand);
    ctl.applyPicks(picks.byCategory, today, picks.workoutIds);
    const keep = new Set(picks.workoutIds);
    for (const id of ctl.draft.value.workout_ids) if (!keep.has(id)) ctl.setWorkoutSelected(id, false);
  };

  /** 从一手牌起一份新任务：清空 → 交这手牌 → 写上模板问题。 */
  const startTask = (hand: Hand, question: string) => {
    ctl.resetDraft();
    applyHand(hand);
    ctl.setPrompt(question);
  };

  return { facts, lines, loading, failed, loadFacts, loadLines, dealHand, refineRoute, applyHand, startTask };
};
