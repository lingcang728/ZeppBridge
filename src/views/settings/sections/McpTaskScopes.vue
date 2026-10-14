<script setup lang="ts">
/**
 * 「允许本机 MCP 查询这个任务」从交给 AI 的选项里挪到这里（精修批次 5.2）：它管的是 MCP，不是这一次交给 AI。
 * 每个已保存的任务一个开关，只对以 `--scope task` 启动的 MCP 生效；默认的全库只读模式不受它限制。
 */
import GlassSwitch from '../../../components/GlassSwitch.vue';
import { onMounted, ref } from 'vue';
import { backend, isDesktop, toUserMessage } from '../../../lib/bridge';
import type { AiTaskSummary } from '../../../lib/bridge/types';
import { useAiTaskDraft } from '../../../composables/useAiTaskDraft';
import { useAiTaskLibrary } from '../../../composables/useAiTaskLibrary';
import { defineMessages, useMessages } from '../../../i18n';
import { aiCardMessages } from './ai.i18n';

const t = useMessages(defineMessages(
  {
    title: '按任务开放给 MCP',
    empty: '还没有保存的任务。交给 AI 一次，任务就会出现在这里。',
  },
  {
    title: 'Open tasks to MCP',
    empty: 'No saved tasks yet. Send something to an AI once and the task appears here.',
  },
  {
    title: 'Abrir tareas a MCP',
    empty: 'Aún no hay tareas guardadas. Envía algo a una IA una vez y la tarea aparecerá aquí.',
  },
  'views/settings/sections/McpTaskScopes',
));
const a = useMessages(aiCardMessages);
const { taskList, loadTaskList } = useAiTaskLibrary();
const { draft, setMcpShared } = useAiTaskDraft();
const busy = ref<string | null>(null);
const error = ref<string | null>(null);
onMounted(() => { if (isDesktop()) void loadTaskList(); });
const toggle = async (task: AiTaskSummary) => {
  busy.value = task.id;
  error.value = null;
  try {
    const full = await backend.aiTaskGet(task.id);
    await backend.aiTaskSave({ ...full, mcp_shared: !task.mcp_shared });
    if (draft.value.id === task.id) setMcpShared(!task.mcp_shared);
    await loadTaskList();
  } catch (e) {
    error.value = toUserMessage(e, '');
  } finally {
    busy.value = null;
  }
};
</script>

<template>
  <div class="s-row is-block">
    <div class="s-row-main">
      <span class="s-row-title">{{ t.title }}</span>
      <span class="s-row-sub scope-hint">{{ a.scopesHint }}</span>
    </div>
    <p v-if="!taskList.length" class="s-row-sub empty">{{ t.empty }}</p>
    <ul v-else class="scopes">
      <li v-for="task in taskList" :key="task.id">
        <span class="name">{{ task.title }}</span>
        <GlassSwitch :model-value="task.mcp_shared" :aria-label="task.title"
          :disabled="busy === task.id" @update:model-value="toggle(task)" />
      </li>
    </ul>
    <p v-if="error" class="hint-line" role="alert">{{ error }}</p>
  </div>
</template>

<style scoped src="../settings-local.css"></style>
<style scoped>
.scopes { display: grid; margin: 6px 0 0; padding: 0; list-style: none; }
.scopes li { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 7px 0; }
.scopes li + li { border-top: 1px solid var(--mat-line); }
.name { min-width: 0; overflow: hidden; color: var(--ink); font-size: var(--fs-sm); text-overflow: ellipsis; white-space: nowrap; }
.empty { margin-top: 8px; }
/* 正文字体会把「--」连写成一条长划，命令行参数 --scope 看起来就成了「—scope」。 */
.scope-hint { font-variant-ligatures: none; font-feature-settings: "liga" 0, "calt" 0; }
</style>
