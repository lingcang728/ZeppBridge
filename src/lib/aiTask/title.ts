/**
 * 任务名自动生成：用户不必先想名字。标题框为空时显示它当占位，保存和
 * 导出文件夹也用它。规则：`<方向或运动> · <日期>`。
 */
import type { AiTask } from '../bridge/types';
import type { Workout } from '../../types';
import { defineMessages, messagesOf } from '../../i18n';
import { formatDate } from '../format';
import { workoutDisplayLabel } from '../workouts';
import { AI_TASK_CATEGORY_META } from './categories';

const messages = defineMessages(
  { recentDays: (days: number) => `最近 ${days} 天`, andMore: (count: number) => ` 等 ${count} 次` },
  { recentDays: (days: number) => `Last ${days} days`, andMore: (count: number) => ` +${count - 1} more` },
  { recentDays: (days: number) => `Últimos ${days} días`, andMore: (count: number) => ` y ${count - 1} más` },
  'lib/aiTask/title',
);

/** 没选运动时「最近 N 天」的 N：启用的窗口类别里回溯最长的那个。 */
export const recentWindowDays = (task: Pick<AiTask, 'categories'>): number =>
  task.categories
    .filter((range) => range.enabled && AI_TASK_CATEGORY_META[range.category].hasWindow)
    .reduce((max, range) => Math.max(max, range.days_before), 0) || 14;

export const autoTaskTitle = (
  task: Pick<AiTask, 'categories'>,
  selectedWorkouts: Workout[],
  templateLabel: string | null,
  now: Date = new Date(),
): string => {
  const t = messagesOf(messages);
  const [first] = [...selectedWorkouts].sort((a, b) => a.start_time.localeCompare(b.start_time));
  const subject = first
    ? `${workoutDisplayLabel(first)}${selectedWorkouts.length > 1 ? t.andMore(selectedWorkouts.length) : ''}`
    : t.recentDays(recentWindowDays(task));
  const head = templateLabel ?? subject;
  const date = formatDate(first ? first.start_time : now.toISOString());
  return `${head} · ${date}`;
};
