/**
 * 任务草稿控制器（全局单例，和 useSyncController 一个形态）。
 *
 * 单例的理由：AiComposer（`/ai?stage=compose`）和 AiHandoffPreview
 * （`/ai?stage=preview`）是同一份草稿的两个视图——查询参数切换时组件会
 * 卸载重建，模块级状态才能把工作区留住。
 *
 * 撤销栈只管轨道 join/leave 意图（A7 P5）；范围天数这类配置不进栈。
 */
import { computed, ref } from 'vue';
import { backend, toUserMessage } from '../lib/bridge';
import type {
  AiTask,
  AiTaskAttachmentRef,
  AiTaskCategory,
  AiTaskCategoryRange,
  AiTaskDetailLevel,
  AiTaskSummary,
  AiTaskTemplate,
} from '../lib/bridge/types';
import type { Workout as WorkoutRow } from '../types';
import {
  applyTemplateToDraft,
  isTaskDirty,
  newTaskDraft,
  taskSnapshot,
} from '../lib/aiTask/draft';
import { categoryRangeOf, withCategoryRange } from '../lib/aiTask/categories';
import { createUndoStack, orbitUndoTarget, type OrbitUndoOp } from '../lib/aiTask/undoStack';
import { templatePromptSeed } from '../lib/aiTask/prompt';
import { defineMessages, messagesOf } from '../i18n';

const messages = defineMessages(
  {
    loadFailed: '任务读取失败',
    saveFailed: '任务保存失败',
    deleteFailed: '任务删除失败',
    untitled: '未命名任务',
  },
  {
    loadFailed: 'Could not load the task',
    saveFailed: 'Could not save the task',
    deleteFailed: 'Could not delete the task',
    untitled: 'Untitled task',
  },
  {
    loadFailed: 'No se pudo cargar la tarea',
    saveFailed: 'No se pudo guardar la tarea',
    deleteFailed: 'No se pudo eliminar la tarea',
    untitled: 'Tarea sin nombre',
  },
);
const copy = () => messagesOf(messages);

/* —— 单例状态 —— */
const draft = ref<AiTask>(newTaskDraft());
/** 上次保存/加载时的快照；脏标记 = 现在 ≠ 基线。 */
const baseline = ref(taskSnapshot(draft.value));
/** 用户是否亲手改过提示词（模板套用时的保护闸）。 */
const promptEdited = ref(false);
const taskList = ref<AiTaskSummary[]>([]);
const templates = ref<AiTaskTemplate[]>([]);
const recentWorkouts = ref<WorkoutRow[]>([]);
const undoStack = createUndoStack<OrbitUndoOp>();
const busy = ref<false | 'load' | 'save' | 'delete'>(false);
const lastError = ref<string | null>(null);
const savedNotice = ref(false);
let savedNoticeTimer: ReturnType<typeof setTimeout> | undefined;

const dirty = computed(() => isTaskDirty(draft.value, baseline.value));
/* undoStack 是纯数组不是响应式——computed 包它只会缓存第一次求值。
   用 undoDepth 做响应式影子，栈每次变动都同步它。 */
const undoDepth = ref(0);
const canUndo = computed(() => undoDepth.value > 0);
const syncUndoDepth = () => {
  undoDepth.value = undoStack.size;
};

const markBaseline = () => {
  baseline.value = taskSnapshot(draft.value);
};

const patchDraft = (patch: Partial<AiTask>) => {
  draft.value = { ...draft.value, ...patch };
};

const patchRange = (category: AiTaskCategory, patch: Partial<AiTaskCategoryRange>) => {
  const next = { ...categoryRangeOf(draft.value.categories, category), ...patch };
  draft.value = {
    ...draft.value,
    categories: withCategoryRange(draft.value.categories, next),
  };
};

const loadTaskList = async () => {
  try {
    taskList.value = await backend.aiTaskList();
  } catch (error) {
    lastError.value = toUserMessage(error, copy().loadFailed);
  }
};

