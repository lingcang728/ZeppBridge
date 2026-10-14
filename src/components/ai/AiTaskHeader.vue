<script setup lang="ts">
/**
 * 页头：任务名胶囊——任务名、已保存的任务。
 *
 * 没有「+」和「✓」：只想把数据交给 AI 的人不需要先「新建」「保存」，导出时自动存；
 * 同名的草稿再导出会更新原来那条，已保存的任务里不会出现两条一模一样的。
 * 任务名单击就地改（第四轮 1D·D6：胶囊里只留任务名，去掉铅笔——以前左上角那枚「⏱ 5」看不懂）。
 * 右边另起一枚小玻璃胶囊「已保存 N 个 ›」，是去「已保存的任务」二级页的入口（/ai/tasks，从这枚胶囊长出来）。
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
    savedCount: (count: number) => `已保存 ${count} 个`,
    saved: '已保存',
  },
  {
    pageTitle: 'Send to AI',
    intro: 'Pick workouts, choose data, say what you want to know — export to desktop and drag into the AI.',
    titleLabel: 'Task name',
    rename: 'Click to rename',
    historyCount: (count: number) => `Saved tasks (${count})`,
    savedCount: (count: number) => `${count} saved`,
    saved: 'Saved',
  },
  {
    pageTitle: 'Pasar a la IA',
    intro: 'Elige entrenamientos, selecciona datos, escribe qué consultar: exporta al escritorio y arrástralo a la IA.',
    titleLabel: 'Nombre de la tarea',
    rename: 'Clic para renombrar',
    historyCount: (count: number) => `Tareas guardadas (${count})`,
    savedCount: (count: number) => (count === 1 ? '1 guardada' : `${count} guardadas`),
    saved: 'Guardado',
  },
  'components/ai/AiTaskHeader',
));

/* —— 任务名：平时是一行字，点一下变输入框，回车 / 失焦确认，Esc 放弃 ——
   10-13（「点编辑栏是硬切」）：字留在原地不动（输入框的内边距和字一模一样），胶囊的宽度从此刻滑到新宽度，
   输入框的底色和焦点圈淡进来；收起时原路滑回去。 */
const editing = ref(false);
const titleInput = ref<HTMLInputElement | null>(null);
const pill = ref<HTMLElement | null>(null);
const shownTitle = computed(() => draft.value.title.trim() || props.fallbackTitle);
const reduced = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
/** 换成输入框 / 换回字：胶囊宽度从旧值滑到新值（只动这一块玻璃的 width，小元素，不碍事）。 */
const morph = async (change: () => void) => {
  const el = pill.value;
  const from = el?.getBoundingClientRect().width ?? 0;
  change();
  await nextTick();
  if (!el || reduced()) return;
  const to = el.getBoundingClientRect().width;
  if (from && Math.abs(to - from) > 1) el.animate([{ width: `${from}px` }, { width: `${to}px` }], { duration: 340, easing: 'cubic-bezier(.2, .8, .2, 1)' });
};
const startRename = async () => {
  await morph(() => { editing.value = true; });
  titleInput.value?.focus();
  titleInput.value?.select();
};
const commitRename = (event: Event) => {
  if (!editing.value) return;
  const value = (event.target as HTMLInputElement).value.trim();
  // 改回和自动标题一样的字就当没改：自动标题会跟着日期和范围更新。
  setTitle(value === props.fallbackTitle ? '' : value);
  void morph(() => { editing.value = false; });
};
const cancelRename = () => { void morph(() => { editing.value = false; }); };

</script>

<template>
  <header class="head">
    <div class="sr-only">
      <h1 id="ai-page-title">{{ t.pageTitle }}</h1>
      <p>{{ t.intro }}</p>
    </div>
    <div class="head-row">
    <div ref="pill" class="head-task glass-control is-lens-host">
      <input v-if="editing" ref="titleInput" class="ai-input title-input" type="text" :value="shownTitle"
        :aria-label="t.titleLabel" maxlength="120"
        @blur="commitRename" @keydown.enter.prevent="commitRename" @keydown.esc.prevent="cancelRename" />
      <button v-else type="button" class="title-button" :title="t.rename" :aria-label="`${t.titleLabel}: ${shownTitle}`" @click="startRename">
        <span class="title-text">{{ shownTitle }}</span>
      </button>
    </div>
    <RouterLink v-if="taskList.length" to="/ai/tasks" class="saved-link glass-control is-lens-host" data-sheet="tasks" :title="t.historyCount(taskList.length)">
      <span>{{ t.savedCount(taskList.length) }}</span><Icon name="chevron-right" :size="14" />
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
/* 任务名胶囊和「已保存 N 个」各是一块玻璃，并排；放不下时「已保存」换到下一行。 */
.head-row { display: flex; flex-wrap: wrap; align-items: center; gap: 10px; min-width: 0; max-width: 100%; }
.saved-link { display: inline-flex; height: 36px; align-items: center; gap: 4px; padding: 0 10px 0 14px; border-radius: 999px; color: var(--muted);
  font-size: var(--fs-xs); font-weight: 650; text-decoration: none; white-space: nowrap; transition: color var(--dur-base) ease, scale var(--dur-fast, 140ms) ease; }
.saved-link:hover { color: var(--ink); }
.saved-link:active { scale: .96; }
.saved-link:focus-visible { outline: 2px solid var(--focus); outline-offset: 2px; }
/* 输入框和字同一个内边距、同一个字号：字不跳；宽度跟着字走（field-sizing），底色和焦点圈淡进来。 */
.title-input { width: 280px; min-width: 104px; max-width: 360px; field-sizing: content; padding: 8px 12px 8px 16px; border: 0; border-radius: 999px; background: var(--glass-press);
  box-shadow: 0 0 0 2px var(--focus); font-size: var(--fs-md); font-weight: 650; line-height: inherit; animation: title-edit-in 280ms cubic-bezier(.2, .8, .2, 1) both; }
.title-input:focus { outline: none; }
@keyframes title-edit-in { from { background: transparent; box-shadow: 0 0 0 2px transparent; } }
@media (prefers-reduced-motion: reduce) { .title-input { animation: none; } }

/* 很窄的窗口：任务名自己占一行，天数和记录挪到第二行，谁也不被挤出画面。 */
@media (max-width: 480px) {
  .head-task { flex-wrap: wrap; row-gap: 2px; border-radius: var(--radius-md); }
  .title-button { flex: 1 1 100%; max-width: none; }
}
.status { margin: 0; padding: 3px 12px; border-radius: 999px; background: var(--mat-glass); }
</style>
