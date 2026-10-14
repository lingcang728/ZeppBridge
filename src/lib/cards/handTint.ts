/**
 * 收集箱里一项叫什么、什么颜色（1A·A8）。
 *
 * 以前按**类别**取色：静息心率、HRV 都归「恢复 / 心率」类，于是收集箱里全成了绿色，和图表对不上。
 * 现在：一项指标 = `metricColor(指标名)`（`lib/metricTone.ts` 唯一来源，渲染时取，跟着主题走）；
 * 整类（`cat:<类别>`）和运动用类别色。
 */
import { AI_TASK_CATEGORY_META, categoryLabel } from '../aiTask/categories';
import { metricLabel } from '../aiTask/metrics';
import { metricColor } from '../metricTone';
import type { AiTaskCategory } from '../bridge/types';
import type { HandGroup } from './hand';

/** 箱子里一项的名字：`cat:<类别>` 是整类，`workout:<id>` / `workout` 是运动，其余是指标名。 */
export const labelOfPick = (key: string): string => {
  if (key === 'workout' || key.startsWith('workout:')) return categoryLabel('workout');
  if (key.startsWith('cat:')) return categoryLabel(key.slice(4) as AiTaskCategory);
  return metricLabel(key);
};

export const tintOfPick = (key: string, category: AiTaskCategory): string => {
  if (key === 'workout' || key.startsWith('workout:') || key.startsWith('cat:')) return AI_TASK_CATEGORY_META[category]?.tint ?? 'var(--accent)';
  return metricColor(key);
};

export const tintOfGroup = (group: HandGroup): string => tintOfPick(group.key, group.category);
