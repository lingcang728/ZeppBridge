/**
 * 「建议 → 发牌 → 交给 AI」的那一段胶水：取事实、发牌、把一手牌写进交给 AI 的任务。
 *
 * - 事实（`card_hand_facts`）一天取一次、全局共用：按问题发牌的四个入口要先知道哪几个发得出牌，点进去又要发，不该取两遍。
 * - 牌面小图（`card_hand_lines`）只取这手牌（含候补）里还没取过的那几次；同一条路线发完先按起终点粗配，小图到了再按轨迹细筛。
 * - 写进任务：`handPicks` 算出交哪几类、哪几天、哪几次运动，走 `applyPicks`；换一张牌就再写一次（进撤销栈）。
 * - 首页建议卡点进来：先发好牌、写进任务，`queueHandDeal` 记下这一手，再跳到交给 AI 主面板，由那边摆上发牌桌（`takeHandDeal`）。
 */
import { ref, shallowRef } from 'vue';
import { backend } from '../lib/bridge';
import { useAiTaskDraft } from './useAiTaskDraft';
import {
  comeback, dealQuestion, FACT_DAYS, handPicks, planTomorrow, recoveryDay, refineSameRoute, reviewWorkout,
  type Hand, type HandResult, type QuestionHandKind, type SuggestHandKind,
} from '../lib/cards/hands';
import { MAX_LINE_WORKOUTS } from '../lib/cards/hands/constants';
import type { HandFacts, HandLines, Suggestion } from '../types/hands';
import { formatDistance } from '../lib/format';
import { displayDateTimeFormatter, parseDisplayDate } from '../lib/dateTime';
import type { useHandsText } from '../components/cards/hands.i18n';

type HandsText = ReturnType<typeof useHandsText>['value'];
export type HandKind = QuestionHandKind | SuggestHandKind;

/** 首页建议卡交过来的、已经发好并写进任务的一手牌：交给 AI 主面板落地后把它摆上发牌桌。 */
export interface PendingDeal {
  hand: Hand;
  suggestion: Suggestion | null;
}

const pending = shallowRef<PendingDeal | null>(null);
export const queueHandDeal = (deal: PendingDeal) => { pending.value = deal; };
export const takeHandDeal = (): PendingDeal | null => {
  const deal = pending.value;
  pending.value = null;
  return deal;
};

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

const md = (date: string) => displayDateTimeFormatter({ month: 'numeric', day: 'numeric' }).format(parseDisplayDate(date));

/** 这一手交给 AI 时带的模板问题（界面语言）。 */
export const handQuestion = (hand: Hand, t: HandsText, suggestion: Suggestion | null = null): string => {
  const q = t.question;
  const p = hand.params as Record<string, unknown>;
  switch (hand.kind) {
    case 'distance_best': return q.distance_best(t.bucket[p.bucket as keyof HandsText['bucket']] ?? String(p.bucket));
    case 'same_route': return q.same_route(formatDistance(Number(p.km) * 1000));
    case 'race_review': return q.race_review(md(String(p.date)));
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
    case 'distance_best': return t.bucket[p.bucket as keyof HandsText['bucket']] ?? null;
    case 'same_route': return formatDistance(Number(p.km) * 1000);
    case 'race_review': return md(String(p.date));
    case 'recovery_nights': return t.kindSub.recovery_nights;
    case 'plan_tomorrow': return md(String(p.tomorrow));
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
