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
import { AI_TASK_CATEGORY_META, categoryRangeOf, withCategoryRange } from '../lib/aiTask/categories';
import { createUndoStack } from '../lib/aiTask/undoStack';
import { useAiTaskLibrary } from './useAiTaskLibrary';
import { defineMessages, messagesOf } from '../i18n';

const messages = defineMessages(
  { loadFailed: '任务读取失败', saveFailed: '任务保存失败', deleteFailed: '任务删除失败', untitled: '未命名任务' },
  { loadFailed: 'Could not load task', saveFailed: 'Could not save task', deleteFailed: 'Could not delete task', untitled: 'Untitled task' },
  { loadFailed: 'No se pudo cargar la tarea', saveFailed: 'No se pudo guardar la tarea', deleteFailed: 'No se pudo eliminar la tarea', untitled: 'Tarea sin título' },
  'composables/useAiTaskDraft',
);
const copy = () => messagesOf(messages);

type Selection = Pick<AiTask, 'categories' | 'workout_ids' | 'template_id' | 'detail_level'>;

/** 最近一次进撤销栈的改动：撤销胶囊用它说「已移出『睡眠』」。 */
export interface DraftChange {
  seq: number;
  kind: 'category' | 'metric' | 'workout' | 'template';
  category?: AiTaskCategory;
  metric?: string;
  workoutId?: string;
  /** 改完以后它是不是在交付范围里（加入 / 保留 / 选中为 true）。 */
  included: boolean;
}

const library = useAiTaskLibrary();
const draft = ref<AiTask>(newTaskDraft());
/** 上次保存/加载时的快照；脏标记 = 现在 ≠ 基线。 */
const baseline = ref(taskSnapshot(draft.value));
const undoStack = createUndoStack<Selection>();
/* undoStack 是普通数组不是响应式；undoDepth 是它的响应式影子。 */
const undoDepth = ref(0);
const lastChange = ref<DraftChange | null>(null);
let changeSeq = 0;
const noteChange = (change: Omit<DraftChange, 'seq'>) => {
  changeSeq += 1;
  lastChange.value = { ...change, seq: changeSeq };
};
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
  lastChange.value = null;
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

/*
 * 异步回执的归属（代码审查 R03）：
 * - `draftGen`：草稿换了「是哪一份」就加一——载入、新建、删掉当前那份。
 *   回执回来时代次变了，说明用户已经去看别的任务，回执不许再碰草稿。
 * - `busyOwner`：busy 由最后开始的那个操作持有，旧操作的 finally 不替新操作清忙。
 * - `saveChain`：保存排队。第二次保存要等第一次拿到 id，否则两次都会新建。
 */
let draftGen = 0;
let busyOwner = 0;
let opSeq = 0;
let saveChain: Promise<unknown> = Promise.resolve();
let savesInFlight = 0;

const beginBusy = (kind: 'load' | 'save' | 'delete') => {
  opSeq += 1;
  busyOwner = opSeq;
  busy.value = kind;
  return opSeq;
};
const endBusy = (op: number) => {
  if (busyOwner === op) busy.value = false;
};

const loadTask = async (id: string) => {
  const op = beginBusy('load');
  draftGen += 1;
  const gen = draftGen;
  lastError.value = null;
  try {
    const task = await backend.aiTaskGet(id);
    if (gen !== draftGen) return; // 等待期间切到了别的任务或新建：丢掉旧回执
    replaceDraft(task);
    await library.ensureWorkouts(task.workout_ids);
  } catch (error) {
    if (gen === draftGen) lastError.value = toUserMessage(error, copy().loadFailed);
    throw error;
  } finally {
    endBusy(op);
  }
};

const resetDraft = () => {
  draftGen += 1;
  replaceDraft(newTaskDraft());
  lastError.value = null;
};

const showSavedNotice = () => {
  savedNotice.value = true;
  clearTimeout(savedNoticeTimer);
  savedNoticeTimer = setTimeout(() => {
    savedNotice.value = false;
  }, 4000);
};

/**
 * `fallbackTitle`：标题为空时存成什么（页面按模板和运动自动生成）。
 *
 * 没存过的草稿永远新建（代码审查 R02）：标题不是身份，同名的两个任务可以
 * 并存。存过一次后 `draft.id` 就有了，同一份草稿再存是原位更新。
 */
