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
 * 主按钮一次做完（批次 ⑦）：准备**一个** `.md`（提示词 + 读法 + 数据；附件原件另放）→ 复制一句
 * 开场白 → 打开所选 AI。坞向上长出一截，里面是那张文件卡：按住直接拖进 AI 的对话框；拖不了就
 * 「在资源管理器里选中它」。文件按所选 AI 的预算控制在读得完的量以内（勾「我已订阅」放宽）。
 */
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import Icon from '../Icon.vue';
import CapsuleWheel from '../CapsuleWheel.vue';
import HandoffSteps from './HandoffSteps.vue';
import CoverageDetails from './CoverageDetails.vue';
import type { AiTaskPreview } from '../../lib/bridge/types';
import { isDesktop } from '../../lib/bridge';
import { AI_PROVIDERS, type AiProvider, type AiProviderId } from '../../lib/aiProviders';
import { aiTaskIssueText, coverageNoteText } from '../../lib/aiTask/copy';
import { formatBytes } from '../../lib/format';
import { currentProviderId, FREE_TOKEN_BUDGET, formatTokens, isSubscribed, setSubscribed } from '../../lib/aiTask/budget';
import { markdownGuide } from '../../lib/aiTask/markdownGuide';
import { startFileDrag } from '../../lib/dragOut';
import { composePromptPreview } from '../../lib/aiTask/prompt';
import { handoffParts } from '../../lib/aiTask/handoffParts';
import { useAiTaskDraft } from '../../composables/useAiTaskDraft';
import { useAiTaskHandoff, type HandoffStepId } from '../../composables/useAiTaskHandoff';
import { useSyncController } from '../../composables/useSyncController';
import { defineMessages, useMessages } from '../../i18n';
import { vEdgeSafe } from '../../lib/edgeSafe';

const props = defineProps<{
  preview: AiTaskPreview | null;
  previewError: string | null;
  direction: string | null;
  fallbackTitle: string;
  /** 「会交出去的数据：9/18–10/2 的睡眠、心率……；不含精确位置」——就绪度浮层的第一句话。 */
  handover?: { title: string; text: string } | null;
}>();

const { draft, saveDraft } = useAiTaskDraft();
const handoff = useAiTaskHandoff();
const { steps, prepareResult, saveError } = handoff;
const provider = ref<AiProvider>(handoff.lastProvider.value ?? AI_PROVIDERS[0]);
const desktop = isDesktop();

