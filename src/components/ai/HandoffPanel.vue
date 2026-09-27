<script setup lang="ts">
/**
 * 交付坞：浮在关系网底部的一条玻璃胶囊，整页只有这一个主按钮。
 *
 *   [ 数据就绪度 ]  [ 交给谁（传送带） ]  [ 交给 ChatGPT ]  [ 只导出 ]
 *
 * 就绪度是一枚小胶囊：几类数据、平均多少天有数据、有没有要注意的；点开是
 * 一张玻璃浮层，里面是最终提示词、去重后的提醒和逐类覆盖明细——以前这些
 * 平铺在右栏里，六条一模一样的「只有部分日期有数据」连着排。
 *
 * 主按钮一次做完：导出到桌面（JSON + 提示词 + 附件原件）→ 复制最终提示词
 * → 打开所选 AI → 在资源管理器里选中导出的文件夹。按下以后坞向上长出一截，
 * 显示每一步的进度和导出位置。导出前顺手保存任务。
 */
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import Icon from '../Icon.vue';
import CapsuleWheel from '../CapsuleWheel.vue';
import HandoffSteps from './HandoffSteps.vue';
import CoverageDetails from './CoverageDetails.vue';
import type { AiTaskPreview } from '../../lib/bridge/types';
import { isDesktop } from '../../lib/bridge';
import { AI_PROVIDERS, type AiProvider, type AiProviderId } from '../../lib/aiProviders';
import { aiTaskIssueText } from '../../lib/aiTask/copy';
import { formatBytes } from '../../lib/aiTask/coverage';
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
    go: (label: string) => `交给 ${label}`,
    goSub: '导出 · 复制提示词 · 打开网站',
    readiness: (categories: number, percent: number) => `${categories} 类数据 · ${percent}% 天有数据`,
    readinessLoading: '正在清点数据…',
    issueCount: (count: number) => `${count} 条提醒`,
    repeat: (count: number) => `×${count}`,
    closePanel: '收起',
    packageSize: (bytes: string) => `数据包约 ${bytes}`,
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
    go: (label: string) => `Hand to ${label}`,
    goSub: 'Export · copy prompt · open site',
    readiness: (categories: number, percent: number) => `${categories} data types · ${percent}% of days covered`,
    readinessLoading: 'Counting your data…',
    issueCount: (count: number) => (count === 1 ? '1 note' : `${count} notes`),
    repeat: (count: number) => `×${count}`,
    closePanel: 'Close',
    packageSize: (bytes: string) => `Package ≈ ${bytes}`,
  },
  {
    title: 'Entregar a la IA',
    who: 'Entregar a',
    finalPrompt: 'Prompt final (exactamente lo que se copia)',
    run: (label: string) => `Exportar al escritorio y abrir ${label}`,
    exportOnly: 'Solo exportar al escritorio',
    reveal: 'Mostrar en el Explorador',
    go: (label: string) => `Entregar a ${label}`,
    goSub: 'Exportar · copiar prompt · abrir sitio',
    readiness: (categories: number, percent: number) => `${categories} tipos de datos · ${percent}% de días con datos`,
    readinessLoading: 'Contando tus datos…',
    issueCount: (count: number) => (count === 1 ? '1 aviso' : `${count} avisos`),
    closePanel: 'Cerrar',
    packageSize: (bytes: string) => `Paquete ≈ ${bytes}`,
  },
  'components/ai/HandoffPanel',
));

/* —— 交给谁：传送带胶囊，带各家的图标 —— */
const providerItems = computed(() => AI_PROVIDERS.map((item) => ({ value: item.id, label: item.label, image: item.localIcon })));
const pickProvider = (id: AiProviderId) => {
  const next = AI_PROVIDERS.find((item) => item.id === id);
  if (next) provider.value = next;
};

