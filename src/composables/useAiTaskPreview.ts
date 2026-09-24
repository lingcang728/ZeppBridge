/**
 * 草稿的覆盖预览（`ai_task_preview`）：关系网的覆盖弧、覆盖速览、交付区的
 * 明细都读同一份结果。
 *
 * 页面建一个实例，通过 props 往下传——只有一个地方发请求，组件之间不
 * 互相找状态。`watchDraft` 给草稿变化加 600ms 去抖：打字、拖节点都会
 * 连续改草稿，没必要每一下都查库。
 */
import { onBeforeUnmount, ref, watch, type Ref } from 'vue';
import { backend, isDesktop, toUserMessage } from '../lib/bridge';
import type { AiTask, AiTaskPreview } from '../lib/bridge/types';
import { taskSnapshot } from '../lib/aiTask/draft';
import { defineMessages, messagesOf } from '../i18n';

const messages = defineMessages(
  { previewFailed: '预览生成失败' },
  { previewFailed: 'Could not build the preview' },
  { previewFailed: 'No se pudo generar la vista previa' },
  'composables/useAiTaskPreview',
);

const DEBOUNCE_MS = 600;

export function useAiTaskPreview() {
  const preview = ref<AiTaskPreview | null>(null);
  const previewLoading = ref(false);
  const previewError = ref<string | null>(null);
  let seq = 0;

  const loadPreview = async (task: AiTask) => {
    const mine = ++seq;
    previewLoading.value = true;
    previewError.value = null;
    try {
      const result = await backend.aiTaskPreview(task);
      if (mine === seq) preview.value = result;
    } catch (error) {
      if (mine === seq) previewError.value = toUserMessage(error, messagesOf(messages).previewFailed);
    } finally {
      if (mine === seq) previewLoading.value = false;
    }
  };

  /** 立即算一次，之后草稿每次变化去抖重算。只在桌面运行时查。 */
  const watchDraft = (draft: Ref<AiTask>) => {
    if (!isDesktop()) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    watch(
      () => taskSnapshot(draft.value),
      () => {
        clearTimeout(timer);
        timer = setTimeout(() => void loadPreview(draft.value), DEBOUNCE_MS);
      },
    );
    onBeforeUnmount(() => clearTimeout(timer));
    void loadPreview(draft.value);
  };

  return { preview, previewLoading, previewError, loadPreview, watchDraft };
}
