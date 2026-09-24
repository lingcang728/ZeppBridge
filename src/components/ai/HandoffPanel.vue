<script setup lang="ts">
/**
 * 第 ③ 步：交付。和编辑在同一页——不再跳到另一个「交付预览」页面。
 *
 * 主按钮一次做完：导出到桌面（JSON + 提示词 + 附件原件）→ 复制最终提示词
 * → 打开所选 AI → 在资源管理器里选中导出的文件夹，用户直接拖进对话框。
 * 导出前顺手保存任务，导出过的任务会出现在任务列表里。
 */
import { computed, ref } from 'vue';
import Icon from '../Icon.vue';
import ProviderPicker from './ProviderPicker.vue';
import HandoffSteps from './HandoffSteps.vue';
import CoverageDetails from './CoverageDetails.vue';
import type { AiTaskPreview } from '../../lib/bridge/types';
import { isDesktop } from '../../lib/bridge';
import { AI_PROVIDERS, type AiProvider } from '../../lib/aiProviders';
import { aiTaskIssueText } from '../../lib/aiTask/copy';
import { composePromptPreview } from '../../lib/aiTask/prompt';
import { useAiTaskDraft } from '../../composables/useAiTaskDraft';
import { useAiTaskHandoff, type HandoffStepId } from '../../composables/useAiTaskHandoff';
import { defineMessages, useMessages } from '../../i18n';

const props = defineProps<{
  preview: AiTaskPreview | null;
  previewError: string | null;
  direction: string | null;
  fallbackTitle: string;
}>();

const { draft, saveDraft } = useAiTaskDraft();
const handoff = useAiTaskHandoff();
const { steps, prepareResult } = handoff;
const provider = ref<AiProvider>(handoff.lastProvider.value ?? AI_PROVIDERS[0]);
const desktop = isDesktop();

const t = useMessages(defineMessages(
  {
    title: '交给 AI',
    who: '交给谁',
    finalPrompt: '最终提示词（复制出去的就是这段）',
    run: (label: string) => `导出到桌面并打开 ${label}`,
    exportOnly: '只导出到桌面',
    reveal: '在资源管理器中显示',
    outputAt: (path: string) => `文件在：${path}`,
    copiedFiles: (count: number) => `含 ${count} 个附件原件`,
    dragHint: '把这个文件夹里的文件拖进 AI 对话框，再粘贴提示词即可。打开网站不等于已发送。',
    stale: '导出之后又改过任务，桌面上的文件已经是旧的，请重新导出。',
    desktopOnly: '连接桌面应用后才能导出',
  },
  {
    title: 'Hand to the AI',
    who: 'Hand to',
    finalPrompt: 'Final prompt (exactly what gets copied)',
    run: (label: string) => `Export to desktop and open ${label}`,
    exportOnly: 'Export to desktop only',
    reveal: 'Show in Explorer',
    outputAt: (path: string) => `Files at: ${path}`,
    copiedFiles: (count: number) => `includes ${count} original attachment(s)`,
    dragHint: 'Drag the files in this folder into the AI chat, then paste the prompt. Opening the site is not sending.',
    stale: 'The task changed after export — the files on the desktop are outdated. Export again.',
    desktopOnly: 'Connect the desktop app to export',
  },
  {
    title: 'Entregar a la IA',
    who: 'Entregar a',
    finalPrompt: 'Prompt final (exactamente lo que se copia)',
    run: (label: string) => `Exportar al escritorio y abrir ${label}`,
    exportOnly: 'Solo exportar al escritorio',
    reveal: 'Mostrar en el Explorador',
  },
  'components/ai/HandoffPanel',
));

const finalPrompt = computed(() => composePromptPreview({ direction: props.direction, question: draft.value.prompt }));
const warnings = computed(() => props.preview?.warnings ?? []);
const blocked = computed(() => (prepareResult.value?.status === 'blocked' && !stale.value ? prepareResult.value.blocked : []));
const ready = computed(() => (prepareResult.value?.status === 'ready' ? prepareResult.value : null));
const stale = computed(() => handoff.isStale(exportTask()));
const busy = computed(() => steps.value.prepare.state === 'doing' || steps.value.copy.state === 'doing');

