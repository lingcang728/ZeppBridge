<script setup lang="ts">
/**
 * 页头：任务名（可直接改，空着就用自动生成的名字）、已保存任务、新建、保存。
 *
 * 已保存的任务是一枚带数字的文件夹按钮，点开是一张玻璃清单。以前这里是一个下拉，
 * 当前任务的名字在输入框里写一遍、下拉里又写一遍，「最近 14 天 · 9月27日」并排出现两次。
 */
import { onBeforeUnmount, onMounted, ref } from 'vue';
import Icon from '../Icon.vue';
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
    savedCount: (count: number) => `已保存的任务（${count}）`,
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
    savedCount: (count: number) => `Saved tasks (${count})`,
  },
  {
    pageTitle: 'Pasar a la IA',
    titleLabel: 'Nombre de la tarea',
    savedTasks: 'Tareas guardadas',
    newTask: 'Nueva',
    save: 'Guardar',
    saved: 'Guardado',
    savedCount: (count: number) => `Tareas guardadas (${count})`,
  },
  'components/ai/AiTaskHeader',
));

const libraryOpen = ref(false);
const libraryRoot = ref<HTMLElement | null>(null);
const openTask = (id: string) => {
  libraryOpen.value = false;
  if (id !== draft.value.id) void loadTask(id).catch(() => undefined);
};
/* 点清单外面或按 Esc 收起。 */
const onOutside = (event: PointerEvent) => {
  if (libraryOpen.value && !libraryRoot.value?.contains(event.target as Node)) libraryOpen.value = false;
};
const onKey = (event: KeyboardEvent) => {
  if (event.key === 'Escape' && libraryOpen.value) libraryOpen.value = false;
};
onMounted(() => {
  document.addEventListener('pointerdown', onOutside, true);
  document.addEventListener('keydown', onKey);
});
onBeforeUnmount(() => {
  document.removeEventListener('pointerdown', onOutside, true);
  document.removeEventListener('keydown', onKey);
});
const save = () => void saveDraft(props.fallbackTitle).catch(() => undefined);
</script>

<template>
  <header ref="libraryRoot" class="head">
    <div class="sr-only">
      <h1 id="ai-page-title">{{ t.pageTitle }}</h1>
      <p>{{ t.intro }}</p>
    </div>
    <div class="head-task glass-control">
      <Icon name="edit" :size="14" class="title-glyph" />
      <input class="ai-input title-input" type="text" :value="draft.title" :placeholder="fallbackTitle"
        :aria-label="t.titleLabel" maxlength="120" @input="setTitle(($event.target as HTMLInputElement).value)" />
      <span class="divider" aria-hidden="true"></span>
      <button v-if="taskList.length" type="button" :class="['head-btn', 'library-btn', { on: libraryOpen }]"
        :title="t.savedCount(taskList.length)" :aria-label="t.savedCount(taskList.length)" :aria-expanded="libraryOpen"
        aria-controls="ai-task-library" @click="libraryOpen = !libraryOpen">
        <Icon name="folder" :size="15" /><span class="count">{{ taskList.length }}</span>
      </button>
      <button type="button" class="head-btn" :title="t.newTask" :aria-label="t.newTask" @click="resetDraft()"><Icon name="plus" :size="15" /></button>
      <button type="button" :class="['head-btn', 'save', { dirty: dirty && draft.id }]" :disabled="!desktop || busy === 'save'"
        :title="dirty && draft.id ? t.unsaved : t.save" :aria-label="t.save" @click="save">
        <Icon :name="savedNotice ? 'circle-check' : 'check'" :size="15" />
      </button>
    </div>
    <Transition name="library">
      <div v-if="libraryOpen" id="ai-task-library" class="library glass-control" role="listbox" :aria-label="t.savedTasks">
        <p class="library-title">{{ t.savedTasks }}</p>
        <button v-for="task in taskList" :key="task.id" type="button" role="option" :aria-selected="task.id === draft.id"
          :class="['library-row', { current: task.id === draft.id }]" @click="openTask(task.id)">
          <span class="library-name">{{ task.title }}</span>
          <span class="library-date">{{ task.updated_at.slice(0, 10) }}</span>
          <Icon v-if="task.id === draft.id" name="check" :size="14" class="library-check" />
        </button>
      </div>
    </Transition>
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
.divider { width: 1px; height: 20px; margin: 0 4px; background: color-mix(in srgb, var(--ink) 14%, transparent); }
.head-btn { display: grid; width: 36px; height: 36px; flex: 0 0 36px; place-items: center; border: 0; border-radius: 50%; background: transparent; color: var(--ink); cursor: pointer; }
.head-btn:hover:not(:disabled) { background: var(--glass-press); }
.head-btn:disabled { opacity: .45; cursor: not-allowed; }
.head-btn.save.dirty { background: var(--accent); color: var(--accent-ink); }
.library-btn { width: auto; min-width: 36px; gap: 5px; display: inline-flex; align-items: center; justify-content: center; padding: 0 10px; border-radius: 999px; }
.library-btn .count { color: var(--muted); font-size: var(--fs-xs); font-variant-numeric: tabular-nums; }
.library-btn.on { background: var(--glass-press); }

/* 已保存任务清单：挂在胶囊下面的一张玻璃卡，一行一个任务，当前那个打勾。 */
.library { display: grid; width: min(360px, 100%); max-height: 320px; gap: 2px; overflow-y: auto; padding: 8px; border-radius: var(--radius-md); overscroll-behavior: contain; }
.library-title { margin: 2px 8px 6px; color: var(--subtle); font-size: var(--fs-xs); font-weight: 600; }
.library-row { display: flex; align-items: center; gap: 10px; padding: 9px 12px; border: 0; border-radius: 14px; background: transparent; color: var(--ink); text-align: left; cursor: pointer; }
.library-row:hover { background: var(--glass-press); }
.library-row.current { background: color-mix(in srgb, var(--accent) 12%, transparent); }
.library-name { flex: 1; min-width: 0; overflow: hidden; font-size: var(--fs-sm); text-overflow: ellipsis; white-space: nowrap; }
.library-date { color: var(--subtle); font-size: var(--fs-xs); font-variant-numeric: tabular-nums; }
.library-check { color: var(--accent); }
.library-enter-active, .library-leave-active { transition: opacity .22s ease, translate .32s var(--ease-out), filter .22s ease; }
.library-enter-from, .library-leave-to { opacity: 0; translate: 0 -6px; filter: blur(6px); }
.status { margin: 0; padding: 3px 12px; border-radius: 999px; background: var(--mat-glass); }
</style>
