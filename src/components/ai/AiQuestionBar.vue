<script setup lang="ts">
/**
 * 问题区：整页唯一写字的地方。玻璃输入面（ai-field），标题写在面里，
 * 字数淡淡地压在右下角；文本框随内容长高（最多四行），超出再滚。
 * 文案和方向面板共用一份（DirectionPanel.i18n）。
 */
import { nextTick, ref, watch } from 'vue';
import { AI_TASK_PROMPT_MAX } from '../../lib/aiTask/draft';
import { useAiTaskDraft } from '../../composables/useAiTaskDraft';
import { useMessages } from '../../i18n';
import { directionMessages } from './DirectionPanel.i18n';

const { draft, setPrompt } = useAiTaskDraft();
const t = useMessages(directionMessages);

const box = ref<HTMLTextAreaElement | null>(null);
const MAX_HEIGHT = 160;
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
  <div class="qfield">
    <label class="sr-only" for="ai-question">{{ t.questionLabel }}</label>
    <textarea id="ai-question" ref="box" rows="2" :maxlength="AI_TASK_PROMPT_MAX" :value="draft.prompt"
      :placeholder="t.questionPlaceholder" @input="onInput"></textarea>
    <span v-if="draft.prompt.length > AI_TASK_PROMPT_MAX * 0.8" class="count">{{ t.counter(draft.prompt.length, AI_TASK_PROMPT_MAX) }}</span>
  </div>
</template>

<style scoped>
/* 凹槽输入面：比卡片更暗 + 内阴影；聚焦时亮一圈中性焦点色。 */
.qfield {
  display: grid; gap: 2px; padding: 4px 12px 8px;
  border-radius: var(--radius-sm); background: var(--mat-inset); box-shadow: var(--mat-inset-shadow);
  transition: box-shadow var(--dur-fast) ease;
}
.qfield:focus-within { box-shadow: var(--mat-inset-shadow), 0 0 0 1.5px var(--focus); }
textarea {
  width: 100%; min-height: 3.2em; padding: 6px 0 2px; border: 0; outline: 0; resize: none; overflow-y: auto;
  background: transparent; color: var(--ink); font: inherit; font-size: var(--fs-md); line-height: 1.55;
}
textarea::placeholder { color: var(--subtle); }
.count { justify-self: end; color: var(--subtle); font-size: var(--fs-2xs); font-variant-numeric: tabular-nums; opacity: .7; }
</style>
