<script setup lang="ts">
/**
 * 页头：任务名（可直接改，空着就用自动生成的名字）、已保存任务切换、
 * 新建、保存。任务名不再是一个必须先填的大表单项。
 */
import { computed } from 'vue';
import Icon from '../Icon.vue';
import SelectMenu, { type SelectMenuOption } from '../SelectMenu.vue';
import { isDesktop } from '../../lib/bridge';
import { useAiTaskDraft } from '../../composables/useAiTaskDraft';
import { useAiTaskLibrary } from '../../composables/useAiTaskLibrary';
import { defineMessages, useMessages } from '../../i18n';

const props = defineProps<{ fallbackTitle: string }>();

const { draft, dirty, busy, lastError, savedNotice, setTitle, saveDraft, resetDraft, loadTask } = useAiTaskDraft();
const { taskList, libraryError } = useAiTaskLibrary();
const desktop = isDesktop();

const t = useMessages(defineMessages(
  {
    pageTitle: '交给 AI',
    intro: '选运动、挑数据、说清楚想问什么，导出到桌面后直接拖给 AI。',
    titleLabel: '任务名',
    savedTasks: '已保存的任务',
    newTask: '新建',
    save: '保存',
    saved: '已保存',
    unsaved: '有未保存的修改',
  },
  {
    pageTitle: 'Hand to AI',
    intro: 'Pick a workout, choose the data, say what you want to know — export to the desktop and drag it into the AI.',
    titleLabel: 'Task name',
    savedTasks: 'Saved tasks',
    newTask: 'New',
    save: 'Save',
    saved: 'Saved',
    unsaved: 'Unsaved changes',
  },
  {
    pageTitle: 'Pasar a la IA',
    titleLabel: 'Nombre de la tarea',
    savedTasks: 'Tareas guardadas',
    newTask: 'Nueva',
    save: 'Guardar',
    saved: 'Guardado',
  },
  'components/ai/AiTaskHeader',
));

const taskOptions = computed<SelectMenuOption[]>(() =>
  taskList.value.map((task) => ({ value: task.id, label: task.title, hint: task.updated_at.slice(0, 10) })));

const openTask = (id: string | number) => {
  if (String(id) !== draft.value.id) void loadTask(String(id)).catch(() => undefined);
};
const save = () => void saveDraft(props.fallbackTitle).catch(() => undefined);
</script>

<template>
  <header class="head">
    <div class="head-main">
      <h1 id="ai-page-title" class="page-title">{{ t.pageTitle }}</h1>
      <p class="intro">{{ t.intro }}</p>
    </div>
    <div class="head-task">
      <input class="ai-input title-input" type="text" :value="draft.title" :placeholder="fallbackTitle"
        :aria-label="t.titleLabel" maxlength="120" @input="setTitle(($event.target as HTMLInputElement).value)" />
      <SelectMenu v-if="taskOptions.length" class="task-menu" :model-value="draft.id" :options="taskOptions"
        :placeholder="t.savedTasks" :aria-label="t.savedTasks" :menu-min-width="260" @update:model-value="openTask" />
      <button type="button" class="ai-tool" @click="resetDraft()"><Icon name="plus" :size="13" />{{ t.newTask }}</button>
      <button type="button" class="ai-tool" :disabled="!desktop || busy === 'save'" @click="save">
        <Icon name="check" :size="13" />{{ t.save }}
      </button>
    </div>
    <p v-if="savedNotice" class="ai-note ok status" role="status"><Icon name="circle-check" :size="13" />{{ t.saved }}</p>
    <p v-else-if="dirty && draft.id" class="ai-note status">{{ t.unsaved }}</p>
    <p v-if="lastError || libraryError" class="ai-note bad status" role="alert"><Icon name="warning" :size="13" />{{ lastError || libraryError }}</p>
  </header>
</template>

<style scoped>
.head { display: flex; flex-wrap: wrap; align-items: flex-end; justify-content: space-between; gap: 10px 20px; margin-bottom: 16px; }
.head-main { min-width: 0; }
.page-title { margin: 0 0 4px; font-size: var(--fs-3xl); }
.intro { margin: 0; color: var(--muted); }
.head-task { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; }
.title-input { width: 260px; padding-block: 6px; font-size: var(--fs-sm); }
.task-menu { width: 200px; }
.task-menu :deep(.select-trigger) { min-height: 32px; font-size: var(--fs-sm); }
.status { flex-basis: 100%; justify-content: flex-end; margin: 0; }
</style>
