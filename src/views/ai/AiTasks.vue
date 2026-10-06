<script setup lang="ts">
/**
 * 已保存的任务（/ai/tasks，从任务名胶囊右边那一格长出来）。以前是一个下拉列表。
 * 点一张任务卡：接着用这个任务，回到总页。右上角「新任务」从空白开始。
 * （批次 5 会加改名、删除带撤销、置顶、自动去重和 30 天收进「更早」。）
 */
import { useRouter } from 'vue-router';
import PageHeader from '../../components/PageHeader.vue';
import Icon from '../../components/Icon.vue';
import { useAiHub } from '../../composables/ai/useAiHub';
import { useAiTaskDraft } from '../../composables/useAiTaskDraft';
import { useAiTaskLibrary } from '../../composables/useAiTaskLibrary';
import { useHubText } from '../../components/ai/hub/hub.i18n';
import { displayDateTimeFormatter } from '../../lib/dateTime';
import '../../styles/ai-task.css';

defineOptions({ name: 'AiTasks' });
useAiHub();
const router = useRouter();
const { draft, loadTask, resetDraft } = useAiTaskDraft();
const { taskList, libraryError } = useAiTaskLibrary();
const h = useHubText();
const when = (iso: string) => {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso.slice(0, 16).replace('T', ' ');
  return displayDateTimeFormatter({ month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false }).format(date);
};
const open = async (id: string) => {
  if (id !== draft.value.id) await loadTask(id).catch(() => undefined);
  await router.push('/ai');
};
const fresh = async () => {
  resetDraft();
  await router.push('/ai');
};
</script>

<template>
  <section class="page ai-sub-page" aria-labelledby="ai-tasks-title">
    <PageHeader title-id="ai-tasks-title" :title="h.tasksTitle" :intro="h.tasksIntro">
      <button type="button" class="pill-button" @click="fresh"><Icon name="plus" :size="13" />{{ h.newTask }}</button>
    </PageHeader>
    <p v-if="libraryError" class="ai-message" role="alert"><Icon name="warning" :size="14" /><span>{{ libraryError }}</span></p>
    <div v-if="!taskList.length" class="ai-panel ai-empty">{{ h.tasksEmpty }}</div>
    <ul v-else class="task-grid">
      <li v-for="task in taskList" :key="task.id">
        <button type="button" :class="['task-card', { current: task.id === draft.id }]" @click="open(task.id)">
          <strong>{{ task.title }}</strong>
          <span class="meta">
            <time>{{ when(task.updated_at) }}</time>
            <span v-if="task.workout_count" class="workouts"><Icon name="run" :size="12" />{{ task.workout_count }}</span>
            <span v-if="task.id === draft.id" class="current-tag"><Icon name="check" :size="12" />{{ h.current }}</span>
          </span>
        </button>
      </li>
    </ul>
  </section>
</template>

<style scoped src="./aiPage.css"></style>
<style scoped>
.task-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(260px, 1fr)); gap: 12px; margin: 0; padding: 0; list-style: none; }
.task-card { display: grid; width: 100%; gap: 10px; min-height: 96px; padding: 16px 18px; border: 1px solid var(--mat-line); border-radius: 18px;
  background: var(--mat-card); box-shadow: var(--mat-rim), var(--mat-shadow); color: var(--ink); font: inherit; text-align: left; cursor: pointer;
  transition: background var(--dur-base) ease, translate var(--dur-base) var(--ease-out); }
.task-card:hover { background: color-mix(in srgb, var(--ink) 3%, var(--mat-card)); translate: 0 -1px; }
.task-card.current { box-shadow: var(--mat-rim), 0 0 0 1.5px color-mix(in srgb, var(--accent) 60%, transparent), var(--mat-shadow); }
.task-card strong { overflow: hidden; font-size: var(--fs-md); font-weight: 650; text-overflow: ellipsis; white-space: nowrap; }
.meta { display: flex; flex-wrap: wrap; align-items: center; gap: 4px 12px; color: var(--subtle); font-size: var(--fs-2xs); font-variant-numeric: tabular-nums; }
.workouts, .current-tag { display: inline-flex; align-items: center; gap: 4px; }
.current-tag { color: var(--accent); }
</style>
