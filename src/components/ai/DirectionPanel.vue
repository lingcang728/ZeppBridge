<script setup lang="ts">
/**
 * 第 ② 步：方向和个人背景。
 *
 * 模板 = 分析方向（全局框架，带推荐的数据范围）；问题 = 这次想重点问的。
 * 两者并存，最终提示词里方向在前、问题在后。问题输入框已经搬到舞台底部的对话条
 * （AiQuestionBar，挨着主按钮），这里只留方向、示例问题和个人背景。
 *
 * 方向按目的分组平铺（日常状态 / 跑步训练 / 其他），一眼看完、一点就选——以前是一枚
 * 胶囊滚轮，里面只有三道跑步题，关心睡眠的人在这一步以为这是跑步软件。个人背景是
 * 无硬框的玻璃输入面，随内容长高；示例问题一点就填进对话条，并选上对应的方向。
 */
import { computed } from 'vue';
import type { AiTaskTemplate } from '../../lib/bridge/types';
import { templateName, templatePromptSeed } from '../../lib/aiTask/prompt';
import { useAiTaskDraft } from '../../composables/useAiTaskDraft';
import { useMessages } from '../../i18n';
import { directionMessages } from './DirectionPanel.i18n';

const props = defineProps<{ templates: AiTaskTemplate[] }>();

const { draft, setTemplate, setPrompt, setPersonalNote } = useAiTaskDraft();

const t = useMessages(directionMessages);

/* 方向：「不指定」+ 按目的分组的各模板。内置模板按 id 归组，用户自存的和不认识的归「其他」。 */
const NONE = '__none__';
const DAILY_IDS = ['sleep_review', 'recovery_trend', 'week_review'];
const RUN_IDS = ['recovery_run', 'long_run_compare', 'hr_drift'];
const directionGroups = computed(() => {
  const item = (template: AiTaskTemplate) => ({ value: template.id, label: templateName(template) });
  const pick = (ids: string[]) => ids.flatMap((id) => props.templates.filter((template) => template.id === id)).map(item);
  const known = new Set([...DAILY_IDS, ...RUN_IDS]);
  return [
    { key: 'daily', label: t.value.groupDaily, items: pick(DAILY_IDS) },
    { key: 'run', label: t.value.groupRun, items: pick(RUN_IDS) },
    { key: 'other', label: t.value.groupOther, items: props.templates.filter((template) => !known.has(template.id)).map(item) },
  ].filter((group) => group.items.length);
});
const activeDirection = computed(() => draft.value.template_id ?? NONE);
const activeSeed = computed(() => {
  const template = props.templates.find((entry) => entry.id === draft.value.template_id);
  return template ? templatePromptSeed(template) : '';
});
const pickDirection = (value: string | number) => {
  setTemplate(value === NONE ? null : props.templates.find((template) => template.id === value) ?? null);
};

/* 文本框随内容长高：不用去拖右下角的小三角。 */
const grow = (event: Event) => {
  const box = event.target as HTMLTextAreaElement;
  box.style.height = 'auto';
  box.style.height = `${box.scrollHeight}px`;
};
/* 示例问题各对应一个方向：点「最近睡得怎么样」就顺带选上「最近睡眠」和它推荐的数据范围。 */
const examples = computed(() => [
  { text: t.value.example1, template: 'sleep_review' },
  { text: t.value.example2, template: 'week_review' },
  { text: t.value.example3, template: 'recovery_trend' },
]);
const useExample = (example: { text: string; template: string }) => {
  const template = props.templates.find((entry) => entry.id === example.template);
  if (template && !draft.value.template_id) setTemplate(template);
  setPrompt(example.text);
};
</script>

<template>
  <section class="ai-card" aria-labelledby="ai-step-direction">
    <div class="ai-step-head">
      <span class="ai-step-no">2</span>
      <h2 id="ai-step-direction" class="ai-step-title">{{ t.title }}</h2>
    </div>
    <p class="ai-step-hint">{{ t.hint }}</p>

    <p class="ai-label">{{ t.directionLabel }}</p>
    <div class="direction-groups" role="radiogroup" :aria-label="t.directionLabel">
      <button type="button" role="radio" :aria-checked="activeDirection === NONE" :class="['dir-chip', { on: activeDirection === NONE }]"
        @click="pickDirection(NONE)">{{ t.noDirection }}</button>
      <div v-for="group in directionGroups" :key="group.key" class="dir-group">
        <span class="dir-group-label">{{ group.label }}</span>
        <button v-for="entry in group.items" :key="entry.value" type="button" role="radio" :aria-checked="activeDirection === entry.value"
          :class="['dir-chip', { on: activeDirection === entry.value }]" @click="pickDirection(entry.value)">{{ entry.label }}</button>
      </div>
    </div>
    <p class="ai-hint">{{ activeSeed || t.directionHint }}</p>

    <div v-if="!draft.prompt.trim()" class="examples" :aria-label="t.examplesLabel">
      <span class="examples-label">{{ t.examplesLabel }}</span>
      <button v-for="example in examples" :key="example.text" type="button" class="example" @click="useExample(example)">{{ example.text }}</button>
    </div>

    <div class="ai-field">
      <label class="ai-field-label" for="ai-note">{{ t.noteLabel }}</label>
      <textarea id="ai-note" class="ai-field-input" rows="2" :value="draft.personal_note" :placeholder="t.notePlaceholder"
        @input="setPersonalNote(($event.target as HTMLTextAreaElement).value); grow($event)"></textarea>
    </div>
  </section>
</template>

<style scoped>
.direction-groups { display: grid; gap: 8px; }
.direction-groups > .dir-chip { justify-self: start; }
.dir-group { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; }
.dir-group-label { flex: 0 0 100%; color: var(--subtle); font-size: var(--fs-2xs); }
.dir-chip { min-height: 32px; padding: 5px 13px; border: 1px solid transparent; border-radius: 999px; background: color-mix(in srgb, var(--ink) 6%, transparent);
  color: var(--muted); font: inherit; font-size: var(--fs-xs); cursor: pointer; transition: background var(--dur-fast) ease, color var(--dur-fast) ease; }
.dir-chip:hover { background: color-mix(in srgb, var(--ink) 10%, transparent); color: var(--ink); }
.dir-chip.on { background: color-mix(in srgb, var(--accent) 16%, transparent); color: var(--ink); font-weight: 600; }
.dir-chip:focus-visible { outline: 2px solid var(--focus); outline-offset: 2px; }
.examples { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; margin: 8px 2px 0; }
.examples-label { color: var(--subtle); font-size: var(--fs-2xs); }
.example { padding: 5px 11px; border: 0; border-radius: 999px; background: color-mix(in srgb, var(--ink) 6%, transparent); color: var(--muted);
  font: inherit; font-size: var(--fs-xs); cursor: pointer; transition: background var(--dur-fast) ease, color var(--dur-fast) ease; }
.example:hover { background: color-mix(in srgb, var(--accent) 16%, transparent); color: var(--ink); }
</style>
