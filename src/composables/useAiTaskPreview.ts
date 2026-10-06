/**
 * 草稿的覆盖预览（`ai_task_preview`）：关系网的覆盖弧、覆盖速览、交付区的
 * 明细都读同一份结果。
 *
 * 全局单例（2026-10 交给 AI 拆成子页面后）：总页的底栏、/ai/check 读同一份，切子页面不重算。
 * `watchDraft` 只装一次，给草稿变化加 600ms 去抖：打字、拖节点都会连续改草稿，没必要每一下都查库。
 */
import { ref, watch, type Ref } from 'vue';
import { backend, isDesktop, toUserMessage } from '../lib/bridge';
import type { AiTask, AiTaskPreview } from '../lib/bridge/types';
import { taskSnapshot } from '../lib/aiTask/draft';
import { tokenBudget } from '../lib/aiTask/budget';
import { defineMessages, messagesOf } from '../i18n';

const messages = defineMessages(
  { previewFailed: '预览生成失败' },
  { previewFailed: 'Could not build the preview' },
  { previewFailed: 'No se pudo generar la vista previa' },
  'composables/useAiTaskPreview',
);

const DEBOUNCE_MS = 600;

const preview = ref<AiTaskPreview | null>(null);
const previewLoading = ref(false);
const previewError = ref<string | null>(null);
let seq = 0;
let watching = false;

const loadPreview = async (task: AiTask) => {
  const mine = ++seq;
  previewLoading.value = true;
  previewError.value = null;
  try {
    const result = await backend.aiTaskPreview(task, tokenBudget.value);
    if (mine === seq) preview.value = result;
  } catch (error) {
    if (mine === seq) previewError.value = toUserMessage(error, messagesOf(messages).previewFailed);
  } finally {
    if (mine === seq) previewLoading.value = false;
  }
};

/** 立即算一次，之后草稿每次变化去抖重算。只在桌面运行时查；装过就不再装。 */
const watchDraft = (draft: Ref<AiTask>) => {
  if (!isDesktop() || watching) return;
  watching = true;
  let timer: ReturnType<typeof setTimeout> | undefined;
  // 换了 AI 或勾了「我已订阅」：预算变了，`.md` 的估算跟着重算。
  watch(
    () => `${taskSnapshot(draft.value)}|${tokenBudget.value}`,
    () => {
      clearTimeout(timer);
      timer = setTimeout(() => void loadPreview(draft.value), DEBOUNCE_MS);
    },
  );
  void loadPreview(draft.value);
};

export function useAiTaskPreview() {
  return { preview, previewLoading, previewError, loadPreview, watchDraft };
}
