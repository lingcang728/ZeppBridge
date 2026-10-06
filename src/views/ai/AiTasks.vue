<script setup lang="ts">
/**
 * 已保存的任务（/ai/tasks，从任务名胶囊右边那一格长出来）。以前是一个下拉列表。
 *
 * - 每个任务一张卡：点卡接着用这个任务、回到总页；卡上改名（就地输入框）、置顶、删除。
 * - 删除后底部出一枚「撤销」胶囊（6 秒），撤销就是把删掉的那份原样存回去。
 * - 置顶的排在最前；没置顶、30 天没动过的收进「更早」折叠组，不删除。
 * - 只有交给过 AI 的任务才会被保存（交给 AI 那一下才存），同模板、同范围、同一句问题会更新原来那一条
 *   （后端 save_ai_task 去重）。
 */
import { computed, onBeforeUnmount, ref } from 'vue';
import { useRouter } from 'vue-router';
import PageHeader from '../../components/PageHeader.vue';
import Icon from '../../components/Icon.vue';
import { useAiHub } from '../../composables/ai/useAiHub';
import { useAiTaskDraft } from '../../composables/useAiTaskDraft';
import { useAiTaskLibrary } from '../../composables/useAiTaskLibrary';
import { useHubText } from '../../components/ai/hub/hub.i18n';
import { backend, toUserMessage } from '../../lib/bridge';
import type { AiTask, AiTaskSummary } from '../../lib/bridge/types';
import { displayDateTimeFormatter } from '../../lib/dateTime';
import '../../styles/ai-task.css';

defineOptions({ name: 'AiTasks' });
useAiHub();
const router = useRouter();
const { draft, loadTask, resetDraft, deleteTask, setTitle } = useAiTaskDraft();
const { taskList, libraryError, loadTaskList } = useAiTaskLibrary();
const h = useHubText();
const STALE_MS = 30 * 86_400_000;
const when = (iso: string) => {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso.slice(0, 16).replace('T', ' ');
  return displayDateTimeFormatter({ month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false }).format(date);
};
const stale = (task: AiTaskSummary) => !task.pinned && Date.now() - new Date(task.updated_at).getTime() > STALE_MS;
const recent = computed(() => taskList.value.filter((task) => !stale(task)));
const earlier = computed(() => taskList.value.filter(stale));
const error = ref<string | null>(null);

const open = async (id: string) => {
  if (id !== draft.value.id) await loadTask(id).catch(() => undefined);
  await router.push('/ai');
};
const fresh = async () => {
  resetDraft();
  await router.push('/ai');
};

/* —— 改名：卡上就地变输入框，回车 / 失焦确认，Esc 放弃 —— */
const renaming = ref<string | null>(null);
const commitRename = async (task: AiTaskSummary, event: Event) => {
  if (renaming.value !== task.id) return;
  renaming.value = null;
  const title = (event.target as HTMLInputElement).value.trim();
  if (!title || title === task.title) return;
  try {
    const full = await backend.aiTaskGet(task.id);
    await backend.aiTaskSave({ ...full, title });
    if (draft.value.id === task.id) setTitle(title);
    await loadTaskList();
  } catch (e) { error.value = toUserMessage(e, ''); }
};

const togglePin = async (task: AiTaskSummary) => {
  try {
    await backend.aiTaskSetPinned(task.id, !task.pinned);
    await loadTaskList();
  } catch (e) { error.value = toUserMessage(e, ''); }
};

/* —— 删除 + 撤销 —— */
const removed = ref<{ task: AiTask; pinned: boolean } | null>(null);
let undoTimer = 0;
const remove = async (task: AiTaskSummary) => {
  try {
    const full = await backend.aiTaskGet(task.id);
    await deleteTask(task.id);
    removed.value = { task: full, pinned: !!task.pinned };
    window.clearTimeout(undoTimer);
    undoTimer = window.setTimeout(() => { removed.value = null; }, 6000);
  } catch (e) { error.value = toUserMessage(e, ''); }
};
const undo = async () => {
  const item = removed.value;
  removed.value = null;
  window.clearTimeout(undoTimer);
  if (!item) return;
  try {
    await backend.aiTaskSave(item.task);
    if (item.pinned) await backend.aiTaskSetPinned(item.task.id, true);
    await loadTaskList();
  } catch (e) { error.value = toUserMessage(e, ''); }
};
onBeforeUnmount(() => window.clearTimeout(undoTimer));
</script>

