/**
 * 早上恢复差时「把今天的间歇换成轻松跑」：判断与一键改。判断规则在 `lib/trainingPlan/easyDay.ts`。
 *
 * - 看的是要改的那一份：手上有草稿看草稿（MCP 送来还没接受的不碰），没有就看生效的计划。
 * - 今天有间歇才去读准备度——大多数早上没有间歇，概览不多查一次库。
 * - 换完只是草稿：和拖一格、拨一下滚轮一样，用户长按「重新同步到手表」才发出去。
 * - 「今天不用」记在本机（按日期），第二天自然失效。
 *
 * 全局单例：概览的周报卡和交给 AI 的周视图读同一份。
 */
import { computed, ref } from 'vue';
import { backend, isDesktop } from '../lib/bridge';
import { dayKey } from '../lib/aiTask/bridgeScale';
import { today as currentToday } from '../lib/currentDay';
import {
  READINESS_BASELINE_DAYS, easyDay, hasIntervalStep, intervalsOn, lowRecovery, type EasyWords,
} from '../lib/trainingPlan/easyDay';
import type { MetricSeriesPoint } from '../types';
import type { PlanSport, PlanWorkoutInput } from '../types/trainingPlan';
import { useTrainingPlan } from './useTrainingPlan';

const DISMISS_KEY = 'zeppbridge.plan.easySwapDismissed.v1';

const day = ref(dayKey(currentToday()));
const readiness = ref<MetricSeriesPoint[]>([]);
/** 读到的是哪一天的准备度：跨过午夜或同步落地后要重读。 */
let readFor = '';
let readSeq = 0;
const dismissed = ref<string | null>(null);
try { dismissed.value = window.localStorage.getItem(DISMISS_KEY); } catch { /* 读不到就当没点过 */ }

export interface EasySuggestion {
  readiness: number;
  usual: number;
  sport: PlanSport;
  /** 今天那条间歇的名字（用户 / AI 写的，原样显示）。 */
  name: string;
}

export const useEasySwap = () => {
  const plan = useTrainingPlan();

  /** 今天有间歇的训练（只看要改的那一份）。 */
  const todays = computed<{ sport: string; name: string }[]>(() => {
    const doc = plan.document.value;
    if (doc && plan.preview.value) return plan.accepted.value ? intervalsOn(doc, day.value) : [];
    return (plan.state.value?.planned ?? []).filter((workout) => workout.date === day.value && hasIntervalStep(workout));
  });

  const suggestion = computed<EasySuggestion | null>(() => {
    const first = todays.value[0];
    if (!first || dismissed.value === day.value) return null;
    const low = lowRecovery(readiness.value, day.value);
    if (!low) return null;
    return { readiness: low.today, usual: low.usual, sport: first.sport as PlanSport, name: first.name };
  });

  /** 今天有间歇才读准备度；`force` 用在同步落地后（今天的读数可能刚到）。 */
  const refresh = async (force = false) => {
    day.value = dayKey(currentToday());
    if (!isDesktop() || !todays.value.length) return;
    if (!force && readFor === day.value) return;
    const mine = ++readSeq;
    try {
      const [series] = await backend.getMetricSeries(['readiness'], READINESS_BASELINE_DAYS + 1);
      if (mine !== readSeq) return;
      readiness.value = series?.points ?? [];
      readFor = day.value;
    } catch {
      // 读不到准备度就不提示：没有依据不劝人改计划。
    }
  };

  /** 换掉今天的间歇。返回是否改成了（改完是草稿，等用户长按发出）。 */
  const swap = async (words: (workout: PlanWorkoutInput) => EasyWords): Promise<boolean> => {
    if (plan.busy.value) return false;
    if (!plan.document.value && !(await plan.editActive(day.value))) return false;
    const doc = plan.document.value;
    if (!doc || !plan.accepted.value || !intervalsOn(doc, day.value).length) return false;
    await plan.reshape(easyDay(doc, day.value, words));
    return !intervalsOn(plan.document.value ?? doc, day.value).length;
  };

  const dismiss = () => {
    dismissed.value = day.value;
    try { window.localStorage.setItem(DISMISS_KEY, day.value); } catch { /* 只是这次会话里不再出现 */ }
  };

  return { suggestion, todays, refresh, swap, dismiss, busy: plan.busy };
};
