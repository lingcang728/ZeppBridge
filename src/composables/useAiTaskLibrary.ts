/**
 * 「交给 AI」页的只读资料：已保存任务列表、模板、可选运动。
 *
 * 和草稿编辑（`useAiTaskDraft`）分开：这里只管从后端取东西，不知道草稿
 * 长什么样；草稿需要补取运动时调用 `ensureWorkouts`，依赖方向单一。
 * 全局单例——页面缓存（KeepAlive）切回来不必重取。
 */
import { ref } from 'vue';
import { backend, toUserMessage } from '../lib/bridge';
import type { AiTaskSummary, AiTaskTemplate } from '../lib/bridge/types';
import type { Workout } from '../types';
import { defineMessages, messagesOf } from '../i18n';

const messages = defineMessages(
  { loadFailed: '任务资料读取失败' },
  { loadFailed: 'Could not load task data' },
  { loadFailed: 'No se pudieron cargar los datos de la tarea' },
  'composables/useAiTaskLibrary',
);

const taskList = ref<AiTaskSummary[]>([]);
const templates = ref<AiTaskTemplate[]>([]);
const recentWorkouts = ref<Workout[]>([]);
const libraryError = ref<string | null>(null);
/** 最近一次要求「必须在列表里」的运动 id——最近列表被覆盖后据此再补。 */
let pinnedIds: string[] = [];

const fail = (error: unknown) => {
  libraryError.value = toUserMessage(error, messagesOf(messages).loadFailed);
};

const loadTaskList = async () => {
  try {
    taskList.value = await backend.aiTaskList();
  } catch (error) {
    fail(error);
  }
};

const loadTemplates = async () => {
  try {
    templates.value = await backend.aiTemplateList();
  } catch (error) {
    fail(error);
  }
};

/**
 * 任务里关联的运动可能落在「最近 N 条」之外（老任务）。缺的按 id 一条条
 * 补进来；单条补取失败不拖死整页——只是少这一条，不编一条假的。
 */
const ensureWorkouts = async (ids: string[]) => {
  pinnedIds = [...ids];
  const known = new Set(recentWorkouts.value.map((workout) => workout.workout_id));
  const missing = ids.filter((id) => !known.has(id));
  if (!missing.length) return;
  const fetched = await Promise.all(missing.map((id) => backend.getWorkoutDetail(id).catch(() => null)));
  // 补取期间最近列表可能刚被刷过——按此刻的集合再判一次，别重复塞。
  const have = new Set(recentWorkouts.value.map((workout) => workout.workout_id));
  const extra = fetched.filter((workout): workout is Workout => workout !== null && !have.has(workout.workout_id));
  if (extra.length) recentWorkouts.value = [...recentWorkouts.value, ...extra];
};

const loadRecentWorkouts = async (limit = 60) => {
  try {
    recentWorkouts.value = await backend.getRecentWorkouts(limit);
    // 覆盖赋值会冲掉上一轮补进来的关联运动，落地后按记住的 id 再补一遍。
    await ensureWorkouts(pinnedIds);
  } catch (error) {
    fail(error);
  }
};

const findTemplate = (id: string | null | undefined): AiTaskTemplate | null =>
  (id ? templates.value.find((template) => template.id === id) : undefined) ?? null;

export function useAiTaskLibrary() {
  return {
    taskList,
    templates,
    recentWorkouts,
    libraryError,
    loadTaskList,
    loadTemplates,
    loadRecentWorkouts,
    ensureWorkouts,
    findTemplate,
  };
}
