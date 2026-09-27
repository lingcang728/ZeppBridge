<script setup lang="ts">
/**
 * 页头：一枚浮在关系网左上角的玻璃胶囊——任务名、回溯范围、交付记录。
 *
 * 没有「+」和「✓」：只想把数据交给 AI 的人不需要先「新建」「保存」，导出时自动存；
 * 同名的草稿再导出会更新原来那条，交付记录里不会出现两条一模一样的。
 * 任务名单击就地改；「最近 N 天」直接在胶囊里拨，一次改所有数据类别的窗口。
 */
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue';
import Icon from '../Icon.vue';
import SegmentTrack from '../SegmentTrack.vue';
import { useAiTaskDraft } from '../../composables/useAiTaskDraft';
import { useAiTaskLibrary } from '../../composables/useAiTaskLibrary';
import { recentWindowDays } from '../../lib/aiTask/title';
import { displayDateTimeFormatter } from '../../lib/dateTime';
import { defineMessages, useMessages } from '../../i18n';

const props = defineProps<{ fallbackTitle: string }>();

const { draft, lastError, savedNotice, setTitle, setWindowDays, resetDraft, loadTask } = useAiTaskDraft();
const { taskList, libraryError } = useAiTaskLibrary();

const t = useMessages(defineMessages(
  {
    pageTitle: '交给 AI',
    intro: '选运动、挑数据、说清楚想问什么，导出到桌面后直接拖给 AI。',
    titleLabel: '任务名',
    rename: '点一下改名',
    rangeLabel: '回溯范围',
    days: (n: number) => `${n} 天`,
    history: '交付记录',
    historyCount: (count: number) => `交付记录（${count}）`,
    historyEmpty: '还没有交付过',
    newTask: '新任务',
    saved: '已保存',
  },
  {
    pageTitle: 'Hand to AI',
    intro: 'Pick a workout, choose the data, say what you want to know — export to the desktop and drag it into the AI.',
    titleLabel: 'Task name',
    rename: 'Click to rename',
    rangeLabel: 'Look-back range',
    days: (n: number) => `${n} days`,
    history: 'Handoff history',
    historyCount: (count: number) => `Handoff history (${count})`,
    historyEmpty: 'Nothing handed off yet',
    newTask: 'New task',
    saved: 'Saved',
  },
  {
    pageTitle: 'Pasar a la IA',
    intro: 'Elige un entrenamiento, escoge los datos, di qué quieres saber: exporta al escritorio y arrástralo a la IA.',
    titleLabel: 'Nombre de la tarea',
    rename: 'Haz clic para renombrar',
    rangeLabel: 'Periodo',
    days: (n: number) => `${n} días`,
    history: 'Historial de entregas',
    historyCount: (count: number) => `Historial de entregas (${count})`,
    historyEmpty: 'Aún no has entregado nada',
    newTask: 'Nueva tarea',
    saved: 'Guardado',
  },
  'components/ai/AiTaskHeader',
));

/* —— 任务名：平时是一行字，点一下变输入框，回车 / 失焦确认，Esc 放弃 —— */
const editing = ref(false);
const titleInput = ref<HTMLInputElement | null>(null);
const shownTitle = computed(() => draft.value.title.trim() || props.fallbackTitle);
const startRename = async () => {
  editing.value = true;
  await nextTick();
  titleInput.value?.select();
};
const commitRename = (event: Event) => {
  if (!editing.value) return;
  const value = (event.target as HTMLInputElement).value.trim();
  // 改回和自动标题一样的字就当没改：自动标题会跟着日期和范围更新。
  setTitle(value === props.fallbackTitle ? '' : value);
  editing.value = false;
};
const cancelRename = () => { editing.value = false; };

/* —— 回溯范围：一次改全部数据类别 —— */
const RANGE_CHOICES = [7, 14, 30, 90];
const rangeItems = computed(() => RANGE_CHOICES.map((days) => ({ value: days, label: t.value.days(days) })));
const windowDays = computed(() => recentWindowDays(draft.value));

/* —— 交付记录 —— */
const historyOpen = ref(false);
const root = ref<HTMLElement | null>(null);
const whenText = (iso: string) => {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso.slice(0, 16).replace('T', ' ');
  return displayDateTimeFormatter({ month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false }).format(date);
};
const openTask = (id: string) => {
  historyOpen.value = false;
  if (id !== draft.value.id) void loadTask(id).catch(() => undefined);
};
const startNew = () => {
  historyOpen.value = false;
  resetDraft();
};
const onOutside = (event: PointerEvent) => {
  if (historyOpen.value && !root.value?.contains(event.target as Node)) historyOpen.value = false;
};
const onKey = (event: KeyboardEvent) => {
  if (event.key === 'Escape' && historyOpen.value) historyOpen.value = false;
};
onMounted(() => {
  document.addEventListener('pointerdown', onOutside, true);
  document.addEventListener('keydown', onKey);
});
onBeforeUnmount(() => {
  document.removeEventListener('pointerdown', onOutside, true);
  document.removeEventListener('keydown', onKey);
});
</script>