/* —— 就绪度：几类数据、总体多少天有数据 —— */
const readiness = computed(() => {
  const rows = props.preview?.coverage ?? [];
  if (!rows.length) return null;
  const categories = new Set(rows.map((row) => row.category)).size;
  const total = rows.reduce((sum, row) => sum + row.days_in_range, 0);
  const have = rows.reduce((sum, row) => sum + row.days_with_data, 0);
  return { categories, percent: total > 0 ? Math.round((have / total) * 100) : 0 };
});
/** 同一句提醒只出现一次，后面标次数。 */
const groupedWarnings = computed(() => {
  const counts = new Map<string, number>();
  for (const issue of props.preview?.warnings ?? []) {
    const text = aiTaskIssueText(issue);
    counts.set(text, (counts.get(text) ?? 0) + 1);
  }
  return [...counts.entries()].map(([text, count]) => ({ text, count }));
});
const issueTotal = computed(() => groupedWarnings.value.length + (props.previewError ? 1 : 0));

const finalPrompt = computed(() => composePromptPreview({ direction: props.direction, question: draft.value.prompt }));
const blocked = computed(() => (prepareResult.value?.status === 'blocked' && !stale.value ? prepareResult.value.blocked : []));
const ready = computed(() => (prepareResult.value?.status === 'ready' ? prepareResult.value : null));
const stale = computed(() => handoff.isStale(exportTask()));
const busy = computed(() => steps.value.prepare.state === 'doing' || steps.value.copy.state === 'doing');
/** 按过主按钮以后，坞向上长出进度那一截。 */
const started = computed(() => steps.value.prepare.state !== 'idle');

/** 标题为空时用自动标题——导出文件夹就按它命名。 */
function exportTask() {
  return { ...draft.value, title: draft.value.title.trim() || props.fallbackTitle };
}

const run = async (openSite: boolean) => {
  if (!desktop || busy.value) return;
  details.value = false;
  await saveDraft(props.fallbackTitle).catch(() => undefined);
  if (openSite) await handoff.runAll(exportTask(), provider.value, props.direction);
  else await handoff.exportOnly(exportTask(), props.direction);
};

const retry = (id: HandoffStepId) => {
  if (id === 'copy') void handoff.runCopy();
  else if (id === 'open') void handoff.runOpen(provider.value);
};

/* —— 就绪度浮层 —— */
const details = ref(false);
const dock = ref<HTMLElement | null>(null);
const onDocPointer = (event: PointerEvent) => {
  if (details.value && dock.value && !dock.value.contains(event.target as Node)) details.value = false;
};
const onDocKey = (event: KeyboardEvent) => {
  if (event.key === 'Escape' && details.value) details.value = false;
};
onMounted(() => {
  document.addEventListener('pointerdown', onDocPointer);
  document.addEventListener('keydown', onDocKey);
});
onBeforeUnmount(() => {
  document.removeEventListener('pointerdown', onDocPointer);
  document.removeEventListener('keydown', onDocKey);
});
</script>