const t = useMessages(defineMessages(
  {
    title: '交给 AI',
    who: '交给谁',
    finalPrompt: '最终提示词（写在文件开头）',
    run: (label: string) => `准备文件并打开 ${label}`,
    exportOnly: '只导出到桌面',
    reveal: '在资源管理器中显示',
    lastExport: '上次导出 · 打开文件夹',
    outputAt: (path: string) => `文件在：${path}`,
    copiedFiles: (count: number) => `含 ${count} 个附件原件`,
    dragFile: (label: string) => `按住这张卡拖进 ${label} 的对话框，再粘贴已复制的开场白发送。打开网站不等于已发送。`,
    sideBySide: '先把浏览器和本窗口并排（Win + ← / →）再拖。',
    revealFile: '在资源管理器里选中它',
    dragFailed: '拖不出去时，用「在资源管理器里选中它」，再从那里拖。',
    fileMeta: (size: string, tokens: string) => `${size} · 约 ${tokens} token`,
    fileAria: (name: string) => `交给 AI 的文件 ${name}，按住拖动`,
    tokensFree: (tokens: string) => `约 ${tokens} token · 免费版能读完`,
    tokensNeedPaid: (tokens: string) => `约 ${tokens} token · 需要订阅版`,
    tokensPaid: (tokens: string) => `约 ${tokens} token · 订阅版能读完`,
    tooLong: '内容太多读不完：缩短日期范围或少选几类',
    curveAveraged: (seconds: number) => `运动曲线按 ${seconds} 秒取平均`,
    summarizedOnly: (count: number) => `最早 ${count} 次运动只留概要`,
    subscribedHint: '订阅版约能读 12 万 token，免费版一般只读得完约 3 万；勾上后运动曲线更细。',
    planPaid: '已订阅',
    planFree: '免费版',
    planTitle: (label: string) => `你用的是 ${label} 的哪一档？点一下切换。`,
    noteDeepseek: 'DeepSeek 的专家模式不能传文件，用普通对话。',
    noteChatgpt: 'ChatGPT 免费版每天只能传 3 个文件。',
    stale: '导出后任务又改过，桌面文件已旧，重新导出。',
    saveAgain: '再保存一次',
    desktopOnly: '连接桌面应用后才能导出',
    go: (label: string) => `交给 ${label}`,
    goSub: '准备文件 · 复制开场白 · 打开网站',
    goSubSyncing: '同步完成后再交给 AI',
    readiness: (categories: number, percent: number) => `${categories} 类数据 · ${percent}% 天有数据`,
    readinessLoading: '正在清点数据…',
    issueCount: (count: number) => `${count} 条提醒`,
    repeat: (count: number) => `×${count}`,
    closePanel: '收起',
    editHint: '点一下就能改',
    edited: '已手动修改',
    resetPrompt: '恢复自动生成',
    fixedTail: '下面这段由 ZeppBridge 按实际覆盖自动附加：',
    packageSize: (bytes: string) => `数据包约 ${bytes}`,
    readinessWaiting: '最新数据还在路上',
    readinessWaitingStep: (current: number, total: number) => `同步 ${current}/${total} · 完成后这里自动刷新`,
    readinessWaitingSub: '同步完成后这里自动刷新',
  },
  {
    title: 'Send to AI',
    who: 'Send to',
    finalPrompt: 'Final prompt (at the top of the file)',
    run: (label: string) => `Prepare the file and open ${label}`,
    exportOnly: 'Export to desktop only',
    reveal: 'Show in Explorer',
    lastExport: 'Last export · Open folder',
    outputAt: (path: string) => `Files at: ${path}`,
    copiedFiles: (count: number) => `includes ${count} original attachment(s)`,
    dragFile: (label: string) => `Hold and drag this card into the ${label} chat, then paste the copied opening line and send. Opening the site does not send anything.`,
    sideBySide: 'Put the browser and this window side by side first (Win + ← / →).',
    revealFile: 'Show it in Explorer',
    dragFailed: 'If dragging does not work, use “Show it in Explorer” and drag it from there.',
    fileMeta: (size: string, tokens: string) => `${size} · ≈ ${tokens} tokens`,
    fileAria: (name: string) => `File for the AI, ${name} — hold to drag`,
    tokensFree: (tokens: string) => `≈ ${tokens} tokens · fits free plans`,
    tokensNeedPaid: (tokens: string) => `≈ ${tokens} tokens · needs a paid plan`,
    tokensPaid: (tokens: string) => `≈ ${tokens} tokens · fits paid plans`,
    tooLong: 'Too much to read: shorten the date range or pick fewer categories',
    curveAveraged: (seconds: number) => `Workout curves averaged over ${seconds} s`,
    summarizedOnly: (count: number) => `Oldest ${count} workout(s) as summary only`,
    subscribedHint: 'Paid plans read about 120k tokens; free plans usually only about 30k. Tick it for finer workout curves.',
    planPaid: 'Paid plan',
    planFree: 'Free plan',
    planTitle: (label: string) => `Which ${label} plan do you use? Click to switch.`,
    noteDeepseek: 'DeepSeek’s expert mode cannot take files — use a normal chat.',
    noteChatgpt: 'ChatGPT’s free plan allows 3 file uploads a day.',
    stale: 'Task changed after export — desktop files are outdated. Export again.',
    saveAgain: 'Save again',
    desktopOnly: 'Connect the desktop app to export',
    go: (label: string) => `Send to ${label}`,
    goSub: 'Prepare file · copy opening line · open site',
    goSubSyncing: 'Available once the sync finishes',
    readiness: (categories: number, percent: number) => `${categories} data types · ${percent}% of days covered`,
    readinessLoading: 'Counting your data…',
    issueCount: (count: number) => (count === 1 ? '1 note' : `${count} notes`),
    repeat: (count: number) => `×${count}`,
    closePanel: 'Close',
    editHint: 'Click to edit',
    edited: 'Edited by you',
    resetPrompt: 'Restore automatic text',
    fixedTail: 'ZeppBridge appends this part from the actual coverage:',
    packageSize: (bytes: string) => `Package ≈ ${bytes}`,
    readinessWaiting: 'Latest data still on its way',
    readinessWaitingStep: (current: number, total: number) => `Sync ${current}/${total} · auto-refreshes when done`,
    readinessWaitingSub: 'Auto-refreshes when sync finishes',
  },
  {
    title: 'Pasar a la IA',
    who: 'Pasar a',
    finalPrompt: 'Instrucción final (al principio del archivo)',
    run: (label: string) => `Preparar el archivo y abrir ${label}`,
    exportOnly: 'Solo exportar al escritorio',
    reveal: 'Mostrar en el Explorador',
    lastExport: 'Última exportación · Abrir carpeta',
    outputAt: (path: string) => `Archivos en: ${path}`,
    copiedFiles: (count: number) => `Incluye ${count} archivo(s) original(es)`,
    dragFile: (label: string) => `Mantén pulsada esta tarjeta y arrástrala al chat de ${label}; luego pega el mensaje inicial copiado y envía. Abrir el sitio no envía nada.`,
    sideBySide: 'Primero pon el navegador y esta ventana lado a lado (Win + ← / →).',
    revealFile: 'Mostrarlo en el Explorador',
    dragFailed: 'Si no se puede arrastrar, usa «Mostrarlo en el Explorador» y arrástralo desde allí.',
    fileMeta: (size: string, tokens: string) => `${size} · ≈ ${tokens} tokens`,
    fileAria: (name: string) => `Archivo para la IA, ${name}: mantén pulsado para arrastrar`,
    tokensFree: (tokens: string) => `≈ ${tokens} tokens · cabe en planes gratis`,
    tokensNeedPaid: (tokens: string) => `≈ ${tokens} tokens · necesita un plan de pago`,
    tokensPaid: (tokens: string) => `≈ ${tokens} tokens · cabe en planes de pago`,
    tooLong: 'Demasiado para leer: acorta el rango de fechas o elige menos categorías',
    curveAveraged: (seconds: number) => `Curvas promediadas cada ${seconds} s`,
    summarizedOnly: (count: number) => `Los ${count} entrenamientos más antiguos solo en resumen`,
    subscribedHint: 'Los planes de pago leen unos 120 000 tokens; los gratuitos, unos 30 000. Márcalo para curvas más finas.',
    planPaid: 'De pago',
    planFree: 'Gratis',
    planTitle: (label: string) => `¿Qué plan de ${label} usas? Haz clic para cambiar.`,
    noteDeepseek: 'El modo experto de DeepSeek no admite archivos: usa un chat normal.',
    noteChatgpt: 'El plan gratuito de ChatGPT permite 3 archivos al día.',
    stale: 'La tarea cambió tras exportar: los archivos del escritorio son antiguos. Vuelve a exportar.',
    saveAgain: 'Guardar de nuevo',
    desktopOnly: 'Requiere la app de escritorio para exportar',
    go: (label: string) => `Pasar a ${label}`,
    goSub: 'Preparar archivo · copiar mensaje · abrir sitio',
    readiness: (categories: number, percent: number) => `${categories} categorías · ${percent}% de días cubiertos`,
    readinessLoading: 'Verificando datos…',
    goSubSyncing: 'Disponible cuando termine la sincronización',
    issueCount: (count: number) => (count === 1 ? '1 aviso' : `${count} avisos`),
    repeat: (count: number) => `×${count}`,
    closePanel: 'Cerrar',
    editHint: 'Clic para editar',
    edited: 'Editado manualmente',
    resetPrompt: 'Restaurar texto automático',
    fixedTail: 'ZeppBridge añade esta parte según la cobertura real:',
    packageSize: (bytes: string) => `Paquete ≈ ${bytes}`,
    readinessWaiting: 'Datos recientes en camino',
    readinessWaitingStep: (current: number, total: number) => `Sincronización ${current}/${total} · se actualizará al terminar`,
    readinessWaitingSub: 'Se actualizará al terminar la sincronización',
  },
  'components/ai/HandoffPanel',
));