const saveDraft = (fallbackTitle?: string): Promise<AiTask> => {
  // 没有在途的保存就当场开始（拍下点击那一刻的草稿）；有就排在它后面。
  const run = savesInFlight === 0
    ? saveNow(fallbackTitle)
    : saveChain.then(() => saveNow(fallbackTitle));
  savesInFlight += 1;
  const settled = run.catch(() => undefined).finally(() => {
    savesInFlight -= 1;
  });
  saveChain = settled;
  return run;
};

const saveNow = async (fallbackTitle?: string): Promise<AiTask> => {
  const op = beginBusy('save');
  const gen = draftGen;
  const sentSnapshot = taskSnapshot(draft.value);
  lastError.value = null;
  try {
    const task = { ...draft.value };
    if (!task.title.trim()) task.title = fallbackTitle?.trim() || copy().untitled;
    const saved = await backend.aiTaskSave(task);
    if (gen === draftGen) {
      if (taskSnapshot(draft.value) === sentSnapshot) {
        draft.value = saved;
      } else {
        // 保存途中用户又改了：留住新改的内容，只认领后端分配的身份和时间；
        // 基线是已存的那版，所以仍是「有改动未保存」。
        draft.value = { ...draft.value, id: saved.id, created_at: saved.created_at, updated_at: saved.updated_at };
      }
      baseline.value = taskSnapshot(saved);
      showSavedNotice();
    }
    void library.loadTaskList();
    return saved;
  } catch (error) {
    if (gen === draftGen) lastError.value = toUserMessage(error, copy().saveFailed);
    throw error;
  } finally {
    endBusy(op);
  }
};

const deleteTask = async (id: string) => {
  const op = beginBusy('delete');
  lastError.value = null;
  try {
    await backend.aiTaskDelete(id);
    if (draft.value.id === id) resetDraft();
    await library.loadTaskList();
  } catch (error) {
    lastError.value = toUserMessage(error, copy().deleteFailed);
    throw error;
  } finally {
    endBusy(op);
  }
};

/** 选模板 = 选分析方向（带推荐数据范围）；null = 不用模板。问题不受影响。 */
const setTemplate = (template: AiTaskTemplate | null) => {
  if ((template?.id ?? null) === draft.value.template_id) return;
  rememberSelection();
  draft.value = template ? applyTemplateToDraft(draft.value, template) : { ...draft.value, template_id: null };
  noteChange({ kind: 'template', included: template !== null });
};

const setCategoryEnabled = (category: AiTaskCategory, enabled: boolean) => {
  if (categoryRangeOf(draft.value.categories, category).enabled === enabled) return;
  rememberSelection();
  patchRange(category, { enabled });
  noteChange({ kind: 'category', category, included: enabled });
};

/** 一次改所有数据类别的回溯天数（任务头的「最近 N 天」胶囊）。 */
const setWindowDays = (days: number) => {
  const next = Math.max(0, Math.floor(days));
  const windows = draft.value.categories.filter((range) => AI_TASK_CATEGORY_META[range.category].hasWindow);
  if (windows.every((range) => range.days_before === next)) return;
  rememberSelection();
  patchDraft({
    categories: draft.value.categories.map((range) => (
      AI_TASK_CATEGORY_META[range.category].hasWindow ? { ...range, days_before: next } : range
    )),
  });
};

const setMetricExcluded = (category: AiTaskCategory, metric: string, excluded: boolean) => {
  const current = categoryRangeOf(draft.value.categories, category).excluded_metrics ?? [];
  if (current.includes(metric) === excluded) return;
  rememberSelection();
  patchRange(category, {
    excluded_metrics: excluded ? [...current, metric] : current.filter((name) => name !== metric),
  });
  noteChange({ kind: 'metric', category, metric, included: !excluded });
};

const setWorkoutSelected = (workoutId: string, selected: boolean) => {
  const ids = draft.value.workout_ids;
  if (ids.includes(workoutId) === selected) return;
  rememberSelection();
  patchDraft({ workout_ids: selected ? [...ids, workoutId] : ids.filter((id) => id !== workoutId) });
  noteChange({ kind: 'workout', workoutId, included: selected });
};

const undo = () => {
  const previous = undoStack.pop();
  undoDepth.value = undoStack.size;
  lastChange.value = null;
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
    lastChange,
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
    setWindowDays,
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
