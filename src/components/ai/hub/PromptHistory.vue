<script setup lang="ts">
/**
 * 一个任务以前用过的提示词（Prompt 库的版本历史，批次 7）。每次改掉提示词，后端记下被换掉的那一句；
 * 这里按新到旧列出来，「用这一版」把它填回总页的输入框——不直接存，交给 AI 那一下才存，和平常一样。
 */
import { onMounted, ref } from 'vue';
import { backend } from '../../../lib/bridge';
import type { AiPromptVersion } from '../../../lib/bridge/types';
import { displayDateTimeFormatter } from '../../../lib/dateTime';
import { usePromptLibraryText } from './promptLibrary.i18n';

const props = defineProps<{ taskId: string }>();
const emit = defineEmits<{ use: [prompt: string] }>();
const t = usePromptLibraryText();

const versions = ref<AiPromptVersion[] | null>(null);
const failed = ref(false);
onMounted(async () => {
  try {
    versions.value = await backend.aiPromptVersions(props.taskId);
  } catch {
    failed.value = true;
  }
});
const when = (iso: string) => {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? iso.slice(0, 10)
    : displayDateTimeFormatter({ year: 'numeric', month: 'short', day: 'numeric' }).format(date);
};
</script>

<template>
  <div class="prompt-history">
    <strong class="history-title">{{ t.history }}</strong>
    <p v-if="failed" class="history-note" role="alert">{{ t.historyLoadFailed }}</p>
    <p v-else-if="versions && !versions.length" class="history-note">{{ t.historyEmpty }}</p>
    <ol v-else-if="versions" class="history-list">
      <li v-for="version in versions" :key="version.id">
        <p class="history-text">{{ version.prompt }}</p>
        <span class="history-meta">
          <time>{{ t.replacedAt(when(version.replaced_at)) }}</time>
          <button type="button" class="pill-button quiet" @click="emit('use', version.prompt)">{{ t.useVersion }}</button>
        </span>
      </li>
    </ol>
  </div>
</template>

<style scoped>
.prompt-history { display: grid; gap: 8px; grid-column: 1 / -1; padding: 10px 2px 2px; border-top: 1px solid var(--mat-line); }
.history-title { color: var(--muted); font-size: var(--fs-2xs); font-weight: 600; letter-spacing: .04em; }
.history-note { margin: 0; color: var(--muted); font-size: var(--fs-xs); }
.history-list { display: grid; gap: 8px; margin: 0; padding: 0; list-style: none; }
.history-list li { display: grid; gap: 4px; padding: 8px 12px; border-radius: 12px; background: var(--mat-inset); }
.history-text { display: -webkit-box; margin: 0; overflow: hidden; font-size: var(--fs-sm); line-height: 1.55; white-space: pre-wrap;
  -webkit-box-orient: vertical; -webkit-line-clamp: 4; line-clamp: 4; }
.history-meta { display: flex; align-items: center; justify-content: space-between; gap: 8px; color: var(--subtle); font-size: var(--fs-2xs); }
</style>