const loadTemplates = async () => {
  try {
    templates.value = await backend.aiTemplateList();
  } catch (error) {
    lastError.value = toUserMessage(error, copy().loadFailed);
  }
};

/**
 * 任务里关联的运动可能落在「最近 N 条」之外（老任务、或勾选来自别的入口）。
 * 窗口预览和勾选框都靠 recentWorkouts 认这些 id——缺的按 id 一条条补进来。
 * 单条补取失败不拖死整页：预览只是少这一条，不是编一条假的。
 */
const ensureLinkedWorkouts = async () => {
  const known = new Set(recentWorkouts.value.map((workout) => workout.workout_id));
  const missing = draft.value.workout_ids.filter((id) => !known.has(id));
  if (!missing.length) return;
  const fetched = await Promise.all(
    missing.map(async (id) => {
      try {
        return await backend.getWorkoutDetail(id);
      } catch {
        return null;
      }
    }),
  );
  // 补取期间最近列表可能刚被刷过一遍——按此刻的集合再判一次，别重复塞。
  const have = new Set(recentWorkouts.value.map((workout) => workout.workout_id));
  const extra = fetched.filter(
    (workout): workout is WorkoutRow => workout !== null && !have.has(workout.workout_id),
  );
  if (extra.length) recentWorkouts.value = [...recentWorkouts.value, ...extra];
};

const loadRecentWorkouts = async (limit = 60) => {
  try {
    recentWorkouts.value = await backend.getRecentWorkouts(limit);
    // 覆盖赋值会把上一轮补进来的关联运动冲掉，所以每次落地后都重查一遍。
    await ensureLinkedWorkouts();
  } catch (error) {
    lastError.value = toUserMessage(error, copy().loadFailed);
  }
};

const loadTask = async (id: string) => {
  busy.value = 'load';
  lastError.value = null;
  try {
    const task = await backend.aiTaskGet(id);
    draft.value = task;
    // 载入的提示词就是用户自己的稿子——模板再套用不许冲掉它。
    promptEdited.value = true;
    await ensureLinkedWorkouts();
    undoStack.clear();
    syncUndoDepth();
    markBaseline();
    savedNotice.value = false;
  } catch (error) {
    lastError.value = toUserMessage(error, copy().loadFailed);
    throw error;
  } finally {
    busy.value = false;
  }
};

const resetDraft = () => {
  draft.value = newTaskDraft();
  promptEdited.value = false;
  undoStack.clear();
  syncUndoDepth();
  markBaseline();
  lastError.value = null;
  savedNotice.value = false;
};

const saveDraft = async (): Promise<AiTask> => {
  busy.value = 'save';
  lastError.value = null;
  try {
    const task = { ...draft.value };
    if (!task.title.trim()) task.title = copy().untitled;
    const saved = await backend.aiTaskSave(task);
    draft.value = saved;
    markBaseline();
    savedNotice.value = true;
    clearTimeout(savedNoticeTimer);
    savedNoticeTimer = setTimeout(() => {
      savedNotice.value = false;
    }, 4000);
    void loadTaskList();
    return saved;
  } catch (error) {
    lastError.value = toUserMessage(error, copy().saveFailed);
    throw error;
  } finally {
    busy.value = false;
  }
};

const deleteTask = async (id: string) => {
  busy.value = 'delete';
  lastError.value = null;
  try {
    await backend.aiTaskDelete(id);
    if (draft.value.id === id) resetDraft();
    await loadTaskList();
  } catch (error) {
    lastError.value = toUserMessage(error, copy().deleteFailed);
    throw error;
  } finally {
    busy.value = false;
  }
};

/** 套用模板：只动规则字段；用户改过的提示词、已选运动和附件全部保留。 */
const applyTemplate = (template: AiTaskTemplate) => {
  draft.value = applyTemplateToDraft(
    draft.value,
    template,
    templatePromptSeed(template),
    promptEdited.value,
  );
};

