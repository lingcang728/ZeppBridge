/**
 * 交付时交给后端的几段「前端整理好的文字」：任务说明、两个文件名。
 * 预览（「复制出去的就是这段」）和真正导出走同一个函数，保证三者一致。
 */
import type { AiTask, AiTaskCategory, AiTaskPreview } from '../bridge/types';
import { AI_TASK_CATEGORY_META, AI_TASK_CATEGORY_ORDER } from './categories';
import { buildBrief } from './brief';
import { exportFileStems, readFileNameRule, type FileNameRule } from './fileName';

export interface HandoffParts {
  brief: string;
  dataStem: string;
  promptStem: string;
}

/** 交出去的数据类别（有窗口、已启用），按界面顺序。 */
export const exportedCategories = (task: Pick<AiTask, 'categories'>): AiTaskCategory[] => {
  const enabled = new Set(task.categories.filter((range) => range.enabled).map((range) => range.category));
  return AI_TASK_CATEGORY_ORDER.filter((category) => enabled.has(category) && AI_TASK_CATEGORY_META[category].hasWindow);
};

/** 数据实际覆盖的起止日：取预览里各类别窗口的最早起点、最晚终点。 */
export const coveredRange = (preview: AiTaskPreview | null | undefined): { start: string | null; end: string | null } => {
  const rows = preview?.coverage ?? [];
  if (!rows.length) return { start: null, end: null };
  const start = rows.reduce((min, row) => (row.start_date < min ? row.start_date : min), rows[0]!.start_date);
  const end = rows.reduce((max, row) => (row.end_date > max ? row.end_date : max), rows[0]!.end_date);
  return { start: start.slice(0, 10), end: end.slice(0, 10) };
};

export const handoffParts = (
  task: AiTask,
  preview: AiTaskPreview | null | undefined,
  options: { hasDirection: boolean; rule?: FileNameRule; now?: Date; format?: 'json' | 'md' },
): HandoffParts => {
  const categories = exportedCategories(task);
  const { start, end } = coveredRange(preview);
  const stems = exportFileStems(options.rule ?? readFileNameRule(), {
    start, end, categories, title: task.title, now: options.now ?? new Date(),
  });
  const brief = buildBrief({
    start,
    end,
    categories,
    dataFile: `${stems.data}.${options.format === 'md' ? 'md' : 'json'}`,
    format: options.format ?? 'json',
    attachmentCount: task.attachments.length,
    hasPersonalNote: task.personal_note.trim().length > 0,
    workoutCount: task.workout_ids.length,
    hasQuestion: options.hasDirection || task.prompt.trim().length > 0,
  });
  return { brief, dataStem: stems.data, promptStem: stems.prompt };
};
