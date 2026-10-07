/**
 * 运动页「交给 AI」带上恢复背景（第四轮 1D·D10，第三份用户反馈）。
 *
 * 为什么：停练一周后第一次恢复跑，单看这一次 AI 只会说「跑得不好」；带上前几天的睡眠和恢复，结论才会变成
 * 「这个状态下很正常」，还能说隔了几天该回到什么强度。
 *
 * 做法：不再走旧的整包导出，而是和「交给 AI」页同一套任务构建（lib/aiTask + ai_task_prepare）——
 * 这次运动本身 + 睡眠 / 恢复状态 / 静息心率三类（窗口是运动开始日往前 30 天：AI 用前 7 天的均值和之前的
 * 30 天基线比），有就带、缺的由导出如实写「未提供」；提示词写明「距上一次运动 N 天」，要求先判断身体状态
 * 再评价表现。预算按这家 AI 是免费版还是已订阅（lib/aiTask/budget.ts）。一份 `.md` 落到桌面，开场白进剪贴板，
 * 打开所选 AI 的网站（useAiTaskHandoff.runAll）。
 */
import { backend } from '../lib/bridge';
import type { AiTask, AiTaskCategory } from '../lib/bridge/types';
import type { Workout } from '../types';
import type { AiProvider } from '../lib/aiProviders';
import { newTaskDraft } from '../lib/aiTask/draft';
import { handoffParts } from '../lib/aiTask/handoffParts';
import { markdownGuide } from '../lib/aiTask/markdownGuide';
import { FREE_TOKEN_BUDGET, SUBSCRIBED_TOKEN_BUDGET, isSubscribed } from '../lib/aiTask/budget';
import { dayKey, daysBetween } from '../lib/aiTask/bridgeScale';
import { useAiTaskHandoff } from './useAiTaskHandoff';

/** 带上哪几类恢复背景。 */
export const RECOVERY_CATEGORIES: readonly AiTaskCategory[] = ['sleep', 'recovery', 'resting_hr'];
/** 往前看多少天：前 7 天看状态，再往前是 30 天基线。 */
const BASELINE_DAYS = 30;

/** 这次运动和上一次运动隔了几天（本地日）；之前没有记录到运动就是 null。 */
export const daysSincePrevious = (workout: Pick<Workout, 'workout_id' | 'start_time'>, all: Array<Pick<Workout, 'workout_id' | 'start_time'>>): number | null => {
  const start = new Date(workout.start_time).getTime();
  const previous = all
    .filter((other) => other.workout_id !== workout.workout_id && new Date(other.start_time).getTime() < start)
    .sort((a, b) => b.start_time.localeCompare(a.start_time))[0];
  if (!previous) return null;
  return daysBetween(dayKey(new Date(previous.start_time)), dayKey(new Date(workout.start_time)));
};

/** 交给 AI 的任务：这次运动 + 三类恢复背景，其余类别不带。 */
export const recoveryTask = (workout: Pick<Workout, 'workout_id'>, title: string, prompt: string): AiTask => {
  const base = newTaskDraft();
  return {
    ...base,
    title,
    prompt,
    workout_ids: [workout.workout_id],
    detail_level: 'detailed',
    categories: base.categories.map((range) => {
      if (range.category === 'workout') return { ...range, enabled: true, days_before: 0, include_workout_day: true };
      if (RECOVERY_CATEGORIES.includes(range.category)) return { ...range, enabled: true, days_before: BASELINE_DAYS - 1, include_workout_day: true };
      return { ...range, enabled: false };
    }),
  };
};

export const useWorkoutRecoveryHandoff = () => {
  const handoff = useAiTaskHandoff();

  /** 准备文件 → 复制开场白 → 打开网站。返回 true = 文件已备好（之后哪一步没成，由 steps 里的错误说）。 */
  const send = async (workout: Workout, provider: AiProvider, title: string, prompt: (gap: number | null) => string): Promise<boolean> => {
    let gap: number | null = null;
    try {
      const page = await backend.getWorkoutPage(400, 0);
      gap = daysSincePrevious(workout, page.items);
    } catch {
      // 读不到运动列表就不写「距上次几天」，交付照常。
    }
    const task = recoveryTask(workout, title, prompt(gap));
    const parts = handoffParts(task, null, { hasDirection: false, now: new Date(), format: 'md' });
    await handoff.runAll(task, provider, null, {
      briefText: parts.brief,
      dataFileStem: parts.dataStem,
      promptFileStem: parts.promptStem,
      promptOverride: null,
      provider: provider.id,
      tokenBudget: isSubscribed(provider.id) ? SUBSCRIBED_TOKEN_BUDGET : FREE_TOKEN_BUDGET,
      markdownGuide: markdownGuide(),
    });
    return handoff.prepareResult.value?.status === 'ready';
  };

  /** 哪一步出了错（准备 / 复制 / 打开）：第一条错误文案。 */
  const failure = () => {
    const steps = handoff.steps.value;
    return steps.prepare.errorText ?? steps.copy.errorText ?? steps.open.errorText ?? null;
  };

  return { send, failure, steps: handoff.steps, inFlight: handoff.inFlight };
};
