<script setup lang="ts">
/**
 * 「AI 最近的改动」（3.1.2）：本地 AI 通过 MCP 写的每一条都在这里，逐条撤销。
 * 新增的撤销 = 删掉；修改的撤销 = 改回原样；之后又被改过的，后端拒绝（err.mcp_writes.stale）。
 * 标题和那句话是用户 / AI 写的数据，原样显示；来源是客户端自报的名字。
 */
import { computed, onMounted, ref } from 'vue';
import { backend, isDesktop, toUserMessage } from '../../../lib/bridge';
import type { McpWrite } from '../../../lib/bridge/types';
import { locale, useMessages } from '../../../i18n';
import { aiCardMessages } from './ai.i18n';

const a = useMessages(aiCardMessages);
const writes = ref<McpWrite[]>([]);
const busy = ref<number | null>(null);
const error = ref<string | null>(null);

onMounted(async () => {
  if (!isDesktop()) return;
  try {
    writes.value = await backend.mcpWritesList();
  } catch {
    writes.value = [];
  }
});

const kindName = computed<Record<McpWrite['kind'], string>>(() => ({
  injury: a.value.writeKindInjury,
  life_event: a.value.writeKindLifeEvent,
  race: a.value.writeKindRace,
  shoe: a.value.writeKindShoe,
  workout_feel: a.value.writeKindWorkoutFeel,
  workout_type: a.value.writeKindWorkoutType,
  coach_note: a.value.writeKindCoachNote,
}));

const when = (iso: string) => {
  const date = new Date(iso);
  return Number.isNaN(date.getTime())
    ? ''
    : date.toLocaleString(locale.value, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
};

const undo = async (write: McpWrite) => {
  busy.value = write.id;
  error.value = null;
  try {
    writes.value = await backend.mcpWriteUndo(write.id);
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
      <span class="s-row-title">{{ a.writesTitle }}</span>
      <span v-if="!writes.length" class="s-row-sub">{{ a.writesEmpty }}</span>
    </div>
    <ul v-if="writes.length" class="writes">
      <li v-for="write in writes" :key="write.id" :class="{ undone: write.undone_at }">
        <div class="what">
          <span class="kind">{{ kindName[write.kind] }} · {{ write.action === 'created' ? a.writeCreated : a.writeUpdated }}</span>
          <span class="label">{{ write.label }}</span>
          <span class="meta">{{ when(write.created_at) }}<template v-if="write.source_name"> · {{ write.source_name }}</template></span>
        </div>
        <span v-if="write.undone_at" class="meta">{{ a.writesUndone }}</span>
        <button v-else class="button secondary" type="button" :disabled="busy === write.id" @click="undo(write)">
          {{ a.writesUndo }}
        </button>
      </li>
    </ul>
    <p v-if="error" class="hint-line" role="alert">{{ error }}</p>
  </div>
</template>

<style scoped src="../settings-local.css"></style>
<style scoped>
.writes { display: grid; max-height: 320px; margin: 6px 0 0; padding: 0; overflow-y: auto; list-style: none; }
.writes li { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 8px 0; }
.writes li + li { border-top: 1px solid var(--mat-line); }
.writes li.undone .what { opacity: 0.55; }
.what { display: grid; min-width: 0; gap: 2px; }
.kind { color: var(--muted); font-size: var(--fs-xs); }
.label { min-width: 0; overflow: hidden; color: var(--ink); font-size: var(--fs-sm); text-overflow: ellipsis; white-space: nowrap; }
.meta { color: var(--muted); font-size: var(--fs-xs); white-space: nowrap; }
</style>
