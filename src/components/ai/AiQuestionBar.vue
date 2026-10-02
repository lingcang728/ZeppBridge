<script setup lang="ts">
/**
 * 舞台底部的问题条：整页唯一写字的地方，紧挨着主按钮——像对话框的输入栏，
 * 写完问题，点旁边的「交给 ChatGPT」就走。
 *
 * 以前问题藏在右栏第二步的折叠里，还和方向、个人背景挤在一起；人要先找到它，
 * 再回到左下角去按交付。现在写字和交付在同一块视线里。
 *
 * 文本框随内容长高（最多四行），超出再滚；文案和方向面板共用一份（DirectionPanel.i18n）。
 */
import { nextTick, ref, watch } from 'vue';
import { AI_TASK_PROMPT_MAX } from '../../lib/aiTask/draft';
import { useAiTaskDraft } from '../../composables/useAiTaskDraft';
import { useMessages } from '../../i18n';
import { directionMessages } from './DirectionPanel.i18n';

const { draft, setPrompt } = useAiTaskDraft();
const t = useMessages(directionMessages);

const box = ref<HTMLTextAreaElement | null>(null);
const MAX_HEIGHT = 128;
const grow = () => {
  const el = box.value;
  if (!el) return;
  el.style.height = 'auto';
  el.style.height = `${Math.min(el.scrollHeight, MAX_HEIGHT)}px`;
};
const onInput = (event: Event) => {
  setPrompt((event.target as HTMLTextAreaElement).value);
  grow();
};
// 别处改了问题（示例问题、打开旧任务）：高度跟着内容走。
watch(() => draft.value.prompt, () => { void nextTick(grow); });

defineExpose({ focus: () => box.value?.focus() });
</script>

<template>
  <div class="qbar glass-control">
    <label class="sr-only" for="ai-question">{{ t.questionLabel }}</label>
    <textarea id="ai-question" ref="box" rows="1" :maxlength="AI_TASK_PROMPT_MAX" :value="draft.prompt"
      :placeholder="t.questionPlaceholder" @input="onInput"></textarea>
    <span v-if="draft.prompt.length > AI_TASK_PROMPT_MAX * 0.8" class="count">{{ t.counter(draft.prompt.length, AI_TASK_PROMPT_MAX) }}</span>
  </div>
</template>

<style scoped>
.qbar { display: flex; width: 100%; align-items: flex-end; gap: 10px; padding: 5px 16px 5px 8px; border-radius: 26px; }
textarea {
  flex: 1;
  min-width: 0;
  min-height: 46px;
  padding: 11px 10px;
  border: 0;
  outline: 0;
  resize: none;
  background: transparent;
  color: var(--ink);
  font: inherit;
  font-size: var(--fs-xl);
  line-height: 1.45;
}
textarea::placeholder { color: var(--subtle); }
.qbar:focus-within { box-shadow: var(--glass-rim), var(--glass-shadow), 0 0 0 2px var(--focus); }
.count { padding-bottom: 14px; color: var(--subtle); font-size: var(--fs-2xs); font-variant-numeric: tabular-nums; white-space: nowrap; }
</style>