<template>
  <section ref="dock" class="dock" :aria-label="t.title">
    <Transition name="sheet">
      <div v-show="details" class="sheet glass-control" role="dialog" :aria-label="t.finalPrompt">
        <div class="sheet-head">
          <p class="ai-label">{{ t.finalPrompt }}</p>
          <button type="button" class="sheet-close" :aria-label="t.closePanel" @click="details = false"><Icon name="x" :size="15" /></button>
        </div>
        <pre class="prompt">{{ finalPrompt }}</pre>
        <ul v-if="groupedWarnings.length" class="issues">
          <li v-for="issue in groupedWarnings" :key="issue.text" class="ai-note warn">
            <Icon name="warning" :size="13" /><span>{{ issue.text }}</span>
            <b v-if="issue.count > 1" class="repeat">{{ t.repeat(issue.count) }}</b>
          </li>
        </ul>
        <CoverageDetails v-if="preview && preview.coverage.length" :preview="preview" />
      </div>
    </Transition>

    <Transition name="grow">
      <div v-show="started || blocked.length" class="progress glass-control">
        <ul v-if="blocked.length" class="issues" role="alert">
          <li v-for="(issue, index) in blocked" :key="index" class="ai-note bad"><Icon name="warning" :size="13" />{{ aiTaskIssueText(issue) }}</li>
        </ul>
        <HandoffSteps :steps="steps" :provider-label="provider.label" @retry="retry" />
        <div v-if="ready" class="output">
          <p class="ai-note ok"><Icon name="folder" :size="13" />
            <span>{{ t.outputAt(ready.output_dir) }}<template v-if="ready.copied_attachments"> · {{ t.copiedFiles(ready.copied_attachments) }}</template></span>
          </p>
          <div class="output-row">
            <button type="button" class="ai-tool" @click="handoff.revealOutput()"><Icon name="folder" :size="13" />{{ t.reveal }}</button>
            <p class="ai-hint">{{ t.dragHint }}</p>
          </div>
          <p v-if="stale" class="ai-note warn" role="status"><Icon name="warning" :size="13" />{{ t.stale }}</p>
        </div>
      </div>
    </Transition>

    <!-- 预览出错不藏进浮层：它决定导出的东西对不对，要一直看得见。 -->
    <p v-if="previewError" class="ai-note bad alert-pill" role="alert"><Icon name="warning" :size="13" />{{ previewError }}</p>

    <div class="bar glass-control">
      <button type="button" :class="['ready-chip', { 'has-issues': issueTotal }]" :aria-expanded="details" @click="details = !details">
        <i class="ready-dot" aria-hidden="true"></i>
        <span class="ready-copy">
          <span>{{ readiness ? t.readiness(readiness.categories, readiness.percent) : t.readinessLoading }}</span>
          <small v-if="preview">{{ t.packageSize(formatBytes(preview.estimated_bytes)) }}<template v-if="issueTotal"> · {{ t.issueCount(issueTotal) }}</template></small>
        </span>
        <Icon name="chevron-down" :size="14" :class="['ready-chevron', { up: !details }]" />
      </button>

      <CapsuleWheel class="provider-wheel" :span="210" :items="providerItems" :model-value="provider.id"
        :aria-label="t.who" @update:model-value="pickProvider" />

      <button type="button" class="go cta" :disabled="!desktop || busy" :title="t.run(provider.label)" @click="run(true)">
        <Icon name="send" :size="17" />
        <span class="go-copy"><strong>{{ t.go(provider.label) }}</strong><small>{{ t.goSub }}</small></span>
      </button>
      <button type="button" class="export-only" :disabled="!desktop || busy" :title="t.exportOnly" :aria-label="t.exportOnly" @click="run(false)">
        <Icon name="export" :size="17" />
      </button>
    </div>
    <p v-if="!desktop" class="ai-note offline">{{ t.desktopOnly }}</p>
  </section>
</template>

<style scoped>
.dock { position: relative; display: grid; justify-items: center; gap: 8px; pointer-events: none; }
.dock > * { pointer-events: auto; }

