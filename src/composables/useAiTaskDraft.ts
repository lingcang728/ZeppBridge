/**
 * 任务草稿控制器（全局单例，和 useSyncController 一个形态）。
 *
 * 只管「这份草稿是什么、怎么改、怎么存」。后端资料（任务列表、模板、
 * 运动）归 `useAiTaskLibrary`；预览覆盖归 `useAiTaskPreview`；交付归
 * `useAiTaskHandoff`。
 *
 * 撤销栈管「选择」：类别进出、指标排除、运动勾选、模板套用。每次存的是
 * 动作前那一刻的选择快照，撤销就是整块还原——不用为每种动作写反向操作。
 * 天数、文字这类连续编辑不进栈。
 */
import { computed, ref } from 'vue';
import { backend, toUserMessage } from '../lib/bridge';
import type {
  AiTask,
  AiTaskAttachmentRef,
  AiTaskCategory,
  AiTaskCategoryRange,
  AiTaskDetailLevel,
  AiTaskTemplate,
} from '../lib/bridge/types';
import { applyTemplateToDraft, isTaskDirty, newTaskDraft, taskSnapshot } from '../lib/aiTask/draft';
import { categoryRangeOf, withCategoryRange } from '../lib/aiTask/categories';
import { createUndoStack } from '../lib/aiTask/undoStack';
import { useAiTaskLibrary } from './useAiTaskLibrary';
import { defineMessages, messagesOf } from '../i18n';

const messages = defineMessages(
  { loadFailed: '任务读取失败', saveFailed: '任务保存失败', deleteFailed: '任务删除失败', untitled: '未命名任务' },
  { loadFailed: 'Could not load the task', saveFailed: 'Could not save the task', deleteFailed: 'Could not delete the task', untitled: 'Untitled task' },
  { loadFailed: 'No se pudo cargar la tarea', saveFailed: 'No se pudo guardar la tarea', deleteFailed: 'No se pudo eliminar la tarea', untitled: 'Tarea sin nombre' },
  'composables/useAiTaskDraft',
);
const copy = () => messagesOf(messages);

type Selection = Pick<AiTask, 'categories' | 'workout_ids' | 'template_id' | 'detail_level'>;

const library = useAiTaskLibrary();
const draft = ref<AiTask>(newTaskDraft());
/** 上次保存/加载时的快照；脏标记 = 现在 ≠ 基线。 */
const baseline = ref(taskSnapshot(draft.value));
const undoStack = createUndoStack<Selection>();
/* undoStack 是普通数组不是响应式；undoDepth 是它的响应式影子。 */
const undoDepth = ref(0);
const busy = ref<false | 'load' | 'save' | 'delete'>(false);
const lastError = ref<string | null>(null);
const savedNotice = ref(false);
let savedNoticeTimer: ReturnType<typeof setTimeout> | undefined;

const dirty = computed(() => isTaskDirty(draft.value, baseline.value));
const canUndo = computed(() => undoDepth.value > 0);

const cloneRanges = (ranges: AiTaskCategoryRange[]) =>
  ranges.map((range) => ({ ...range, excluded_metrics: [...(range.excluded_metrics ?? [])] }));

const rememberSelection = () => {
  const { categories, workout_ids, template_id, detail_level } = draft.value;
  undoStack.push({ categories: cloneRanges(categories), workout_ids: [...workout_ids], template_id, detail_level });
  undoDepth.value = undoStack.size;
};

const clearUndo = () => {
  undoStack.clear();
  undoDepth.value = 0;
};

const markBaseline = () => {
  baseline.value = taskSnapshot(draft.value);
};

const patchDraft = (patch: Partial<AiTask>) => {
  draft.value = { ...draft.value, ...patch };
};

const patchRange = (category: AiTaskCategory, patch: Partial<AiTaskCategoryRange>) => {
  const next = { ...categoryRangeOf(draft.value.categories, category), ...patch };
  patchDraft({ categories: withCategoryRange(draft.value.categories, next) });
};

const replaceDraft = (task: AiTask) => {
  draft.value = task;
  clearUndo();
  markBaseline();
  savedNotice.value = false;
};