<template>
  <header ref="root" class="head">
    <div class="sr-only">
      <h1 id="ai-page-title">{{ t.pageTitle }}</h1>
      <p>{{ t.intro }}</p>
    </div>
    <div class="head-task glass-control">
      <input v-if="editing" ref="titleInput" class="ai-input title-input" type="text" :value="shownTitle"
        :aria-label="t.titleLabel" maxlength="120"
        @blur="commitRename" @keydown.enter.prevent="commitRename" @keydown.esc.prevent="cancelRename" />
      <button v-else type="button" class="title-button" :title="t.rename" :aria-label="`${t.titleLabel}: ${shownTitle}`" @click="startRename">
        <span class="title-text">{{ shownTitle }}</span><Icon name="edit" :size="13" class="title-glyph" />
      </button>
      <span class="divider" aria-hidden="true"></span>
      <SegmentTrack compact variant="bare" class="range-track" :items="rangeItems" :model-value="windowDays"
        :aria-label="t.rangeLabel" @update:model-value="(value) => setWindowDays(Number(value))" />
      <span class="divider" aria-hidden="true"></span>
      <button type="button" :class="['history-btn', { on: historyOpen }]" :title="t.historyCount(taskList.length)"
        :aria-label="t.historyCount(taskList.length)" :aria-expanded="historyOpen" aria-controls="ai-task-history"
        @click="historyOpen = !historyOpen">
        <Icon name="clock" :size="15" /><span v-if="taskList.length" class="count">{{ taskList.length }}</span>
      </button>
    </div>

    <Transition name="history">
      <div v-if="historyOpen" id="ai-task-history" class="history glass-control" role="listbox" :aria-label="t.history">
        <div class="history-head">
          <p class="history-title">{{ t.history }}</p>
          <button type="button" class="pill-button quiet new-task" @click="startNew"><Icon name="plus" :size="13" />{{ t.newTask }}</button>
        </div>
        <p v-if="!taskList.length" class="history-empty">{{ t.historyEmpty }}</p>
        <button v-for="task in taskList" :key="task.id" type="button" role="option" :aria-selected="task.id === draft.id"
          :class="['history-row', { current: task.id === draft.id }]" @click="openTask(task.id)">
          <span class="row-mark" aria-hidden="true"><Icon v-if="task.id === draft.id" name="check" :size="13" /></span>
          <span class="row-name">{{ task.title }}</span>
          <span class="row-when">{{ whenText(task.updated_at) }}</span>
        </button>
      </div>
    </Transition>
    <p v-if="savedNotice" class="ai-note ok status" role="status"><Icon name="circle-check" :size="13" />{{ t.saved }}</p>
    <p v-if="lastError || libraryError" class="ai-note bad status" role="alert"><Icon name="warning" :size="13" />{{ lastError || libraryError }}</p>
  </header>
</template>

<style scoped>
.head { display: grid; justify-items: start; gap: 6px; }
.head-task { display: flex; max-width: 100%; align-items: center; gap: 4px; padding: 4px; border-radius: 999px; }
.title-button { display: inline-flex; min-width: 0; max-width: 300px; align-items: center; gap: 8px; padding: 8px 12px 8px 16px; border: 0; border-radius: 999px;
  background: transparent; color: var(--ink); font: inherit; font-size: var(--fs-md); font-weight: 650; cursor: text; }
.title-button:hover { background: var(--glass-press); }
.title-text { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.title-glyph { flex: 0 0 auto; color: var(--subtle); }
.title-input { width: 280px; min-width: 0; padding: 7px 14px; border: 0; border-radius: 999px; background: var(--glass-press); box-shadow: none; font-size: var(--fs-md); font-weight: 650; }
.title-input:focus { box-shadow: 0 0 0 2px var(--focus); }
.divider { width: 1px; height: 20px; margin: 0 2px; background: color-mix(in srgb, var(--ink) 14%, transparent); }
.range-track { flex: 0 0 auto; }
.history-btn { display: inline-flex; min-width: 36px; height: 36px; align-items: center; justify-content: center; gap: 5px; padding: 0 12px; border: 0; border-radius: 999px;
  background: transparent; color: var(--ink); cursor: pointer; }
.history-btn:hover, .history-btn.on { background: var(--glass-press); }
.history-btn .count { color: var(--muted); font-size: var(--fs-xs); font-variant-numeric: tabular-nums; }

/* 交付记录：三列对齐——当前标记、任务名、时间；时间右对齐、等宽数字。 */
.history { display: grid; width: min(420px, 100%); max-height: 340px; gap: 2px; overflow-y: auto; padding: 8px; border-radius: var(--radius-md); overscroll-behavior: contain; }
.history-head { display: flex; align-items: center; justify-content: space-between; gap: 8px; margin: 2px 4px 6px 8px; }
.history-title { margin: 0; color: var(--subtle); font-size: var(--fs-xs); font-weight: 600; }
.new-task { min-height: 30px; padding: 0 12px; font-size: var(--fs-xs); }
.history-empty { margin: 4px 8px 8px; color: var(--subtle); font-size: var(--fs-xs); }
.history-row { display: grid; grid-template-columns: 16px minmax(0, 1fr) auto; align-items: center; gap: 10px; padding: 9px 12px; border: 0; border-radius: 14px;
  background: transparent; color: var(--ink); text-align: left; cursor: pointer; }
.history-row:hover { background: var(--glass-press); }
.history-row.current { background: color-mix(in srgb, var(--accent) 12%, transparent); }
.row-mark { display: grid; place-items: center; color: var(--accent); }
.row-name { min-width: 0; overflow: hidden; font-size: var(--fs-sm); text-overflow: ellipsis; white-space: nowrap; }
.row-when { color: var(--subtle); font-size: var(--fs-xs); font-variant-numeric: tabular-nums; text-align: right; white-space: nowrap; }
.history-enter-active, .history-leave-active { transition: opacity .22s ease, translate .32s var(--ease-out), filter .22s ease; }
.history-enter-from, .history-leave-to { opacity: 0; translate: 0 -6px; filter: blur(6px); }
.status { margin: 0; padding: 3px 12px; border-radius: 999px; background: var(--mat-glass); }
</style>