.bar {
  display: flex;
  max-width: 100%;
  align-items: center;
  gap: 10px;
  padding: 7px;
  border-radius: 999px;
}
.ready-chip {
  display: flex;
  min-width: 0;
  align-items: center;
  gap: 10px;
  padding: 6px 12px 6px 14px;
  border: 0;
  border-radius: 999px;
  background: color-mix(in srgb, var(--ink) 6%, transparent);
  color: var(--ink);
  text-align: left;
  cursor: pointer;
}
.ready-chip:hover { background: color-mix(in srgb, var(--ink) 10%, transparent); }
.ready-dot { width: 9px; height: 9px; flex: 0 0 9px; border-radius: 50%; background: var(--accent); box-shadow: 0 0 10px var(--accent); }
.ready-chip.has-issues .ready-dot { background: var(--warning); box-shadow: 0 0 10px var(--warning); }
.ready-copy { display: grid; min-width: 0; line-height: 1.25; font-size: var(--fs-sm); font-weight: 600; }
.ready-copy span, .ready-copy small { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.ready-copy small { color: var(--subtle); font-size: var(--fs-2xs); font-weight: 500; }
.ready-chevron { flex: 0 0 auto; color: var(--subtle); transition: rotate var(--dur-base) var(--ease-out); }
.ready-chevron.up { rotate: 180deg; }
.provider-wheel { flex: 0 0 auto; height: 44px; }

/* 主按钮：整页唯一的实色。液态玻璃的高光压在品牌绿上。 */
.go {
  display: inline-flex;
  min-height: 52px;
  align-items: center;
  gap: 12px;
  padding: 0 26px 0 22px;
  border: 0;
  border-radius: 999px;
  background:
    linear-gradient(180deg, rgba(255, 255, 255, .34) 0%, rgba(255, 255, 255, 0) 52%),
    linear-gradient(180deg, var(--accent-hover), var(--accent));
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, .45), inset 0 -2px 6px rgba(0, 0, 0, .18),
    0 10px 28px -8px color-mix(in srgb, var(--accent) 70%, transparent);
  color: var(--accent-ink);
  cursor: pointer;
  transition: scale var(--dur-fast) var(--ease-out), box-shadow var(--dur-base) ease, filter var(--dur-base) ease;
}
.go:hover:not(:disabled) { filter: brightness(1.06); box-shadow: inset 0 1px 0 rgba(255, 255, 255, .5), inset 0 -2px 6px rgba(0, 0, 0, .18), 0 14px 34px -8px color-mix(in srgb, var(--accent) 80%, transparent); }
.go:active:not(:disabled) { scale: .97; }
.go:disabled { filter: grayscale(.6) opacity(.6); cursor: not-allowed; }
.go-copy { display: grid; text-align: left; line-height: 1.2; }
.go-copy strong { font-size: var(--fs-lg); font-weight: 750; white-space: nowrap; }
.go-copy small { font-size: var(--fs-2xs); font-weight: 600; opacity: .72; white-space: nowrap; }
.export-only {
  display: grid;
  width: 44px;
  height: 44px;
  flex: 0 0 44px;
  place-items: center;
  border: 0;
  border-radius: 50%;
  background: color-mix(in srgb, var(--ink) 7%, transparent);
  color: var(--ink);
  cursor: pointer;
}
.export-only:hover:not(:disabled) { background: color-mix(in srgb, var(--ink) 12%, transparent); }
.export-only:disabled { opacity: .45; cursor: not-allowed; }

/* 就绪度浮层与进度那一截：从坞上方长出来。 */
.sheet, .progress {
  width: min(640px, 100%);
  max-height: min(52vh, 460px);
  overflow: auto;
  padding: 16px 18px;
  border-radius: var(--radius-lg);
  background: linear-gradient(180deg, var(--glass-sheen), transparent 40%), var(--mat-glass-strong);
}
.sheet-head { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
.sheet-head .ai-label { margin: 0; }
.sheet-close { display: grid; width: 30px; height: 30px; place-items: center; border: 0; border-radius: 50%; background: var(--glass-press); color: var(--ink); cursor: pointer; }
.prompt {
  max-height: 160px; margin: 10px 0 0; padding: 10px 12px; overflow: auto;
  border-radius: var(--radius-sm); background: var(--mat-inset);
  color: var(--ink); font-family: inherit; font-size: var(--fs-sm); line-height: 1.55; white-space: pre-wrap; overflow-wrap: anywhere; box-shadow: var(--mat-inset-shadow);
}
.issues { margin: 8px 0 0; padding: 0; list-style: none; }
.repeat { margin-left: auto; padding-left: 8px; font-size: var(--fs-2xs); }
.output { margin-top: 10px; }
.output .ai-note span { overflow-wrap: anywhere; }
.output-row { display: flex; align-items: center; gap: 12px; margin-top: 6px; }
.output-row .ai-hint { margin: 0; }
.offline { margin: 0; padding: 4px 12px; border-radius: 999px; background: var(--mat-glass); }
.alert-pill { margin: 0; padding: 6px 14px; border-radius: 999px; background: var(--mat-glass-strong); box-shadow: var(--glass-rim); }

.sheet-enter-active, .sheet-leave-active, .grow-enter-active, .grow-leave-active {
  transition: opacity 240ms ease, translate 360ms var(--ease-out), filter 260ms ease, scale 360ms var(--ease-out);
  transform-origin: 50% 100%;
}
.sheet-enter-from, .sheet-leave-to, .grow-enter-from, .grow-leave-to { opacity: 0; translate: 0 14px; scale: .96; filter: blur(8px); }

@media (max-width: 900px) {
  .bar { flex-wrap: wrap; justify-content: center; border-radius: var(--radius-lg); }
}
</style>