/* —— 用户在等的那次同步还没落地：就绪度胶囊说「最新数据还在路上」。
   同步落地后页面按 dataRevision 重新取预览，这里的数字自己会变。 —— */
const { dataReady, isSyncing, syncProgress, lastPickupAt } = useSyncController();
const waitingForData = computed(() => dataReady.value.phase === 'waiting');

/* 从「数据已备好」取走、来到这一页的那一刻（或者人本来就在这一页、同步刚好落地）：
   主按钮亮一圈，告诉人下一步按哪儿。几秒后自己熄掉。 */
const ARRIVAL_WINDOW_MS = 4000;
const arrived = ref(false);
let arrivedTimer = 0;
const flashArrival = () => {
  arrived.value = true;
  window.clearTimeout(arrivedTimer);
  arrivedTimer = window.setTimeout(() => { arrived.value = false; }, ARRIVAL_WINDOW_MS);
};
watch(lastPickupAt, (at) => { if (at) flashArrival(); });

/* —— 交给谁：传送带胶囊，带各家的图标 —— */
const providerItems = computed(() => AI_PROVIDERS.map((item) => ({ value: item.id, label: item.label, image: item.localIcon })));
const pickProvider = (id: AiProviderId) => {
  const next = AI_PROVIDERS.find((item) => item.id === id);
  if (next) provider.value = next;
};
/* 预算跟着所选 AI 走：预览按它估 `.md` 的体量。 */
watch(provider, (next) => { currentProviderId.value = next.id; }, { immediate: true });
const subscribed = computed({
  get: () => isSubscribed(provider.value.id),
  set: (on: boolean) => setSubscribed(provider.value.id, on),
});
const providerNote = computed(() => ({ deepseek: t.value.noteDeepseek, chatgpt: t.value.noteChatgpt } as Partial<Record<AiProviderId, string>>)[provider.value.id] ?? null);
/** 只和免费档有关的提醒（ChatGPT 免费版每天 3 个文件）：订阅了就不再提。DeepSeek 那条和档位无关，一直显示。 */
const freeNote = computed(() => (provider.value.id === 'chatgpt' && subscribed.value ? null : providerNote.value));

/* —— 单个 .md 的体量：「约 2.8 万 token · 免费版能读完」「运动曲线按 30 秒取平均」 —— */
const mdLine = computed(() => {
  const md = props.preview?.markdown;
  if (!md) return null;
  if (md.over_budget) return t.value.tooLong;
  const tokens = formatTokens(md.approx_tokens);
  if (md.approx_tokens <= FREE_TOKEN_BUDGET) return t.value.tokensFree(tokens);
  return subscribed.value ? t.value.tokensPaid(tokens) : t.value.tokensNeedPaid(tokens);
});
/** 内容超过免费版额度却标着免费版：档位开关带一圈警示色，提醒「要么订阅、要么缩范围」。 */
const mdNeedsPaid = computed(() => {
  const md = props.preview?.markdown;
  return !!md && !md.over_budget && md.approx_tokens > FREE_TOKEN_BUDGET;
});
const mdDowngrade = computed(() => {
  const md = props.preview?.markdown;
  if (!md) return [];
  const notes: string[] = [];
  if (md.curve_average_seconds) notes.push(t.value.curveAveraged(md.curve_average_seconds));
  if (md.summarized_workouts.length) notes.push(t.value.summarizedOnly(md.summarized_workouts.length));
  return notes;
});

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

