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
    <div class="sr-only">
      <h1 id="ai-page-title">{{ t.pageTitle }}</h1>
      <p>{{ t.intro }}</p>
    </div>
    <div class="head-task glass-control">
      <Icon name="edit" :size="14" class="title-glyph" />
      <input class="ai-input title-input" type="text" :value="draft.title" :placeholder="fallbackTitle"
        :aria-label="t.titleLabel" maxlength="120" @input="setTitle(($event.target as HTMLInputElement).value)" />
      <SelectMenu v-if="taskOptions.length" class="task-menu" :model-value="draft.id" :options="taskOptions"
        :placeholder="t.savedTasks" :aria-label="t.savedTasks" :menu-min-width="260" @update:model-value="openTask" />
      <span class="divider" aria-hidden="true"></span>
      <button type="button" class="head-btn" :title="t.newTask" :aria-label="t.newTask" @click="resetDraft()"><Icon name="plus" :size="15" /></button>
      <button type="button" :class="['head-btn', 'save', { dirty: dirty && draft.id }]" :disabled="!desktop || busy === 'save'"
        :title="dirty && draft.id ? t.unsaved : t.save" :aria-label="t.save" @click="save">
        <Icon :name="savedNotice ? 'circle-check' : 'check'" :size="15" />
      </button>
    </div>
    <p v-if="savedNotice" class="ai-note ok status" role="status"><Icon name="circle-check" :size="13" />{{ t.saved }}</p>
    <p v-if="lastError || libraryError" class="ai-note bad status" role="alert"><Icon name="warning" :size="13" />{{ lastError || libraryError }}</p>
  </header>
</template>

<style scoped>
/* 浮在关系网左上角的一枚玻璃胶囊：任务名直接在胶囊里改，旁边是已保存任务、新建、保存。 */
.head { display: grid; justify-items: start; gap: 6px; }
.head-task { display: flex; max-width: 100%; align-items: center; gap: 4px; padding: 4px 4px 4px 14px; border-radius: 999px; }
.title-glyph { flex: 0 0 auto; color: var(--subtle); }
.title-input { width: 240px; min-width: 0; padding: 6px 8px; border: 0; background: transparent; box-shadow: none; font-size: var(--fs-md); font-weight: 650; }
.title-input:focus { box-shadow: none; }
.task-menu { width: 170px; }
.task-menu :deep(.select-trigger) { min-height: 34px; border: 0; background: transparent; box-shadow: none; font-size: var(--fs-sm); }
.divider { width: 1px; height: 20px; margin: 0 4px; background: color-mix(in srgb, var(--ink) 14%, transparent); }
.head-btn { display: grid; width: 36px; height: 36px; flex: 0 0 36px; place-items: center; border: 0; border-radius: 50%; background: transparent; color: var(--ink); cursor: pointer; }
.head-btn:hover:not(:disabled) { background: var(--glass-press); }
.head-btn:disabled { opacity: .45; cursor: not-allowed; }
.head-btn.save.dirty { background: var(--accent); color: var(--accent-ink); }
.status { margin: 0; padding: 3px 12px; border-radius: 999px; background: var(--mat-glass); }
</style>
