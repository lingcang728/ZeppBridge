/**
 * 分析任务类别的界面元数据。
 *
 * 类别集合与顺序是 A7 P1 的契约；这里只挂界面需要的东西：label 的
 * `ui.ai_task.cat.*` 码、图标、默认窗口。文案本体在 `copy.ts`。
 */
import type { IconName } from '../../components/Icon.vue';
import type { AiTaskCategory, AiTaskCategoryRange } from '../bridge/types';
import { aiTaskTextFor } from './copy';

export const AI_TASK_CATEGORY_ORDER: readonly AiTaskCategory[] = [
  'workout',
  'sleep',
  'recovery',
  'resting_hr',
  'heart_rate',
  'training',
  'body',
  'personal_note',
  'attachment',
];

export interface AiTaskCategoryMeta {
  category: AiTaskCategory;
  /** `ui.ai_task.cat.<category>`，文案在 copy.ts。 */
  labelCode: string;
  icon: IconName;
  /** 这一类在图里的色调（节点图标和日环）。类别色只标数据类别，不当装饰。 */
  tint: string;
  /** 默认回溯窗口（天）。 */
  defaultDaysBefore: number;
  /**
   * false = 这一类别没有「按运动回溯 N 天」的窗口概念
   * （personal_note / attachment 是用户内容，不是健康数据流）。
   */
  hasWindow: boolean;
}

export const AI_TASK_CATEGORY_META: Readonly<Record<AiTaskCategory, AiTaskCategoryMeta>> = {
  workout: { category: 'workout', labelCode: 'ui.ai_task.cat.workout', icon: 'run', tint: 'var(--activity)', defaultDaysBefore: 13, hasWindow: true },
  sleep: { category: 'sleep', labelCode: 'ui.ai_task.cat.sleep', icon: 'moon', tint: 'var(--sleep-light)', defaultDaysBefore: 13, hasWindow: true },
  recovery: { category: 'recovery', labelCode: 'ui.ai_task.cat.recovery', icon: 'spark', tint: 'var(--readiness)', defaultDaysBefore: 13, hasWindow: true },
  // 1A·A10：「心率」拆成静息心率（每天一个数）和全天心率（逐点采样）；两类都是心率页那条红线的颜色。
  resting_hr: { category: 'resting_hr', labelCode: 'ui.ai_task.cat.resting_hr', icon: 'heart', tint: 'var(--heart)', defaultDaysBefore: 13, hasWindow: true },
  heart_rate: { category: 'heart_rate', labelCode: 'ui.ai_task.cat.heart_rate', icon: 'activity', tint: 'var(--heart)', defaultDaysBefore: 13, hasWindow: true },
  training: { category: 'training', labelCode: 'ui.ai_task.cat.training', icon: 'training-load', tint: 'var(--training)', defaultDaysBefore: 13, hasWindow: true },
  body: { category: 'body', labelCode: 'ui.ai_task.cat.body', icon: 'user', tint: 'var(--pace)', defaultDaysBefore: 13, hasWindow: true },
  personal_note: { category: 'personal_note', labelCode: 'ui.ai_task.cat.personal_note', icon: 'edit', tint: 'var(--muted)', defaultDaysBefore: 13, hasWindow: false },
  attachment: { category: 'attachment', labelCode: 'ui.ai_task.cat.attachment', icon: 'file', tint: 'var(--muted)', defaultDaysBefore: 13, hasWindow: false },
};

/** 新建任务的默认类别表：数据类别开，内容类别等用户真加了内容再开。 */
export const defaultCategoryRanges = (): AiTaskCategoryRange[] =>
  AI_TASK_CATEGORY_ORDER.map((category) => ({
    category,
    enabled: AI_TASK_CATEGORY_META[category].hasWindow,
    days_before: AI_TASK_CATEGORY_META[category].defaultDaysBefore,
    include_workout_day: true,
    excluded_metrics: [],
  }));

export const categoryLabel = (category: AiTaskCategory): string =>
  aiTaskTextFor(AI_TASK_CATEGORY_META[category].labelCode) ?? category;

/** 类别配置面板里的窗口选项（03-orbit-drag：7 / 14 / 30 天）。 */
export const CATEGORY_DAY_CHOICES: readonly number[] = [7, 14, 30];

/**
 * 回溯天数在胶囊上亮哪一格。胶囊的「7 天」写进去是 days_before=7；内置模板「这一周」按「今天 + 前 6 天」
 * 写的是 6——以前两边对不上，套了模板以后「7 / 14 / 30 天」一格都不亮（用户 2026-09-30 截图）。
 * 差一天的也点亮最近的那一格；不改存下来的值。
 */
export const shownDayChoice = (daysBefore: number, choices: readonly number[]): number => {
  if (choices.includes(daysBefore)) return daysBefore;
  if (choices.includes(daysBefore + 1)) return daysBefore + 1;
  return daysBefore;
};

/** 取/改某类别的范围行；任务里缺这一行时按默认补一条。 */
export const categoryRangeOf = (
  categories: AiTaskCategoryRange[],
  category: AiTaskCategory,
): AiTaskCategoryRange =>
  categories.find((range) => range.category === category) ?? {
    category,
    enabled: AI_TASK_CATEGORY_META[category].hasWindow,
    days_before: AI_TASK_CATEGORY_META[category].defaultDaysBefore,
    include_workout_day: true,
    excluded_metrics: [],
  };

export const withCategoryRange = (
  categories: AiTaskCategoryRange[],
  next: AiTaskCategoryRange,
): AiTaskCategoryRange[] => {
  const index = categories.findIndex((range) => range.category === next.category);
  if (index < 0) return [...categories, next];
  const out = [...categories];
  out[index] = next;
  return out;
};
