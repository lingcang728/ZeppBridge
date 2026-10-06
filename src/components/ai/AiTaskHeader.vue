<script setup lang="ts">
/**
 * 页头：任务名胶囊——任务名、已保存的任务。
 *
 * 没有「+」和「✓」：只想把数据交给 AI 的人不需要先「新建」「保存」，导出时自动存；
 * 同名的草稿再导出会更新原来那条，已保存的任务里不会出现两条一模一样的。
 * 任务名单击就地改。右边那一格（钟 + 数量）是去「已保存的任务」二级页的入口（/ai/tasks，
 * 2026-10 起从下拉列表改成单独一页，从这枚胶囊长出来）。
 */
import { computed, nextTick, ref } from 'vue';
import Icon from '../Icon.vue';
import { useAiTaskDraft } from '../../composables/useAiTaskDraft';
import { useAiTaskLibrary } from '../../composables/useAiTaskLibrary';
import { defineMessages, useMessages } from '../../i18n';

const props = defineProps<{ fallbackTitle: string }>();

const { draft, lastError, savedNotice, setTitle } = useAiTaskDraft();
const { taskList, libraryError } = useAiTaskLibrary();

const t = useMessages(defineMessages(
  {
    pageTitle: '交给 AI',
    intro: '选运动、挑数据、写明想问什么，导出到桌面拖给 AI。',
    titleLabel: '任务名',
    rename: '点一下改名',
    historyCount: (count: number) => `已保存的任务（${count}）`,
    saved: '已保存',
  },
  {
    pageTitle: 'Send to AI',
    intro: 'Pick workouts, choose data, say what you want to know — export to desktop and drag into the AI.',
    titleLabel: 'Task name',
    rename: 'Click to rename',
    historyCount: (count: number) => `Saved tasks (${count})`,
    saved: 'Saved',
  },
  {
    pageTitle: 'Pasar a la IA',
    intro: 'Elige entrenamientos, selecciona datos, escribe qué consultar: exporta al escritorio y arrástralo a la IA.',
    titleLabel: 'Nombre de la tarea',
    rename: 'Clic para renombrar',
    historyCount: (count: number) => `Tareas guardadas (${count})`,
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

</script>

<template>
  <header class="head">
    <div class="sr-only">
      <h1 id="ai-page-title">{{ t.pageTitle }}</h1>
      <p>{{ t.intro }}</p>
    </div>
    <div class="head-task glass-control is-lens-host">
      <input v-if="editing" ref="titleInput" class="ai-input title-input" type="text" :value="shownTitle"
        :aria-label="t.titleLabel" maxlength="120"
        @blur="commitRename" @keydown.enter.prevent="commitRename" @keydown.esc.prevent="cancelRename" />
      <button v-else type="button" class="title-button" :title="t.rename" :aria-label="`${t.titleLabel}: ${shownTitle}`" @click="startRename">
        <span class="title-text">{{ shownTitle }}</span><Icon name="edit" :size="13" class="title-glyph" />
      </button>
      <span class="divider" aria-hidden="true"></span>
      <RouterLink to="/ai/tasks" class="history-btn" data-morph-card :title="t.historyCount(taskList.length)" :aria-label="t.historyCount(taskList.length)">
        <Icon name="clock" :size="15" /><span v-if="taskList.length" class="count">{{ taskList.length }}</span>
      </RouterLink>
    </div>
    <p v-if="savedNotice" class="ai-note ok status" role="status"><Icon name="circle-check" :size="13" />{{ t.saved }}</p>
    <p v-if="lastError || libraryError" class="ai-note bad status" role="alert"><Icon name="warning" :size="13" />{{ lastError || libraryError }}</p>
  </header>
</template>

<style scoped>
/* 列宽封顶在头部自己的宽度：否则网格按任务名的完整长度撑开，窄窗口里右边的天数胶囊被挤出画面。
   放不下时任务名先省略。 */
.head { display: grid; grid-template-columns: minmax(0, 100%); justify-items: start; gap: 6px; }
.head-task { display: flex; min-width: 0; max-width: 100%; align-items: center; gap: 4px; padding: 4px; border-radius: 999px; }
.title-button { display: inline-flex; min-width: 104px; max-width: 300px; align-items: center; gap: 8px; padding: 8px 12px 8px 16px; border: 0; border-radius: 999px;
  background: transparent; color: var(--ink); font: inherit; font-size: var(--fs-md); font-weight: 650; cursor: text; }
.title-button:hover { background: var(--glass-press); }
.title-text { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.title-glyph { flex: 0 0 auto; color: var(--subtle); }
.title-input { width: 280px; min-width: 0; padding: 7px 14px; border: 0; border-radius: 999px; background: var(--glass-press); box-shadow: none; font-size: var(--fs-md); font-weight: 650; }
.title-input:focus { box-shadow: 0 0 0 2px var(--focus); }
.divider { width: 1px; height: 20px; margin: 0 2px; background: color-mix(in srgb, var(--ink) 14%, transparent); }
.history-btn { display: inline-flex; min-width: 36px; height: 36px; align-items: center; justify-content: center; gap: 5px; padding: 0 12px; border: 0; border-radius: 999px;
  background: transparent; color: var(--ink); cursor: pointer; }
.history-btn { text-decoration: none; }
.history-btn:hover { background: var(--glass-press); }
.history-btn .count { color: var(--muted); font-size: var(--fs-xs); font-variant-numeric: tabular-nums; }

/* 很窄的窗口：任务名自己占一行，天数和记录挪到第二行，谁也不被挤出画面。 */
@media (max-width: 480px) {
  .head-task { flex-wrap: wrap; row-gap: 2px; border-radius: var(--radius-md); }
  .title-button { flex: 1 1 100%; max-width: none; }
  .head-task > .divider:first-of-type { display: none; }
}
.status { margin: 0; padding: 3px 12px; border-radius: 999px; background: var(--mat-glass); }
</style>
