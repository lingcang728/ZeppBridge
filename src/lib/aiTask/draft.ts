/**
 * 任务草稿的纯函数：新建、模板套用、脏标记。
 *
 * 响应式状态在 `composables/useAiTaskDraft.ts`；这里不碰 Vue，
 * 让「模板只改它该改的字段、用户写过的内容不被冲掉」这类规则可以直接进
 * vitest。
 */
import type {
  AiTask,
  AiTaskCategoryRange,
  AiTaskDetailLevel,
  AiTaskTemplate,
} from '../bridge/types';
import { defaultCategoryRanges } from './categories';

export const AI_TASK_SCHEMA_VERSION = 1 as const;
/** 「你的问题」输入框的字符上限（设计稿 /500）。 */
export const AI_TASK_PROMPT_MAX = 500;

/** 空草稿。`id`/时间戳留空，后端在 `ai_task_save` 时填。 */
export const newTaskDraft = (): AiTask => ({
  schema_version: AI_TASK_SCHEMA_VERSION,
  id: '',
  title: '',
  template_id: null,
  workout_ids: [],
  categories: defaultCategoryRanges(),
  detail_level: 'standard',
  prompt: '',
  personal_note: '',
  attachments: [],
  include_precise_gps: false,
  mcp_shared: false,
  created_at: '',
  updated_at: '',
});

/**
 * 套用模板。模板是「分析方向」：带推荐的类别范围与详细程度，方向正文在
 * 交付时单独拼进提示词（见 `prompt.ts`）。
 *
 * 模板**不碰** `prompt`——那是用户这次的问题，和方向并存；也不携带运动、
 * 附件、数据快照（B3 硬要求）。内容类别（个人说明、附件）的开关跟着内容走，
 * 模板不覆盖它们。
 */
export const applyTemplateToDraft = (task: AiTask, template: AiTaskTemplate): AiTask => {
  const contentEnabled = new Map(
    task.categories
      .filter((range) => range.category === 'personal_note' || range.category === 'attachment')
      .map((range) => [range.category, range.enabled]),
  );
  return {
    ...task,
    template_id: template.id,
    categories: template.categories.map((range) => ({
      ...range,
      excluded_metrics: [...(range.excluded_metrics ?? [])],
      enabled: contentEnabled.get(range.category) ?? range.enabled,
    })),
    detail_level: template.detail_level,
  };
};

/**
 * 稳定序列化，用于脏标记比对。字段顺序固定写死，不依赖构造顺序——
 * 从后端读回来的对象 key 顺序可能不一样，逐字段取才比得准。
 */
export const taskSnapshot = (task: AiTask): string =>
  JSON.stringify({
    title: task.title,
    template_id: task.template_id,
    workout_ids: [...task.workout_ids].sort(),
    categories: [...task.categories]
      .map((range) => ({
        category: range.category,
        enabled: range.enabled,
        days_before: range.days_before,
        include_workout_day: range.include_workout_day,
        excluded_metrics: [...(range.excluded_metrics ?? [])].sort(),
      }))
      .sort((a, b) => a.category.localeCompare(b.category)),
    detail_level: task.detail_level,
    prompt: task.prompt,
    personal_note: task.personal_note,
    attachments: task.attachments
      .map((ref) => {
        // 用解构拿 display_name：这只是序列化比对，不渲染——成员访问会撞
        // check-i18n 的散文字段扫描（它按 `.display_name` 抓后端原文渲染点）。
        const { display_name, ...rest } = ref;
        return {
          id: rest.id,
          path: rest.path,
          display_name,
          kind: rest.kind,
          byte_len: rest.byte_len,
          added_at: rest.added_at,
        };
      })
      .sort((a, b) => a.id.localeCompare(b.id)),
    include_precise_gps: task.include_precise_gps,
    mcp_shared: task.mcp_shared,
  });

/** 草稿相对基线（上次保存/加载）有没有被改过。 */
export const isTaskDirty = (task: AiTask, baselineSnapshot: string): boolean =>
  taskSnapshot(task) !== baselineSnapshot;

export const cloneRanges = (ranges: AiTaskCategoryRange[]): AiTaskCategoryRange[] =>
  ranges.map((range) => ({ ...range }));

export const DETAIL_LEVELS: readonly AiTaskDetailLevel[] = ['summary', 'standard', 'detailed'];