/** 任务说明与文件名：预览和导出同一个函数，「复制出去的就是这段」才成立。 */
const parts = computed(() => handoffParts(exportTask(), props.preview, { hasDirection: Boolean(props.direction), format: 'md' }));
/* 最终提示词单击即改：可改的是 任务说明 + 方向 + 问题 这一大段；覆盖说明由后端按实际
   覆盖附在最后，改不了，单独淡色列出。改过的全文随导出传给后端（prompt_override）。
   换了一个任务（草稿 id 变了）就丢掉手改，免得把上一个任务的话带过去。 */
const autoHead = computed(() => composePromptPreview({ brief: parts.value.brief, direction: props.direction, question: draft.value.prompt, coverageNote: '' }));
const coverageTail = computed(() => coverageNoteText());
const promptOverride = ref<string | null>(null);
const editingPrompt = ref(false);
const promptBox = ref<HTMLTextAreaElement | null>(null);
const headText = computed(() => promptOverride.value ?? autoHead.value);
const startEditPrompt = async () => {
  editingPrompt.value = true;
  await nextTick();
  const box = promptBox.value;
  if (!box) return;
  box.style.height = `${box.scrollHeight}px`;
  box.focus();
};
const onPromptInput = (event: Event) => {
  const box = event.target as HTMLTextAreaElement;
  box.style.height = 'auto';
  box.style.height = `${box.scrollHeight}px`;
};
const commitPrompt = (event: Event) => {
  const value = (event.target as HTMLTextAreaElement).value;
  promptOverride.value = value.trim() && value.trim() !== autoHead.value.trim() ? value : null;
  editingPrompt.value = false;
};
const resetPrompt = () => { promptOverride.value = null; };
watch(() => draft.value.id, () => { promptOverride.value = null; });
const blocked = computed(() => (prepareResult.value?.status === 'blocked' && !stale.value ? prepareResult.value.blocked : []));
const ready = computed(() => (prepareResult.value?.status === 'ready' ? prepareResult.value : null));
const stale = computed(() => handoff.isStale(exportTask()));
const busy = computed(() => handoff.inFlight.value || steps.value.prepare.state === 'doing' || steps.value.copy.state === 'doing');
/** 按过主按钮以后，坞向上长出进度那一截。 */
const started = computed(() => steps.value.prepare.state !== 'idle');
/** 进度那一截被人点空白 / Esc 收起了：下次按主按钮再长出来。收起后坞上留一枚「上次导出」。 */
const progressDismissed = ref(false);

/** 标题为空时用自动标题——导出文件夹就按它命名。 */
function exportTask() {
  return { ...draft.value, title: draft.value.title.trim() || props.fallbackTitle };
}

/* 同步进行中不许交付：导出的会是同步前的旧数据，而旁边正写着「最新数据还在路上」。
   两个按钮都等同步落地再亮（用户 2026-09-29 定）。 */
const run = (openSite: boolean) => {
  if (!desktop || busy.value || isSyncing.value) return;
  details.value = false;
  progressDismissed.value = false;
  // 按下那一刻的交给谁、方向、预览、改过的提示词：保存那段等待里别处再改，也交出按下时的那一版。
  const target = provider.value;
  const direction = props.direction;
  const preview = props.preview;
  const override = promptOverride.value;
  void handoff.start(() => saveDraft(props.fallbackTitle), async () => {
    // 任务在保存之后取：新任务要带上刚拿到的 id。
    const task = exportTask();
    const now = handoffParts(task, preview, { hasDirection: Boolean(direction), now: new Date(), format: 'md' });
    const options = {
      briefText: now.brief,
      dataFileStem: now.dataStem,
      promptFileStem: now.promptStem,
      promptOverride: override,
      tokenBudget: preview?.markdown?.token_budget ?? FREE_TOKEN_BUDGET,
      markdownGuide: markdownGuide(),
    };
    if (openSite) await handoff.runAll(task, target, direction, options);
    else await handoff.exportOnly(task, direction, options);
  });
};

/** 交接前那次保存失败了：在这里再存一次，存上了提示就收起。 */
const savingAgain = ref(false);
const saveAgain = async () => {
  savingAgain.value = true;
  try {
    await saveDraft(props.fallbackTitle);
    saveError.value = null;
  } catch {
    // 原因在任务名胶囊下面报着；这条提示留着。
  } finally {
    savingAgain.value = false;
  }
};

const retry = (id: HandoffStepId) => {
  if (id === 'copy') void handoff.runCopy();
  else if (id === 'open') void handoff.runOpen(provider.value);
};

/* —— 文件卡：按住直接拖进浏览器里 AI 的对话框（系统拖放，tauri-plugin-drag） —— */
const fileName = computed(() => ready.value?.md_path?.split(/[\\/]/).pop() ?? '');
const dragFailed = ref(false);
const onFileDrag = (event: MouseEvent) => {
  const path = ready.value?.md_path;
  if (!desktop || !path || event.button !== 0) return;
  dragFailed.value = false;
  startFileDrag(path, fileName.value).catch(() => { dragFailed.value = true; });
};

