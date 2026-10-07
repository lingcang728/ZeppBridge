/**
 * 交付区的状态机：三步各自有状态、各自可重试。
 *
 *   1. `prepare` 后端把提示词 + 读法 + 数据写成**一个** `.md`（批次 ⑦；附件原件另放 attachments/）
 *                到桌面 `ZeppBridge AI\<任务名>_<时间>\`（ai_task_prepare）。
 *   2. `copy`    前端把一句开场白写进剪贴板（提示词已在文件里，不用再粘一遍）。
 *   3. `open`    打开所选 AI 的网站；文件卡可以直接拖进对话框，也能在资源管理器里选中它。
 *
 * 没有任何一步叫「已发送」或「已上传」：打开的只是那个网站，文件要用户
 * 自己从桌面拖进对话框。
 */
import { ref } from 'vue';
import { backend, toUserMessage } from '../lib/bridge';
import type { AiTask, AiTaskPrepareOptions, AiTaskPrepareResult } from '../lib/bridge/types';
import { taskSnapshot } from '../lib/aiTask/draft';
import { coverageNoteText } from '../lib/aiTask/copy';
import { copyTextToClipboard, openProviderSite, revealInFolder } from './useAiHandoff';
import { AI_PROVIDER_BY_ID, type AiProvider, type AiProviderId } from '../lib/aiProviders';
import { defineMessages, messagesOf } from '../i18n';
import { useCardCollection } from './useCardCollection';

export type HandoffStepId = 'prepare' | 'copy' | 'open';
export type HandoffStepState = 'idle' | 'doing' | 'done' | 'failed' | 'blocked' | 'skipped';

export interface HandoffStep {
  state: HandoffStepState;
  errorText: string | null;
}

const messages = defineMessages(
  {
    prepareFailed: '准备文件失败', copyFailed: '复制开场白失败', openFailed: '无法打开 AI 网站',
    saveFailed: '任务没保存上：文件照常准备，但下次打开不会记得这次的选择，MCP 的任务授权也还是旧的。',
    kickoff: '请读我附上的文件。先和我讨论，不要急着给计划；等我说「定稿」，再按文件末尾的格式给出 JSON。',
  },
  {
    prepareFailed: 'Could not prepare files', copyFailed: 'Could not copy the opening message', openFailed: 'Could not open the AI site',
    saveFailed: 'The task was not saved: the file is still prepared, but these choices will not be remembered next time and MCP task access stays as before.',
    kickoff: 'Please read the attached file. Discuss it with me first; when I say “finalize”, return a JSON plan in the format at the end of the file.',
  },
  {
    prepareFailed: 'No se pudieron preparar los archivos', copyFailed: 'No se pudo copiar el mensaje inicial', openFailed: 'No se pudo abrir el sitio de la IA',
    saveFailed: 'La tarea no se guardó: el archivo se prepara igual, pero la próxima vez no se recordarán estas opciones y el acceso MCP de la tarea sigue como antes.',
    kickoff: 'Lee el archivo adjunto. Primero hablemos; cuando diga «versión final», devuelve un plan JSON con el formato al final del archivo.',
  },
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
  /** 一次交接（先保存、再准备文件……）从按下到结束都算在途：保存那一段也不许再按一次（R11）。 */
  const inFlight = ref(false);
  /** 这次交接前保存任务失败的原因：文件照常准备，但要让人知道任务本身没存上。 */
  const saveError = ref<string | null>(null);

  const setStep = (id: HandoffStepId, state: HandoffStepState, errorText: string | null = null) => {
    steps.value = { ...steps.value, [id]: { state, errorText } };
  };

  /** 刻意做成函数：草稿单例整体替换，比较要落在调用方的响应式上下文里。 */
  const isStale = (task: AiTask): boolean =>
    preparedSnapshot.value !== null && taskSnapshot(task) !== preparedSnapshot.value;

  const runPrepare = async (task: AiTask, direction: string | null = null, options?: AiTaskPrepareOptions) => {
    steps.value = { ...freshSteps(), prepare: { state: 'doing', errorText: null } };
    try {
      const result = await backend.aiTaskPrepare(task, coverageNoteText(), direction, options);
      prepareResult.value = result;
      preparedSnapshot.value = taskSnapshot(task);
      setStep('prepare', result.status === 'blocked' ? 'blocked' : 'done');
      // 从收集箱开的任务真的交出去了：箱子清空（中途反悔回来，牌还在）。
      if (result.status === 'ready' && task.categories.some((range) => range.picked_days?.length)) useCardCollection().clearAfterHandoff();
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
      // 单个 .md 时提示词已在文件里：只复制一句开场白，免得「上传一遍又粘贴一遍」。
      await copyTextToClipboard(result.md_path ? copy().kickoff : result.prompt_text);
      setStep('copy', 'done');
      return true;
    } catch (error) {
      setStep('copy', 'failed', toUserMessage(error, copy().copyFailed));
      return false;
    }
  };

  /** 在资源管理器里选中交出去的那个文件（单个 .md）；旧形态选中文件夹。 */
  const revealOutput = async () => {
    const result = prepareResult.value?.status === 'ready' ? prepareResult.value : null;
    await revealInFolder(result?.md_path || result?.output_dir || '').catch(() => undefined);
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

  /** 主按钮：准备文件 → 复制开场白 → 打开网站。哪步失败停在哪步。文件卡在坞上，直接拖进对话框；
      拖不了（或网页预览）时用「在资源管理器里显示」。 */
  const runAll = async (task: AiTask, provider: AiProvider, direction: string | null = null, options?: AiTaskPrepareOptions) => {
    const prepared = await runPrepare(task, direction, options);
    if (!prepared || prepared.status !== 'ready') return;
    if (!(await runCopy())) return;
    await runOpen(provider);
    if (!prepared.md_path) await revealOutput();
  };

  /** 「只导出到桌面」：导出并选中文件夹，不复制、不打开网站。 */
  const exportOnly = async (task: AiTask, direction: string | null = null, options?: AiTaskPrepareOptions) => {
    const prepared = await runPrepare(task, direction, options);
    if (prepared?.status === 'ready') await revealOutput();
  };

  /**
   * 主按钮的入口：先保存任务，再交给 `go`（runAll / exportOnly）。第一个 await 之前就占住 `inFlight`，
   * 保存还没回来时再按一次直接忽略——以前 busy 只看准备 / 复制两步，保存那几百毫秒里能连点出两次交接。
   * 保存失败不吞：记进 `saveError`，交接照常往下走（文件本身不依赖任务存没存上）。
   */
  const start = async (save: () => Promise<unknown>, go: () => Promise<void>): Promise<boolean> => {
    if (inFlight.value) return false;
    inFlight.value = true;
    saveError.value = null;
    try {
      try {
        await save();
      } catch {
        // 具体原因任务名胶囊下面已经在报（useAiTaskDraft.lastError），这里只说对交接意味着什么。
        saveError.value = copy().saveFailed;
      }
      await go();
      return true;
    } finally {
      inFlight.value = false;
    }
  };

  return {
    inFlight,
    saveError,
    start,
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