/**
 * 模板下拉的单一入口（''/null = 「不使用模板」）。
 * 撤模板只摘 `template_id` 标记——快照、预览、保存都不再按模板任务计。
 * 模板已写进草稿的字段（类别范围、详细程度、提示词初稿）**不回退**：
 * 用户可能已经在上面改过，回退会把用户内容一起冲掉。
 */
const setTemplateId = (id: string | null) => {
  if (!id) {
    if (draft.value.template_id !== null) patchDraft({ template_id: null });
    return;
  }
  const template = templates.value.find((item) => item.id === id);
  if (template) applyTemplate(template);
};

/* —— 轨道意图（undo 栈只管这个） —— */
const setCategoryEnabled = (category: AiTaskCategory, enabled: boolean) => {
  const current = categoryRangeOf(draft.value.categories, category).enabled;
  if (current === enabled) return;
  undoStack.push({
    type: enabled ? 'join' : 'leave',
    nodeId: category,
    prevState: current ? 'member' : 'candidate',
  });
  syncUndoDepth();
  patchRange(category, { enabled });
};

const undo = () => {
  const op = undoStack.pop();
  if (!op) return;
  syncUndoDepth();
  const target = orbitUndoTarget(op);
  patchRange(target.nodeId as AiTaskCategory, { enabled: target.state === 'member' });
};

const setCategoryDays = (category: AiTaskCategory, daysBefore: number) => {
  patchRange(category, { days_before: Math.max(0, Math.floor(daysBefore)) });
};

const setIncludeWorkoutDay = (category: AiTaskCategory, include: boolean) => {
  patchRange(category, { include_workout_day: include });
};

const toggleWorkout = (workoutId: string) => {
  const ids = draft.value.workout_ids;
  patchDraft({
    workout_ids: ids.includes(workoutId)
      ? ids.filter((id) => id !== workoutId)
      : [...ids, workoutId],
  });
};

const setPrompt = (text: string) => {
  promptEdited.value = true;
  patchDraft({ prompt: text });
};

const setPersonalNote = (text: string) => {
  patchDraft({ personal_note: text });
  // 写了内容就自动把这个类别算进交付范围；清空不动开关——成员的留/走是显式动作。
  if (text.trim()) patchRange('personal_note', { enabled: true });
};

const addAttachments = (refs: AiTaskAttachmentRef[]) => {
  if (!refs.length) return;
  patchDraft({ attachments: [...draft.value.attachments, ...refs] });
  patchRange('attachment', { enabled: true });
};

const removeAttachment = (id: string) => {
  const attachments = draft.value.attachments.filter((ref) => ref.id !== id);
  patchDraft({ attachments });
  if (!attachments.length) patchRange('attachment', { enabled: false });
};

/** 重新选择原件：保住 id，这样预览/准备返回的状态还能对上这条引用。 */
const replaceAttachment = (id: string, next: AiTaskAttachmentRef) => {
  patchDraft({
    attachments: draft.value.attachments.map((ref) => (ref.id === id ? { ...next, id } : ref)),
  });
};

export function useAiTaskDraft() {
  return {
    draft,
    dirty,
    canUndo,
    promptEdited,
    taskList,
    templates,
    recentWorkouts,
    busy,
    lastError,
    savedNotice,
    loadTaskList,
    loadTemplates,
    loadRecentWorkouts,
    loadTask,
    resetDraft,
    saveDraft,
    deleteTask,
    applyTemplate,
    setTemplateId,
    setCategoryEnabled,
    setCategoryDays,
    setIncludeWorkoutDay,
    undo,
    toggleWorkout,
    setPrompt,
    setPersonalNote,
    setTitle: (title: string) => patchDraft({ title }),
    setDetailLevel: (detail_level: AiTaskDetailLevel) => patchDraft({ detail_level }),
    setPreciseGps: (include_precise_gps: boolean) => patchDraft({ include_precise_gps }),
    setMcpShared: (mcp_shared: boolean) => patchDraft({ mcp_shared }),
    addAttachments,
    removeAttachment,
    replaceAttachment,
  };
}