/* —— 就绪度浮层 —— */
const details = ref(false);
/* 浮层开着时舞台其余部分要退到背景里（AiComposer 的遮罩），所以把开关交出去。 */
defineExpose({ details });
const dock = ref<HTMLElement | null>(null);
const onDocPointer = (event: PointerEvent) => {
  if (!dock.value || dock.value.contains(event.target as Node)) return;
  if (details.value) details.value = false;
  if (started.value || blocked.value.length) progressDismissed.value = true;
};
const onDocKey = (event: KeyboardEvent) => {
  if (event.key !== 'Escape') return;
  if (details.value) details.value = false;
  else if (started.value || blocked.value.length) progressDismissed.value = true;
};
onMounted(() => {
  document.addEventListener('pointerdown', onDocPointer);
  document.addEventListener('keydown', onDocKey);
  if (lastPickupAt.value && Date.now() - lastPickupAt.value < ARRIVAL_WINDOW_MS) flashArrival();
});
onBeforeUnmount(() => {
  document.removeEventListener('pointerdown', onDocPointer);
  document.removeEventListener('keydown', onDocKey);
  window.clearTimeout(arrivedTimer);
});
</script>

<template>
  <section ref="dock" class="dock" :aria-label="t.title">
    <Transition name="sheet">
      <div v-show="details" class="sheet glass-control" role="dialog" :aria-label="t.finalPrompt">
        <p v-if="handover?.text" class="handover"><b>{{ handover.title }}</b>{{ handover.text }}</p>
        <div class="sheet-head">
          <p class="ai-label">{{ t.finalPrompt }}</p>
          <button type="button" class="sheet-close" :aria-label="t.closePanel" @click="details = false"><Icon name="x" :size="15" /></button>
        </div>
        <!-- 订阅档位只在底部那枚开关上改（它右上角的小注释说明两档的差别）。这里以前还有一个
             「我已订阅」的勾，和开关重复、还叠在一起，已删。 -->
        <p v-if="freeNote" class="ai-note warn provider-note"><Icon name="info" :size="13" />{{ freeNote }}</p>
        <textarea v-if="editingPrompt" ref="promptBox" class="prompt prompt-edit" :value="headText" :aria-label="t.finalPrompt"
          @input="onPromptInput" @blur="commitPrompt" @keydown.esc.prevent="($event.target as HTMLTextAreaElement).blur()"></textarea>
        <button v-else type="button" class="prompt prompt-view" :title="t.editHint" @click="startEditPrompt">{{ headText }}</button>
        <p class="prompt-meta">
          <span v-if="promptOverride !== null" class="edited"><Icon name="edit" :size="12" />{{ t.edited }}</span>
          <span v-else class="hint"><Icon name="edit" :size="12" />{{ t.editHint }}</span>
          <button v-if="promptOverride !== null" type="button" class="reset" @click="resetPrompt"><Icon name="undo" :size="12" />{{ t.resetPrompt }}</button>
        </p>
        <p class="prompt-tail"><span>{{ t.fixedTail }}</span>{{ coverageTail }}</p>
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
      <div v-show="(started || blocked.length) && !progressDismissed" class="progress glass-control">
        <ul v-if="blocked.length" class="issues" role="alert">
          <li v-for="(issue, index) in blocked" :key="index" class="ai-note bad"><Icon name="warning" :size="13" />{{ aiTaskIssueText(issue) }}</li>
        </ul>
        <HandoffSteps :steps="steps" :provider-label="provider.label" @retry="retry" />
        <p v-if="saveError" class="ai-note warn save-failed" role="alert">
          <Icon name="warning" :size="13" /><span>{{ saveError }}</span>
          <button type="button" class="ai-tool" :disabled="savingAgain" @click="saveAgain">{{ t.saveAgain }}</button>
        </p>
        <div v-if="ready" class="output">
          <!-- 一枚大文件卡（批次 ⑦）：名字、大小、约多少 token；按住直接拖进 AI 的对话框。 -->
          <div v-if="ready.md_path" :class="['file-card', { draggable: desktop }]" role="button" tabindex="0"
            :aria-label="t.fileAria(fileName)" @mousedown="onFileDrag" @keydown.enter.prevent="handoff.revealOutput()">
            <Icon name="file" :size="28" class="file-icon" />
            <span class="file-copy">
              <strong>{{ fileName }}</strong>
              <small>{{ t.fileMeta(formatBytes(ready.byte_len), formatTokens(ready.markdown?.approx_tokens ?? 0)) }}<template v-if="ready.copied_attachments"> · {{ t.copiedFiles(ready.copied_attachments) }}</template></small>
            </span>
            <Icon name="dots" :size="18" class="file-grip" />
          </div>
          <p v-else class="ai-note ok"><Icon name="folder" :size="13" />
            <span>{{ t.outputAt(ready.output_dir) }}<template v-if="ready.copied_attachments"> · {{ t.copiedFiles(ready.copied_attachments) }}</template></span>
          </p>
          <p v-if="ready.md_path" class="ai-hint drag-hint">{{ t.dragFile(provider.label) }} {{ t.sideBySide }}</p>
          <div class="output-row">
            <button type="button" class="ai-tool" @click="handoff.revealOutput()"><Icon name="folder" :size="13" />{{ ready.md_path ? t.revealFile : t.reveal }}</button>
            <p v-if="freeNote" class="ai-hint">{{ freeNote }}</p>
          </div>
          <p v-if="dragFailed" class="ai-note warn" role="status"><Icon name="warning" :size="13" />{{ t.dragFailed }}</p>
          <p v-if="stale" class="ai-note warn" role="status"><Icon name="warning" :size="13" />{{ t.stale }}</p>
        </div>
      </div>
    </Transition>

    <Transition name="grow">
      <button v-if="progressDismissed && ready" type="button" class="last-export glass-control" @click="handoff.revealOutput()">
        <Icon name="folder" :size="13" />{{ t.lastExport }}
      </button>
    </Transition>

    <!-- 预览出错不藏进浮层：它决定导出的东西对不对，要一直看得见。 -->
    <p v-if="previewError" class="ai-note bad alert-pill" role="alert"><Icon name="warning" :size="13" />{{ previewError }}</p>

    <!-- 外面传进来的东西（问题条）紧贴在主按钮栏上方，和它一起量高度、一起贴底。 -->
    <div class="core">
      <slot />
    <div class="bar glass-control is-lens-host">
      <button type="button" :class="['ready-chip', { 'has-issues': issueTotal, 'is-waiting': waitingForData }]" :aria-expanded="details" @click="details = !details">
        <i class="ready-dot" aria-hidden="true"></i>
        <span v-if="waitingForData" class="ready-copy" role="status">
          <span>{{ t.readinessWaiting }}</span>
          <small>{{ syncProgress && isSyncing ? t.readinessWaitingStep(syncProgress.current, syncProgress.total) : t.readinessWaitingSub }}</small>
        </span>
        <span v-else class="ready-copy">
          <span>{{ readiness ? t.readiness(readiness.categories, readiness.percent) : t.readinessLoading }}</span>
          <small v-if="preview">{{ mdLine ?? t.packageSize(formatBytes(preview.estimated_bytes)) }}<template v-if="mdDowngrade.length"> · {{ mdDowngrade.join(' · ') }}</template><template v-if="issueTotal"> · {{ t.issueCount(issueTotal) }}</template></small>
        </span>
        <Icon name="chevron-down" :size="14" :class="['ready-chevron', { up: !details }]" />
      </button>

      <CapsuleWheel class="provider-wheel" loop :span="210" :items="providerItems" :model-value="provider.id"
        :aria-label="t.who" @update:model-value="pickProvider" />

      <!-- 订阅档位就摆在主按钮旁边：用户习惯直接点交付，不会先点开就绪度浮层去找那个勾。
           它决定导出的 .md 有多细，所以要一眼看得见、一下能改。 -->
      <span class="plan-wrap">
        <button type="button" role="switch" :aria-checked="subscribed" :class="['plan-toggle', { paid: subscribed, short: !subscribed && mdNeedsPaid }]"
          :aria-label="`${t.planTitle(provider.label)} ${t.subscribedHint}`" aria-describedby="plan-note" @click="subscribed = !subscribed">
          <span class="plan-mark" aria-hidden="true"><Icon v-if="subscribed" name="check" :size="12" /></span>
          <span class="plan-copy"><small>{{ provider.label }}</small><strong>{{ subscribed ? t.planPaid : t.planFree }}</strong></span>
        </button>
        <!-- 右上角的小注释：悬停 / 聚焦开关时展开说明两档的差别（以前这句话躲在最终提示词浮层里）。 -->
        <span class="plan-info" aria-hidden="true">?</span>
        <span id="plan-note" v-edge-safe class="plan-tip" role="tooltip">
          <strong>{{ t.planTitle(provider.label) }}</strong>{{ t.subscribedHint }}<template v-if="providerNote && provider.id === 'chatgpt'"><br>{{ providerNote }}</template>
        </span>
      </span>

      <button type="button" :class="['go', 'cta', { 'ready-glow': arrived }]" :disabled="!desktop || busy || isSyncing" :title="isSyncing ? t.goSubSyncing : t.run(provider.label)" @click="run(true)">
        <Icon name="send" :size="17" />
        <span class="go-copy"><strong>{{ t.go(provider.label) }}</strong><small>{{ isSyncing ? t.goSubSyncing : t.goSub }}</small></span>
      </button>
      <button type="button" class="export-only" :disabled="!desktop || busy || isSyncing" :title="t.exportOnly" :aria-label="t.exportOnly" @click="run(false)">
        <Icon name="export" :size="17" />
      </button>
    </div>
    </div>
    <p v-if="!desktop" class="ai-note offline">{{ t.desktopOnly }}</p>
  </section>
