/**
 * 交给 AI 的某一类发成一副牌（原来写在「你的过去」二级页里，2026-10-08 横向舞台起由舞台上那张类别牌背面的「挑具体日子」用）。
 * 运动是一次运动一张牌（任务里已经勾上的几次显示为「已在箱中」）；其余按天，牌面读数和这一类在别处的写法一致。
 */
import { AI_TASK_CATEGORY_META, categoryLabel } from '../aiTask/categories';
import { unitLabel } from '../aiTask/metrics';
import { formatDuration } from '../format';
import type { AiTaskCategory } from '../bridge/types';
import { categorySource, workoutSource, type DeckSource } from './sources';

/** 睡眠按「几小时几分」，体重 / 小时一位小数，其余取整。 */
const formatFor = (category: AiTaskCategory, unit: string | null) => (value: number) => (category === 'sleep'
  ? formatDuration(value)
  : `${value.toFixed(unit === 'kg' || unit === 'h' ? 1 : 0)}`);

export const categoryDeckSource = (category: AiTaskCategory, options: {
  /** 这一类的单位（条带里第一个带单位的格子）。 */
  unit: string | null;
  /** 任务里已经勾上的运动。 */
  pickedWorkouts: () => string[];
  releaseWorkout: (id: string) => void;
}): DeckSource => {
  const tint = AI_TASK_CATEGORY_META[category].tint;
  const label = categoryLabel(category);
  if (category === 'workout') return workoutSource({ label, tint, picked: options.pickedWorkouts, release: options.releaseWorkout });
  return categorySource({
    category, label, tint, format: formatFor(category, options.unit),
    unit: category === 'sleep' || !options.unit ? undefined : unitLabel(options.unit),
  });
};
