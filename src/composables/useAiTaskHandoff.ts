/**
 * 交付区的状态机：三步各自有状态、各自可重试。
 *
 *   1. `prepare` 后端把 health-context.json、prompt.txt 和附件原件写到桌面
 *                `ZeppBridge AI\<任务名>_<时间>\`（ai_task_prepare）。
 *   2. `copy`    前端把最终提示词写进剪贴板。
 *   3. `open`    打开所选 AI 的网站，并在资源管理器里选中那个文件夹。
 *
 * 没有任何一步叫「已发送」或「已上传」：打开的只是那个网站，文件要用户
 * 自己从桌面拖进对话框。
 */
import { ref } from 'vue';
import { backend, toUserMessage } from '../lib/bridge';
import type { AiTask, AiTaskPrepareResult } from '../lib/bridge/types';
import { taskSnapshot } from '../lib/aiTask/draft';
import { coverageNoteText } from '../lib/aiTask/copy';
import { copyTextToClipboard, openProviderSite, revealInFolder } from './useAiHandoff';
import { AI_PROVIDER_BY_ID, type AiProvider, type AiProviderId } from '../lib/aiProviders';
import { defineMessages, messagesOf } from '../i18n';

export type HandoffStepId = 'prepare' | 'copy' | 'open';
export type HandoffStepState = 'idle' | 'doing' | 'done' | 'failed' | 'blocked' | 'skipped';

export interface HandoffStep {
  state: HandoffStepState;
  errorText: string | null;
}

const messages = defineMessages(
  { prepareFailed: '准备文件失败', copyFailed: '复制提示词失败', openFailed: '无法打开 AI 网站' },
  { prepareFailed: 'Could not prepare the files', copyFailed: 'Could not copy the prompt', openFailed: 'Could not open the AI site' },
  { prepareFailed: 'No se pudieron preparar los archivos', copyFailed: 'No se pudo copiar el prompt', openFailed: 'No se pudo abrir el sitio de IA' },
  'composables/useAiTaskHandoff',
);
const copy = () => messagesOf(messages);

const idle = (): HandoffStep => ({ state: 'idle', errorText: null });
const freshSteps = (): Record<HandoffStepId, HandoffStep> => ({ prepare: idle(), copy: idle(), open: idle() });

/** 「上次交付给谁」的持久化键——下次进页按它预选提供方。 */
const LAST_PROVIDER_KEY = 'zeppbridge.ai.handoff.provider';

const readLastProvider = (): AiProvider | null => {
  try {
    const raw = window.localStorage.getItem(LAST_PROVIDER_KEY);
    return raw ? AI_PROVIDER_BY_ID[raw as AiProviderId] ?? null : null;
  } catch {
    return null;
  }
};

const storeLastProvider = (provider: AiProvider) => {
  try {
    window.localStorage.setItem(LAST_PROVIDER_KEY, provider.id);
  } catch {
    // 隐私模式写不进就不记——交付本身不受影响。
  }
};

export function useAiTaskHandoff() {
  const prepareResult = ref<AiTaskPrepareResult | null>(null);
  /** 准备时那份草稿的快照——草稿再被改过，已准备的文件就是旧的。 */
  const preparedSnapshot = ref<string | null>(null);
  const steps = ref(freshSteps());
  const lastProvider = ref<AiProvider | null>(readLastProvider());

  const setStep = (id: HandoffStepId, state: HandoffStepState, errorText: string | null = null) => {
    steps.value = { ...steps.value, [id]: { state, errorText } };
  };

  /** 刻意做成函数：草稿单例整体替换，比较要落在调用方的响应式上下文里。 */
  const isStale = (task: AiTask): boolean =>
    preparedSnapshot.value !== null && taskSnapshot(task) !== preparedSnapshot.value;

  const runPrepare = async (task: AiTask, direction: string | null = null) => {
    steps.value = { ...freshSteps(), prepare: { state: 'doing', errorText: null } };
    try {
      const result = await backend.aiTaskPrepare(task, coverageNoteText(), direction);
      prepareResult.value = result;
      preparedSnapshot.value = taskSnapshot(task);
      setStep('prepare', result.status === 'blocked' ? 'blocked' : 'done');
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

  const revealOutput = async () => {
    const dir = prepareResult.value?.status === 'ready' ? prepareResult.value.output_dir : '';
    await revealInFolder(dir).catch(() => undefined);
  };

  const runOpen = async (provider: AiProvider): Promise<boolean> => {
    lastProvider.value = provider;
    storeLastProvider(provider);
    setStep('open', 'doing');
    try {
      const outcome = await openProviderSite(provider);
      setStep('open', outcome === 'opened' ? 'done' : 'skipped');
      return true;
    } catch (error) {
      setStep('open', 'failed', toUserMessage(error, copy().openFailed));
      return false;
    }
  };

  /** 主按钮：导出 → 复制 → 打开网站 + 选中文件夹。哪步失败停在哪步。 */
  const runAll = async (task: AiTask, provider: AiProvider, direction: string | null = null) => {
    const prepared = await runPrepare(task, direction);
    if (!prepared || prepared.status !== 'ready') return;
    if (!(await runCopy())) return;
    await runOpen(provider);
    await revealOutput();
  };

  /** 「只导出到桌面」：导出并选中文件夹，不复制、不打开网站。 */
  const exportOnly = async (task: AiTask, direction: string | null = null) => {
    const prepared = await runPrepare(task, direction);
    if (prepared?.status === 'ready') await revealOutput();
  };

  return {
    prepareResult,
    preparedSnapshot,
    steps,
    lastProvider,
    isStale,
    runPrepare,
    runCopy,
    runOpen,
    runAll,
    exportOnly,
    revealOutput,
  };
}
