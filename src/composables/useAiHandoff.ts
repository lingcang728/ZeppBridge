import { openUrl } from '@tauri-apps/plugin-opener';
import { ref } from 'vue';
import { isTauri, tauriApi, toUserMessage } from './useTauriApi';
import type { AiHandoffResult, ExportSelection } from '../types';
import { isFixedAiProviderUrl, type AiProvider } from '../lib/aiProviders';

export type AiHandoffState = 'idle' | 'preparing' | 'opened' | 'copied_only' | 'attachment' | 'failed';

export function useAiHandoff() {
  const handoffState = ref<AiHandoffState>('idle');
  const handoffResult = ref<AiHandoffResult | null>(null);
  const handoffError = ref<string | null>(null);
  const preparedProvider = ref<AiProvider | null>(null);

  const copyToClipboard = async (text: string) => {
    if (!navigator.clipboard?.writeText) {
      throw new Error('当前环境不支持剪贴板写入');
    }
    await navigator.clipboard.writeText(text);
  };

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
      const error = new Error('目标 AI 地址不在允许列表中');
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
      handoffError.value = toUserMessage(error, 'AI 交接失败');
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
      handoffError.value = toUserMessage(error, `已复制，但无法打开 ${provider.label}`);
    }
    return result;
  };

  const retryOpen = async (provider?: AiProvider) => {
    const targetProvider = preparedProvider.value ?? provider;
    if (!targetProvider || !handoffResult.value) {
      throw new Error('暂无可重试的 AI 交接');
    }
    if (!isTauri()) {
      handoffState.value = handoffResult.value.mode === 'attachment' ? 'attachment' : 'copied_only';
      return;
    }
    if (!isFixedAiProviderUrl(targetProvider.url)) {
      const error = new Error('目标 AI 地址不在允许列表中');
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
      handoffError.value = toUserMessage(error, `已复制，但无法打开 ${targetProvider.label}`);
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
  };
}