</template>

<style scoped>
.dock { position: relative; display: grid; justify-items: center; gap: 8px; pointer-events: none; container-type: inline-size; }
.dock > * { pointer-events: auto; }

.core { display: grid; width: 100%; gap: 8px; }
.bar {
  display: flex;
  width: 100%;
  max-width: 100%;
  align-items: center;
  gap: 10px;
  padding: 7px;
  border-radius: 999px;
}
.ready-chip {
  display: flex;
  flex: 1 1 0;
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
/* 等数据：点变成一个转着的小环。 */
.ready-chip.is-waiting .ready-dot {
  background: none;
  box-shadow: none;
  border: 2px solid color-mix(in srgb, var(--accent) 30%, transparent);
  border-top-color: var(--accent);
  animation: spin 900ms linear infinite;
}
.ready-copy { display: grid; min-width: 0; line-height: 1.25; font-size: var(--fs-sm); font-weight: 600; }
.ready-copy span, .ready-copy small { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.ready-copy small { color: var(--subtle); font-size: var(--fs-2xs); font-weight: 500; }
.ready-chevron { flex: 0 0 auto; color: var(--subtle); transition: rotate var(--dur-base) var(--ease-out); }
.ready-chevron.up { rotate: 180deg; }
.provider-wheel { flex: 0 0 auto; height: 44px; }
.plan-wrap { position: relative; flex: 0 0 auto; display: inline-flex; }
.plan-info { position: absolute; top: -5px; right: -5px; display: grid; width: 17px; height: 17px; place-items: center; border-radius: 50%;
  background: var(--mat-glass-strong); box-shadow: var(--glass-rim), 0 0 0 1px color-mix(in srgb, var(--ink) 16%, transparent);
  color: var(--muted); font-size: 11px; font-weight: 800; line-height: 1; pointer-events: none; }
.plan-tip { position: absolute; right: -8px; bottom: calc(100% + 12px); z-index: 3; width: max-content; max-width: 280px; padding: 10px 12px; border-radius: 14px;
  background: var(--mat-glass-strong); -webkit-backdrop-filter: var(--mat-glass-blur); backdrop-filter: var(--mat-glass-blur);
  box-shadow: var(--glass-rim), var(--mat-glass-shadow); color: var(--muted); font-size: var(--fs-xs); line-height: 1.55;
  opacity: 0; translate: 0 4px; pointer-events: none; transition: opacity 160ms ease, translate 200ms var(--ease-out); }
.plan-tip strong { display: block; margin-bottom: 2px; color: var(--ink); font-size: var(--fs-sm); }
.plan-wrap:hover .plan-tip, .plan-toggle:focus-visible ~ .plan-tip { opacity: 1; translate: 0 0; }
.plan-toggle { display: inline-flex; flex: 0 0 auto; min-height: 44px; align-items: center; gap: 8px; padding: 4px 14px 4px 8px; border: 0; border-radius: 999px;
  background: color-mix(in srgb, var(--ink) 6%, transparent); color: var(--muted); font: inherit; text-align: left; cursor: pointer;
  transition: background var(--dur-base) ease, color var(--dur-base) ease, box-shadow var(--dur-base) ease; }
.plan-toggle:hover { background: color-mix(in srgb, var(--ink) 10%, transparent); color: var(--ink); }
.plan-toggle:active { scale: .97; }
.plan-mark { display: grid; width: 22px; height: 22px; flex: none; place-items: center; border-radius: 50%;
  box-shadow: inset 0 0 0 1.5px color-mix(in srgb, var(--ink) 28%, transparent); transition: background var(--dur-base) ease, box-shadow var(--dur-base) ease; }
.plan-copy { display: grid; line-height: 1.15; }
.plan-copy small { color: var(--subtle); font-size: var(--fs-2xs); font-weight: 500; white-space: nowrap; }
.plan-copy strong { font-size: var(--fs-sm); font-weight: 700; white-space: nowrap; }
.plan-toggle.paid { background: color-mix(in srgb, var(--accent) 16%, transparent); color: var(--ink); }
.plan-toggle.paid .plan-mark { background: var(--accent); color: var(--accent-ink); box-shadow: none; }
.plan-toggle.short { box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--warning) 60%, transparent); }
.plan-toggle.short strong { color: var(--warning); }

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
.handover { margin: 0 0 12px; color: var(--muted); font-size: var(--fs-xs); line-height: 1.55; }
.handover b { margin-right: 6px; color: var(--subtle); font-weight: 650; }
.sheet-head { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
.sheet-head .ai-label { margin: 0; }
.sheet-close { display: grid; width: 30px; height: 30px; place-items: center; border: 0; border-radius: 50%; background: var(--glass-press); color: var(--ink); cursor: pointer; }
.prompt {
  max-height: 160px; margin: 10px 0 0; padding: 10px 12px; overflow: auto;
  border-radius: var(--radius-sm); background: var(--mat-inset);
  color: var(--ink); font-family: inherit; font-size: var(--fs-sm); line-height: 1.55; white-space: pre-wrap; overflow-wrap: anywhere; box-shadow: var(--mat-inset-shadow);
}
.prompt-view { display: block; width: 100%; max-height: 220px; border: 0; text-align: left; cursor: text; transition: box-shadow var(--dur-fast) ease; }
.prompt-view:hover { box-shadow: var(--mat-inset-shadow), 0 0 0 1px color-mix(in srgb, var(--ink) 16%, transparent); }
.prompt-edit { display: block; width: 100%; max-height: 320px; resize: none; border: 0; outline: none; box-shadow: var(--mat-inset-shadow), 0 0 0 2px var(--focus); }
.prompt-meta { display: flex; align-items: center; gap: 12px; margin: 6px 2px 0; font-size: var(--fs-2xs); }
.prompt-meta span, .prompt-meta button { display: inline-flex; align-items: center; gap: 4px; }
.prompt-meta .hint { color: var(--subtle); }
.prompt-meta .edited { color: var(--accent); font-weight: 600; }
.prompt-meta .reset { padding: 0; border: 0; background: none; color: var(--muted); font: inherit; cursor: pointer; }
.prompt-meta .reset:hover { color: var(--ink); }
.prompt-tail { margin: 8px 2px 0; color: var(--subtle); font-size: var(--fs-xs); line-height: 1.5; }
.prompt-tail span { display: block; margin-bottom: 2px; font-size: var(--fs-2xs); }
.issues { display: grid; gap: 6px; margin: 10px 0 0; padding: 0; list-style: none; }
/* 提醒是一枚枚淡色胶囊，不是一排刺眼的彩字。 */
.issues .ai-note { margin: 0; padding: 7px 12px; border-radius: 12px; }
.issues .ai-note.warn { background: color-mix(in srgb, var(--warning) 10%, transparent); }
.issues .ai-note.bad { background: color-mix(in srgb, var(--danger) 10%, transparent); }
.repeat { margin-left: auto; padding-left: 8px; font-size: var(--fs-2xs); }
.output { margin-top: 10px; }
.save-failed { display: flex; flex-wrap: wrap; align-items: center; gap: 6px 8px; }
.provider-note { margin: 8px 0 0; padding: 7px 12px; border-radius: 12px; background: color-mix(in srgb, var(--warning) 10%, transparent); }
.file-card { display: flex; align-items: center; gap: 14px; padding: 14px 16px; border-radius: var(--radius-md); background: var(--mat-card); box-shadow: var(--mat-rim), var(--mat-shadow); user-select: none; }
.file-card.draggable { cursor: grab; }
.file-card.draggable:active { cursor: grabbing; }
.file-card:focus-visible { outline: 2px solid var(--focus); outline-offset: 2px; }
.file-icon { flex: none; color: var(--accent); }
.file-copy { display: grid; flex: 1; min-width: 0; gap: 2px; }
.file-copy strong { overflow: hidden; color: var(--ink); font-size: var(--fs-md); text-overflow: ellipsis; white-space: nowrap; }
.file-copy small { color: var(--subtle); font-size: var(--fs-xs); }
.file-grip { flex: none; color: var(--subtle); }
.drag-hint { margin: 8px 2px 0; }
.output .ai-note span { overflow-wrap: anywhere; }
.output-row { display: flex; align-items: center; gap: 12px; margin-top: 6px; }
.output-row .ai-hint { margin: 0; }
.last-export { display: inline-flex; align-items: center; gap: 6px; padding: 6px 14px; border: 0; border-radius: 999px; color: var(--muted); font-size: var(--fs-xs); cursor: pointer; }
.last-export:hover { color: var(--ink); }
.offline { margin: 0; padding: 4px 12px; border-radius: 999px; background: var(--mat-glass); }
.alert-pill { margin: 0; padding: 6px 14px; border-radius: 999px; background: var(--mat-glass-strong); box-shadow: var(--glass-rim); }

.sheet-enter-active, .sheet-leave-active, .grow-enter-active, .grow-leave-active {
  transition: opacity 220ms ease, translate 320ms var(--ease-out), scale 320ms var(--ease-out);
  transform-origin: 50% 100%;
}
/* 只动合成属性：以前带 filter: blur 过渡，玻璃浮层淡出时整块发灰拖影（用户看到的「灰色残影」）。 */
.sheet-enter-from, .sheet-leave-to, .grow-enter-from, .grow-leave-to { opacity: 0; translate: 0 14px; scale: .96; }

/* 放不下一行时排成整齐的两行（按坞自己的宽度，不按窗口）：上面是就绪度 + 交给谁，下面是主按钮 + 只导出。
   以前是 flex-wrap 随手折行，只导出那枚圆钮会孤零零掉到第二行。 */
/* 坞里放五样东西（就绪度、交给谁、档位、主按钮、只导出），九百来宽以下就排成两行，
   就绪度那枚不再被挤成「6 类数…」。 */
@container (max-width: 900px) {
  /* 两行各自占满：第一行就绪度撑满、传送带定宽；第二行主按钮撑满、只导出定宽。 */
  .bar { width: 100%; flex-wrap: wrap; gap: 8px; border-radius: var(--radius-lg); }
  /* 第二行：档位开关 + 主按钮 + 只导出——档位紧挨着主按钮，点交付前一眼就看见。 */
  .ready-chip { flex: 1 1 calc(100% - 226px); min-height: 44px; }
  .go { flex: 1 1 160px; min-width: 0; min-height: 48px; justify-content: center; padding-inline: 18px; }
  .go-copy { min-width: 0; }
  .go-copy strong, .go-copy small { overflow: hidden; text-overflow: ellipsis; }
}
@container (max-width: 460px) {
  .go-copy small { display: none; }
}
</style>
