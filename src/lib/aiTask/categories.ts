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
  /** 默认回溯窗口（天）。 */
  defaultDaysBefore: number;
  /**
   * false = 这一类别没有「按运动回溯 N 天」的窗口概念
   * （personal_note / attachment 是用户内容，不是健康数据流）。
   */
  hasWindow: boolean;
}

export const AI_TASK_CATEGORY_META: Readonly<Record<AiTaskCategory, AiTaskCategoryMeta>> = {
  workout: { category: 'workout', labelCode: 'ui.ai_task.cat.workout', icon: 'run', defaultDaysBefore: 14, hasWindow: true },
  sleep: { category: 'sleep', labelCode: 'ui.ai_task.cat.sleep', icon: 'moon', defaultDaysBefore: 14, hasWindow: true },
  recovery: { category: 'recovery', labelCode: 'ui.ai_task.cat.recovery', icon: 'spark', defaultDaysBefore: 14, hasWindow: true },
  heart_rate: { category: 'heart_rate', labelCode: 'ui.ai_task.cat.heart_rate', icon: 'heart', defaultDaysBefore: 14, hasWindow: true },
  training: { category: 'training', labelCode: 'ui.ai_task.cat.training', icon: 'training-load', defaultDaysBefore: 14, hasWindow: true },
  body: { category: 'body', labelCode: 'ui.ai_task.cat.body', icon: 'user', defaultDaysBefore: 14, hasWindow: true },
  personal_note: { category: 'personal_note', labelCode: 'ui.ai_task.cat.personal_note', icon: 'edit', defaultDaysBefore: 14, hasWindow: false },
  attachment: { category: 'attachment', labelCode: 'ui.ai_task.cat.attachment', icon: 'file', defaultDaysBefore: 14, hasWindow: false },
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

export const isCategoryDayChoice = (days: number): boolean => CATEGORY_DAY_CHOICES.includes(days);

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