const loadTask = async (id: string) => {
  busy.value = 'load';
  lastError.value = null;
  try {
    const task = await backend.aiTaskGet(id);
    replaceDraft(task);
    await library.ensureWorkouts(task.workout_ids);
  } catch (error) {
    lastError.value = toUserMessage(error, copy().loadFailed);
    throw error;
  } finally {
    busy.value = false;
  }
};

const resetDraft = () => {
  replaceDraft(newTaskDraft());
  lastError.value = null;
};

/** `fallbackTitle`：标题为空时存成什么（页面按模板和运动自动生成）。 */
const saveDraft = async (fallbackTitle?: string): Promise<AiTask> => {
  busy.value = 'save';
  lastError.value = null;
  try {
    const task = { ...draft.value };
    if (!task.title.trim()) task.title = fallbackTitle?.trim() || copy().untitled;
    const saved = await backend.aiTaskSave(task);
    draft.value = saved;
    markBaseline();
    savedNotice.value = true;
    clearTimeout(savedNoticeTimer);
    savedNoticeTimer = setTimeout(() => {
      savedNotice.value = false;
    }, 4000);
    void library.loadTaskList();
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
    await library.loadTaskList();
  } catch (error) {
    lastError.value = toUserMessage(error, copy().deleteFailed);
    throw error;
  } finally {
    busy.value = false;
  }
};

/** 选模板 = 选分析方向（带推荐数据范围）；null = 不用模板。问题不受影响。 */
const setTemplate = (template: AiTaskTemplate | null) => {
  if ((template?.id ?? null) === draft.value.template_id) return;
  rememberSelection();
  draft.value = template ? applyTemplateToDraft(draft.value, template) : { ...draft.value, template_id: null };
};

const setCategoryEnabled = (category: AiTaskCategory, enabled: boolean) => {
  if (categoryRangeOf(draft.value.categories, category).enabled === enabled) return;
  rememberSelection();
  patchRange(category, { enabled });
};

const setMetricExcluded = (category: AiTaskCategory, metric: string, excluded: boolean) => {
  const current = categoryRangeOf(draft.value.categories, category).excluded_metrics ?? [];
  if (current.includes(metric) === excluded) return;
  rememberSelection();
  patchRange(category, {
    excluded_metrics: excluded ? [...current, metric] : current.filter((name) => name !== metric),
  });
};

const setWorkoutSelected = (workoutId: string, selected: boolean) => {
  const ids = draft.value.workout_ids;
  if (ids.includes(workoutId) === selected) return;
  rememberSelection();
  patchDraft({ workout_ids: selected ? [...ids, workoutId] : ids.filter((id) => id !== workoutId) });
};

const undo = () => {
  const previous = undoStack.pop();
  undoDepth.value = undoStack.size;
  if (previous) patchDraft(previous);
};

const setPersonalNote = (text: string) => {
  // 写了内容就把这个类别算进交付范围；清空不动开关——留/走是显式动作。
  patchDraft({ personal_note: text });
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

/** 重新选择原件：保住 id，预览/准备返回的状态还能对上这条引用。 */
const replaceAttachment = (id: string, next: AiTaskAttachmentRef) => {
  patchDraft({ attachments: draft.value.attachments.map((ref) => (ref.id === id ? { ...next, id } : ref)) });
};

export function useAiTaskDraft() {
  return {
    draft,
    dirty,
    canUndo,
    busy,
    lastError,
    savedNotice,
    loadTask,
    resetDraft,
    saveDraft,
    deleteTask,
    setTemplate,
    setCategoryEnabled,
    setCategoryDays: (category: AiTaskCategory, days: number) =>
      patchRange(category, { days_before: Math.max(0, Math.floor(days)) }),
    setIncludeWorkoutDay: (category: AiTaskCategory, include: boolean) =>
      patchRange(category, { include_workout_day: include }),
    setMetricExcluded,
    setWorkoutSelected,
    toggleWorkout: (workoutId: string) => setWorkoutSelected(workoutId, !draft.value.workout_ids.includes(workoutId)),
    undo,
    setPrompt: (prompt: string) => patchDraft({ prompt }),
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
