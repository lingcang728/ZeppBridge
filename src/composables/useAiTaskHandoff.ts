/**
 * 交付预览页的状态机（B4：三态步骤条 + 逐步独立重试）。
 *
 * 三步真实含义，文案必须守住：
 *   1. `prepare`  后端写 health-context.json + 提示词文件（ai_task_prepare）。
 *   2. `copy`     前端把 prompt_text 写进剪贴板（navigator.clipboard）。
 *   3. `attach`   用户在 AI 站点里**手动**添加文件——这一步永远没有
 *                 「自动完成」，最多是用户点「我已添加」的确认标记。
 *
 * 没有任何一步叫「已发送」或「已上传」：打开的只是那个网站。
 */
import { ref } from 'vue';
import { backend, toUserMessage } from '../lib/bridge';
import type {
  AiTask,
  AiTaskPrepareResult,
  AiTaskPreview,
} from '../lib/bridge/types';
import { taskSnapshot } from '../lib/aiTask/draft';
import { coverageNoteText } from '../lib/aiTask/copy';
import { copyTextToClipboard, openProviderSite } from './useAiHandoff';
import type { AiProvider } from '../lib/aiProviders';
import { defineMessages, messagesOf } from '../i18n';

export type HandoffStepId = 'prepare' | 'copy' | 'attach';
export type HandoffStepState = 'idle' | 'doing' | 'done' | 'failed' | 'blocked' | 'waiting';

export interface HandoffStep {
  state: HandoffStepState;
  errorText: string | null;
}

const messages = defineMessages(
  {
    prepareFailed: '准备文件失败',
    copyFailed: '复制提示词失败',
    openFailed: '无法打开 AI 网站',
    previewFailed: '预览生成失败',
  },
  {
    prepareFailed: 'Could not prepare the files',
    copyFailed: 'Could not copy the prompt',
    openFailed: 'Could not open the AI site',
    previewFailed: 'Could not build the preview',
  },
  {
    prepareFailed: 'No se pudieron preparar los archivos',
    copyFailed: 'No se pudo copiar el prompt',
    openFailed: 'No se pudo abrir el sitio de IA',
    previewFailed: 'No se pudo generar la vista previa',
  },
);
const copy = () => messagesOf(messages);

const idleStep = (): HandoffStep => ({ state: 'idle', errorText: null });

export function useAiTaskHandoff() {
  const preview = ref<AiTaskPreview | null>(null);
  const previewLoading = ref(false);
  const previewError = ref<string | null>(null);
  const previewSeq = ref(0);

  const prepareResult = ref<AiTaskPrepareResult | null>(null);
  /** 准备时那份草稿的快照——草稿再被改过，已准备的文件就是旧的。 */
  const preparedSnapshot = ref<string | null>(null);
  const steps = ref<Record<HandoffStepId, HandoffStep>>({
    prepare: idleStep(),
    copy: idleStep(),
    // 手动步骤的初始态就是 waiting：它的「完成」只能由用户确认。
    attach: { state: 'waiting', errorText: null },
  });
  /** 打开网站这步不算独立状态，但要如实记录结果（opened/skipped/failed）。 */
  const openOutcome = ref<'opened' | 'skipped' | 'failed' | null>(null);
  const openError = ref<string | null>(null);

  const lastProvider = ref<AiProvider | null>(null);

  const setStep = (id: HandoffStepId, state: HandoffStepState, errorText: string | null = null) => {
    steps.value = { ...steps.value, [id]: { state, errorText } };
  };

  /**
   * 已产出的文件是否还代表这份任务：prepare 记快照，调用方把**当前**草稿
   * 传进来比。刻意做成函数而不是 computed——草稿在 useAiTaskDraft 单例里
   * 以整体替换的方式更新，比较必须落在调用方的响应式上下文里。
   */
  const isStale = (task: AiTask): boolean =>
    preparedSnapshot.value !== null && taskSnapshot(task) !== preparedSnapshot.value;

  const loadPreview = async (task: AiTask) => {
    const seq = ++previewSeq.value;
    previewLoading.value = true;
    previewError.value = null;
    try {
      const result = await backend.aiTaskPreview(task);
      if (seq === previewSeq.value) preview.value = result;
    } catch (error) {
      if (seq === previewSeq.value) {
        previewError.value = toUserMessage(error, copy().previewFailed);
      }
    } finally {
      if (seq === previewSeq.value) previewLoading.value = false;
    }
  };

  const runPrepare = async (task: AiTask): Promise<AiTaskPrepareResult | null> => {
    setStep('prepare', 'doing');
    openOutcome.value = null;
    openError.value = null;
    try {
      const result = await backend.aiTaskPrepare(task, coverageNoteText());
      prepareResult.value = result;
      preparedSnapshot.value = taskSnapshot(task);
      if (result.status === 'blocked') {
        setStep('prepare', 'blocked');
        setStep('copy', 'idle');
        setStep('attach', 'waiting');
        return result;
      }
      setStep('prepare', 'done');
      return result;
    } catch (error) {
      setStep('prepare', 'failed', toUserMessage(error, copy().prepareFailed));
      return null;
    }
  };

  const runCopy = async (): Promise<boolean> => {
    const result = prepareResult.value;
    if (!result || result.status !== 'ready') return false;
    setStep('copy', 'doing');
    try {
      await copyTextToClipboard(result.prompt_text);
      setStep('copy', 'done');
      return true;
    } catch (error) {
      setStep('copy', 'failed', toUserMessage(error, copy().copyFailed));
      return false;
    }
  };

  const runOpen = async (provider: AiProvider): Promise<boolean> => {
    lastProvider.value = provider;
    try {
      openOutcome.value = await openProviderSite(provider);
      openError.value = null;
      return true;
    } catch (error) {
      openOutcome.value = 'failed';
      openError.value = toUserMessage(error, copy().openFailed);
      return false;
    }
  };

  /** CTA「准备并打开」：逐步推进，哪步失败停在哪步，各步可单独重试。 */
  const runAll = async (task: AiTask, provider: AiProvider) => {
    const prepared = await runPrepare(task);
    if (!prepared || prepared.status !== 'ready') return;
    if (!(await runCopy())) return;
    await runOpen(provider);
    // attach 保持 waiting——文件要用户在 AI 页面上自己加。
  };

  /** 「仅导出文件」：只准备，不复制、不打开。 */
  const exportOnly = (task: AiTask) => runPrepare(task);

  /** 用户确认已在 AI 站点添加附件后的标记；不确认也不拦任何事。 */
  const markAttached = () => setStep('attach', 'done');

  const reset = () => {
    steps.value = { prepare: idleStep(), copy: idleStep(), attach: { state: 'waiting', errorText: null } };
    prepareResult.value = null;
    preparedSnapshot.value = null;
    openOutcome.value = null;
    openError.value = null;
    lastProvider.value = null;
  };

  return {
    preview,
    previewLoading,
    previewError,
    prepareResult,
    preparedSnapshot,
    isStale,
    steps,
    openOutcome,
    openError,
    loadPreview,
    runPrepare,
    runCopy,
    runOpen,
    runAll,
    exportOnly,
    markAttached,
    reset,
  };
}