<template>
  <section class="page ai-sub-page" aria-labelledby="ai-tasks-title">
    <PageHeader title-id="ai-tasks-title" :title="h.tasksTitle" :intro="h.tasksIntro">
      <button type="button" class="pill-button" @click="fresh"><Icon name="plus" :size="13" />{{ h.newTask }}</button>
    </PageHeader>
    <p v-if="libraryError || error" class="ai-message" role="alert"><Icon name="warning" :size="14" /><span>{{ libraryError || error }}</span></p>
    <div v-if="!taskList.length" class="ai-panel ai-empty">{{ h.tasksEmpty }}</div>
    <template v-for="(group, gi) in [recent, earlier]" :key="gi">
      <component :is="gi === 0 ? 'div' : 'details'" v-if="group.length" :class="['task-group', { earlier: gi === 1 }]">
        <summary v-if="gi === 1"><Icon name="chevron-right" :size="14" />{{ h.earlier(group.length) }}<small>{{ h.earlierHint }}</small></summary>
        <TransitionGroup tag="ul" name="task" class="task-grid">
          <li v-for="task in group" :key="task.id" :class="['task-card', { current: task.id === draft.id, pinned: task.pinned }]">
            <input v-if="renaming === task.id" class="ai-input rename" type="text" :value="task.title" maxlength="120" :aria-label="h.rename"
              @blur="commitRename(task, $event)" @keydown.enter.prevent="commitRename(task, $event)" @keydown.esc.prevent="renaming = null" />
            <button v-else type="button" class="open" @click="open(task.id)">
              <strong>{{ task.title }}</strong>
              <span class="meta">
                <time>{{ when(task.updated_at) }}</time>
                <span v-if="task.workout_count" class="tag"><Icon name="run" :size="12" />{{ task.workout_count }}</span>
                <span v-if="task.id === draft.id" class="tag current-tag"><Icon name="check" :size="12" />{{ h.current }}</span>
              </span>
            </button>
            <span class="acts">
              <button type="button" :class="['act', { on: task.pinned }]" :title="task.pinned ? h.unpin : h.pin" :aria-label="task.pinned ? h.unpin : h.pin" :aria-pressed="!!task.pinned" @click="togglePin(task)"><Icon name="pin" :size="14" /></button>
              <button type="button" class="act" :title="h.rename" :aria-label="h.rename" @click="renaming = task.id"><Icon name="edit" :size="14" /></button>
              <button type="button" class="act danger" :title="h.remove" :aria-label="h.remove" @click="remove(task)"><Icon name="trash" :size="14" /></button>
            </span>
          </li>
        </TransitionGroup>
      </component>
    </template>
    <Teleport to="body">
      <Transition name="undo-pill">
        <div v-if="removed" class="undo-toast glass-control" role="status">
          <span>{{ h.removed(removed.task.title) }}</span>
          <button type="button" class="pill-button" @click="undo"><Icon name="undo" :size="13" />{{ h.undo }}</button>
        </div>
      </Transition>
    </Teleport>
  </section>
</template>

<style scoped src="./aiPage.css"></style>
<style scoped>
.task-group + .task-group { margin-top: 18px; }
.task-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 12px; margin: 0; padding: 0; list-style: none; }
.task-card { position: relative; display: grid; grid-template-columns: minmax(0, 1fr) auto; align-items: start; gap: 8px; min-height: 96px; padding: 14px 12px 14px 18px;
  border: 1px solid var(--mat-line); border-radius: 18px; background: var(--mat-card); box-shadow: var(--mat-rim), var(--mat-shadow); }
.task-card.current { box-shadow: var(--mat-rim), 0 0 0 1.5px color-mix(in srgb, var(--accent) 60%, transparent), var(--mat-shadow); }
.task-card.pinned::before { content: ''; position: absolute; top: 14px; left: 0; width: 3px; height: 22px; border-radius: 0 3px 3px 0; background: var(--accent); }
.open { display: grid; gap: 10px; min-width: 0; padding: 2px 0; border: 0; background: none; color: var(--ink); font: inherit; text-align: left; cursor: pointer; }
.open strong { overflow: hidden; font-size: var(--fs-md); font-weight: 650; text-overflow: ellipsis; white-space: nowrap; }
.rename { width: 100%; font-weight: 650; }
.meta { display: flex; flex-wrap: wrap; align-items: center; gap: 4px 12px; color: var(--subtle); font-size: var(--fs-2xs); font-variant-numeric: tabular-nums; }
.tag { display: inline-flex; align-items: center; gap: 4px; }
.current-tag { color: var(--accent); }
.acts { display: flex; gap: 2px; opacity: .55; transition: opacity var(--dur-base) ease; }
.task-card:hover .acts, .task-card:focus-within .acts { opacity: 1; }
.act { display: grid; width: 30px; height: 30px; place-items: center; border: 0; border-radius: 50%; background: transparent; color: var(--muted); cursor: pointer; }
.act:hover { background: var(--glass-press); color: var(--ink); }
.act.on { color: var(--accent); }
.act.danger:hover { color: var(--danger); }
.earlier summary { display: flex; flex-wrap: wrap; align-items: center; gap: 4px 10px; margin-bottom: 12px; color: var(--muted); font-size: var(--fs-xs); cursor: pointer; list-style: none; }
.earlier summary::-webkit-details-marker { display: none; }
.earlier summary small { color: var(--subtle); font-size: var(--fs-2xs); }
.earlier[open] summary :deep(svg) { rotate: 90deg; }
.task-enter-active, .task-leave-active, .task-move { transition: opacity 300ms ease, translate 420ms cubic-bezier(.4, .6, .2, 1); }
.task-enter-from, .task-leave-to { opacity: 0; translate: 0 8px; }
.task-leave-active { position: absolute; }
.undo-toast { position: fixed; z-index: 60; left: 50%; bottom: 28px; display: flex; align-items: center; gap: 14px; padding: 8px 8px 8px 18px; border-radius: 999px; color: var(--ink); font-size: var(--fs-sm); translate: -50% 0; }
.undo-pill-enter-active { transition: translate 420ms cubic-bezier(.4, .6, .2, 1); }
.undo-pill-leave-active { transition: translate 260ms ease-in; }
.undo-pill-enter-from, .undo-pill-leave-to { translate: -50% calc(100% + 40px); }
</style>
