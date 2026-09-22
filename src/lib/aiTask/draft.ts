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
 * 套用模板。模板只携带规则：类别范围、详细程度、提示词初稿——
 * 不携带运动、附件、数据快照（B3 硬要求），所以这些字段一律原样保留。
 *
 * `promptEdited`：用户是否亲手改过提示词。改过就不冲掉——模板只提供初稿，
 * 用户写了的东西比模板大。
 */
export const applyTemplateToDraft = (
  task: AiTask,
  template: AiTaskTemplate,
  promptSeed: string,
  promptEdited: boolean,
): AiTask => ({
  ...task,
  template_id: template.id,
  categories: template.categories.map((range) => ({ ...range })),
  detail_level: template.detail_level,
  prompt: promptEdited ? task.prompt : promptSeed,
});

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
