/**
 * 跑后打分（批次 7）：概览上那张轻卡的状态。
 *
 * - 问哪一条由后端定（48 小时内、对得上推到手表的计划、没打过也没关掉，最多一条）；同步落地后重读。
 * - 拨到哪一档就存哪一档，标签点一下也立刻存：没有「提交」这一步，关掉卡片不会丢。
 * - 打完分卡片留着，换成「记下了」那一行（加标签、改计划、太难时减 10%），用户点「好」才收起。
 * - 「太难」→ 下次同类减 10%：和「换成轻松跑」同一条路——改成草稿，由用户在周视图长按发出。
 *
 * 全局单例：概览离开再回来，打到一半的状态还在。
 */
import { ref } from 'vue';
import { backend, isDesktop } from '../lib/bridge';
import { dayKey } from '../lib/aiTask/bridgeScale';
import { today as currentToday } from '../lib/currentDay';
import { lighterNext, type LighterNote } from '../lib/trainingPlan/lighten';
import type { FeedbackPrompt, FeedbackRating, FeedbackTag } from '../types/feedback';
import { useTrainingPlan } from './useTrainingPlan';

const prompt = ref<FeedbackPrompt | null>(null);
const rating = ref<FeedbackRating | null>(null);
const tags = ref<FeedbackTag[]>([]);
/** 这一条已经因为打分改过计划（减 10% 起草好了）。 */
const adjusted = ref(false);
const busy = ref(false);
let loadSeq = 0;

export type LightenResult = 'drafted' | 'no_plan' | 'nothing_next' | 'busy';

const reset = () => { rating.value = null; tags.value = []; adjusted.value = false; };

export const useWorkoutFeedback = () => {
  const plan = useTrainingPlan();

  /** 打了分、还没点「好」的卡不被重读冲掉。 */
  const load = async () => {
    if (!isDesktop() || rating.value !== null) return;
    const mine = ++loadSeq;
    try {
      const next = await backend.workoutFeedbackPrompt();
      if (mine !== loadSeq || rating.value !== null) return;
      if (next?.actual.workout_id !== prompt.value?.actual.workout_id) reset();
      prompt.value = next;
    } catch {
      // 读不到就不问：这张卡不是必需的。
    }
  };

  const save = async () => {
    const current = prompt.value;
    if (!current || rating.value === null) return;
    busy.value = true;
    try {
      await backend.workoutFeedbackSave({ workout_id: current.actual.workout_id, rating: rating.value, tags: tags.value });
    } finally {
      busy.value = false;
    }
  };

  const rate = async (value: FeedbackRating) => {
    rating.value = value;
    await save();
  };

  const toggleTag = async (tag: FeedbackTag) => {
    tags.value = tags.value.includes(tag) ? tags.value.filter((t) => t !== tag) : [...tags.value, tag];
    if (rating.value !== null) await save();
  };

  /** 打完分点「好」：收起，下一次按后端说的来。 */
  const close = () => {
    prompt.value = null;
    reset();
    void load();
  };

  /** 没打就关掉：这一条不再问。 */
  const dismiss = async () => {
    const current = prompt.value;
    if (!current) return;
    prompt.value = null;
    reset();
    try { await backend.workoutFeedbackDismiss(current.actual.workout_id); } catch { /* 下次再问一遍也无妨 */ }
  };

  /** 这周别问（到下周一）。 */
  const snooze = async () => {
    prompt.value = null;
    reset();
    try { await backend.workoutFeedbackSnooze(); } catch { /* 同上 */ }
  };

  /** 下次同类减 10%：改成草稿，返回结果让界面决定去不去周视图。 */
  const lighten = async (note: LighterNote): Promise<LightenResult> => {
    const current = prompt.value;
    if (!current || plan.busy.value) return 'busy';
    if (!plan.state.value) await plan.load();
    const today = dayKey(currentToday());
    if (!plan.document.value && !(await plan.editActive(today))) return 'no_plan';
    const doc = plan.document.value;
    if (!doc || !plan.accepted.value) return 'busy';
    const next = lighterNext(doc, current.planned.sport, current.date, note);
    if (!next) return 'nothing_next';
    await plan.reshape(next.document);
    adjusted.value = true;
    try { await backend.workoutFeedbackAdjusted(current.actual.workout_id, 'lighter_10'); } catch { /* 草稿已经改好，记不上只是少一条备注 */ }
    return 'drafted';
  };

  return { prompt, rating, tags, adjusted, busy, load, rate, toggleTag, close, dismiss, snooze, lighten };
};
