import { openUrl, revealItemInDir } from '@tauri-apps/plugin-opener';
import { ref } from 'vue';
import { isTauri, tauriApi, toUserMessage } from './useTauriApi';
import type { AiHandoffResult, ExportSelection } from '../types';
import { isFixedAiProviderUrl, type AiProvider } from '../lib/aiProviders';
import { defineMessages, messagesOf } from '../i18n';

const messages = defineMessages(
  {
    clipboardUnsupported: '当前环境不支持剪贴板写入',
    targetNotAllowed: '目标 AI 地址不在允许列表中',
    handoffFailed: 'AI 交接失败',
    copiedButCannotOpen: (label: string) => `已复制，但无法打开 ${label}`,
    nothingToRetry: '暂无可重试的 AI 交接',
  },
  {
    clipboardUnsupported: 'This environment cannot write to the clipboard',
    targetNotAllowed: 'That AI address is not on the allow-list',
    handoffFailed: 'The AI hand-off did not go through',
    copiedButCannotOpen: (label: string) => `Copied, but ${label} could not be opened`,
    nothingToRetry: 'There is no AI hand-off to retry',
  },
  {
    clipboardUnsupported: 'Este entorno no puede escribir en el portapapeles',
    targetNotAllowed: 'Esa dirección de IA no está en la lista permitida',
    handoffFailed: 'No se pudo completar la entrega a la IA',
    copiedButCannotOpen: (label: string) => `Copiado, pero no se pudo abrir ${label}`,
    nothingToRetry: 'No hay ninguna entrega a la IA para reintentar',
  },
  'composables/useAiHandoff',
);

const copy = () => messagesOf(messages);

export type AiHandoffState = 'idle' | 'preparing' | 'opened' | 'copied_only' | 'attachment' | 'failed';

/* ---- 可复用的单步原语 ----
 *
 * Beta1 的交付预览页把「复制提示词」和「打开 AI 站点」拆成两个独立步骤，
 * 各自有自己的状态与重试——所以这两步从 prepareAndCopy 里抽出来做成
 * 模块级函数。useAiHandoff 原有的状态机行为不变。
 */

/** 写剪贴板；环境不支持时抛带本地化文案的 Error。 */
export const copyTextToClipboard = async (text: string): Promise<void> => {
  if (!navigator.clipboard?.writeText) {
    throw new Error(copy().clipboardUnsupported);
  }
  await navigator.clipboard.writeText(text);
};

/**
 * 打开白名单内的 AI 站点。
 * 'opened' = opener 真的开了浏览器；'skipped' = 非桌面运行时没法开（网页预览
 * 不许谎称打开了浏览器）。URL 不在固定白名单里直接抛错。
 */
export const openProviderSite = async (provider: AiProvider): Promise<'opened' | 'skipped'> => {
  if (!isFixedAiProviderUrl(provider.url)) {
    throw new Error(copy().targetNotAllowed);
  }
  if (!isTauri()) return 'skipped';
  await openUrl(provider.url);
  return 'opened';
};

/** 在资源管理器里选中导出的文件夹；非桌面运行时什么都不做。 */
export const revealInFolder = async (path: string): Promise<void> => {
  if (!isTauri() || !path) return;
  await revealItemInDir(path);
};

export function useAiHandoff() {
  const handoffState = ref<AiHandoffState>('idle');
  const handoffResult = ref<AiHandoffResult | null>(null);
  const handoffError = ref<string | null>(null);
  const preparedProvider = ref<AiProvider | null>(null);

  const copyToClipboard = copyTextToClipboard;

  const prepareAndCopy = async (
    provider: AiProvider,
    selection: ExportSelection,
    prompt: string,
    includePreciseRoute: boolean,
  ) => {
    handoffState.value = 'preparing';
    handoffError.value = null;
    handoffResult.value = null;
    preparedProvider.value = provider;

    if (!isFixedAiProviderUrl(provider.url)) {
      const error = new Error(copy().targetNotAllowed);
      handoffState.value = 'failed';
      handoffError.value = error.message;
      throw error;
    }

    let result: AiHandoffResult;
    try {
      result = await tauriApi.prepareAiHandoff(selection, prompt, includePreciseRoute);
      handoffResult.value = result;
      await copyToClipboard(result.clipboardText);
    } catch (error) {
      handoffState.value = 'failed';
      handoffError.value = toUserMessage(error, copy().handoffFailed);
      throw error;
    }

    if (!isTauri()) {
      // A web preview can copy text, but it must not claim that a desktop
      // browser was opened by the Tauri opener plugin.
      handoffState.value = result.mode === 'attachment' ? 'attachment' : 'copied_only';
      return result;
    }

    try {
      await openUrl(provider.url);
      handoffState.value = result.mode === 'attachment' ? 'attachment' : 'opened';
    } catch (error) {
      // Clipboard succeeded; keep that fact and allow a retry without
      // pretending that the browser navigation succeeded.
      handoffState.value = 'copied_only';
      handoffError.value = toUserMessage(error, copy().copiedButCannotOpen(provider.label));
    }
    return result;
  };

  const retryOpen = async (provider?: AiProvider) => {
    const targetProvider = preparedProvider.value ?? provider;
    if (!targetProvider || !handoffResult.value) {
      throw new Error(copy().nothingToRetry);
    }
    if (!isTauri()) {
      handoffState.value = handoffResult.value.mode === 'attachment' ? 'attachment' : 'copied_only';
      return;
    }
    if (!isFixedAiProviderUrl(targetProvider.url)) {
      const error = new Error(copy().targetNotAllowed);
      handoffState.value = 'copied_only';
      handoffError.value = error.message;
      throw error;
    }
    try {
      await openUrl(targetProvider.url);
      handoffState.value = handoffResult.value.mode === 'attachment' ? 'attachment' : 'opened';
      handoffError.value = null;
    } catch (error) {
      handoffState.value = 'copied_only';
      handoffError.value = toUserMessage(error, copy().copiedButCannotOpen(targetProvider.label));
      throw error;
    }
  };

  return {
    handoffState,
    handoffResult,
    handoffError,
    preparedProvider,
    prepareAndCopy,
    retryOpen,
    /* 交付预览页用的单步原语（模块级同名函数的别名）。 */
    copyText: copyTextToClipboard,
    openProvider: openProviderSite,
  };
}
