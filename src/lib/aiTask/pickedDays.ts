/**
 * 收集箱交过来的任务（精修批次 7.3 / 7.4）：开着的几类一共挑了多少个不同的日子。
 * 没挑（连续窗口）是 0。「你的过去」缩略卡和别处说「挑了 N 天」都用这一份。
 */
import type { AiTaskCategoryRange } from '../bridge/types';

export const pickedDayCount = (categories: Pick<AiTaskCategoryRange, 'enabled' | 'picked_days'>[]): number =>
  new Set(categories.filter((range) => range.enabled).flatMap((range) => range.picked_days ?? [])).size;