/** 标题为空时用自动标题——导出文件夹就按它命名。 */
function exportTask() {
  return { ...draft.value, title: draft.value.title.trim() || props.fallbackTitle };
}

const run = async (openSite: boolean) => {
  if (!desktop || busy.value) return;
  await saveDraft(props.fallbackTitle).catch(() => undefined);
  if (openSite) await handoff.runAll(exportTask(), provider.value, props.direction);
  else await handoff.exportOnly(exportTask(), props.direction);
};

const retry = (id: HandoffStepId) => {
  if (id === 'copy') void handoff.runCopy();
  else if (id === 'open') void handoff.runOpen(provider.value);
};
</script>

<template>
  <section class="ai-card" aria-labelledby="ai-step-handoff">
    <div class="ai-step-head">
      <span class="ai-step-no">3</span>
      <h2 id="ai-step-handoff" class="ai-step-title">{{ t.title }}</h2>
    </div>

    <p class="ai-label">{{ t.who }}</p>
    <ProviderPicker v-model="provider" :label="t.who" />

    <p class="ai-label">{{ t.finalPrompt }}</p>
    <pre class="prompt">{{ finalPrompt }}</pre>

    <ul v-if="warnings.length" class="issues">
      <li v-for="(issue, index) in warnings" :key="index" class="ai-note warn"><Icon name="warning" :size="13" />{{ aiTaskIssueText(issue) }}</li>
    </ul>
    <p v-if="previewError" class="ai-note bad" role="alert"><Icon name="warning" :size="13" />{{ previewError }}</p>
    <ul v-if="blocked.length" class="issues" role="alert">
      <li v-for="(issue, index) in blocked" :key="index" class="ai-note bad"><Icon name="warning" :size="13" />{{ aiTaskIssueText(issue) }}</li>
    </ul>

    <div class="actions">
      <button type="button" class="button button-primary cta" :disabled="!desktop || busy" @click="run(true)">
        <Icon name="send" :size="14" />{{ t.run(provider.label) }}
      </button>
      <button type="button" class="button button-secondary" :disabled="!desktop || busy" @click="run(false)">
        <Icon name="export" :size="14" />{{ t.exportOnly }}
      </button>
    </div>
    <p v-if="!desktop" class="ai-note">{{ t.desktopOnly }}</p>

    <HandoffSteps :steps="steps" :provider-label="provider.label" @retry="retry" />

    <div v-if="ready" class="output">
      <p class="ai-note ok"><Icon name="folder" :size="13" />
        <span>{{ t.outputAt(ready.output_dir) }}<template v-if="ready.copied_attachments"> · {{ t.copiedFiles(ready.copied_attachments) }}</template></span>
      </p>
      <button type="button" class="ai-tool" @click="handoff.revealOutput()"><Icon name="folder" :size="13" />{{ t.reveal }}</button>
      <p class="ai-hint">{{ t.dragHint }}</p>
      <p v-if="stale" class="ai-note warn" role="status"><Icon name="warning" :size="13" />{{ t.stale }}</p>
    </div>

    <CoverageDetails v-if="preview && preview.coverage.length" :preview="preview" />
  </section>
</template>

<style scoped>
.prompt {
  max-height: 180px; margin: 0; padding: 10px 12px; overflow: auto;
  border: 1px solid var(--line); border-radius: var(--radius-sm); background: var(--surface-raised);
  color: var(--ink); font-family: inherit; font-size: var(--fs-sm); line-height: 1.55; white-space: pre-wrap; overflow-wrap: anywhere;
}
.issues { margin: 8px 0 0; padding: 0; list-style: none; }
.actions { display: grid; gap: 8px; margin-top: 14px; }
.cta { min-height: 40px; font-size: var(--fs-md); }
.output { margin-top: 12px; padding-top: 10px; border-top: 1px solid var(--line); }
.output .ai-note span { overflow-wrap: anywhere; }
.output .ai-tool { margin-top: 6px; }
</style>
