<script setup lang="ts">
/**
 * 第 ② 步：方向和问题。
 *
 * 模板 = 分析方向（全局框架，带推荐的数据范围）；问题 = 这次想重点问的。
 * 两者并存，最终提示词里方向在前、问题在后。
 *
 * 方向用全应用同一种可拖动的胶囊（项多时换传送带），不再是一排点选的贴片；问题和个人
 * 背景是无硬框的玻璃输入面，随内容长高，下面给几条示例问题，一点就填进去。
 */
import { computed } from 'vue';
import type { AiTaskTemplate } from '../../lib/bridge/types';
import SegmentTrack from '../SegmentTrack.vue';
import CapsuleWheel from '../CapsuleWheel.vue';
import { AI_TASK_PROMPT_MAX } from '../../lib/aiTask/draft';
import { templateName, templatePromptSeed } from '../../lib/aiTask/prompt';
import { useAiTaskDraft } from '../../composables/useAiTaskDraft';
import { defineMessages, useMessages } from '../../i18n';

const props = defineProps<{ templates: AiTaskTemplate[] }>();

const { draft, setTemplate, setPrompt, setPersonalNote } = useAiTaskDraft();

const t = useMessages(defineMessages(
  {
    title: '方向和问题',
    hint: '方向定框架，问题定重点，两者会一起交给 AI',
    directionLabel: '分析方向（模板）',
    noDirection: '不指定',
    directionHint: '选方向会顺带调好推荐的数据范围，图谱里能看到变化，可以撤销。',
    questionLabel: '你的问题',
    questionPlaceholder: '这次想重点问什么？例如：周三那次恢复跑的强度合适吗？',
    counter: (used: number, max: number) => `${used}/${max}`,
    noteLabel: '个人背景（可选）',
    notePlaceholder: '伤病史、目标、最近的状态……会写进导出数据里给 AI 参考。',
    examplesLabel: '试试这样问',
    example1: '最近睡得怎么样？有什么值得改的？',
    example2: '这周的训练量对我来说合适吗？',
    example3: '我的恢复在变好还是变差？',
  },
  {
    title: 'Direction and question',
    hint: 'The direction sets the frame, the question sets the focus — both go to the AI',
    directionLabel: 'Analysis direction (template)',
    noDirection: 'None',
    directionHint: 'Picking a direction also applies its recommended data range — you will see it in the graph, and can undo it.',
    questionLabel: 'Your question',
    questionPlaceholder: 'What do you want to focus on? E.g. was Wednesday\'s recovery run the right intensity?',
    counter: (used: number, max: number) => `${used}/${max}`,
    noteLabel: 'Personal background (optional)',
    notePlaceholder: 'Injuries, goals, recent form… included in the export for the AI.',
    examplesLabel: 'Try asking',
    example1: 'How have I been sleeping lately, and what should I change?',
    example2: 'Was this week’s training load right for me?',
    example3: 'Is my recovery getting better or worse?',
  },
  {
    title: 'Enfoque y pregunta',
    hint: 'El enfoque da el marco y la pregunta el foco; ambos van a la IA',
    directionLabel: 'Enfoque del análisis (plantilla)',
    noDirection: 'Ninguno',
    questionLabel: 'Tu pregunta',
    noteLabel: 'Contexto personal (opcional)',
    examplesLabel: 'Prueba a preguntar',
    example1: '¿Qué tal he dormido últimamente y qué debería cambiar?',
    example2: '¿La carga de entrenamiento de esta semana fue adecuada para mí?',
    example3: '¿Mi recuperación va a mejor o a peor?',
  },
  'components/ai/DirectionPanel',
));

/* 方向：「不指定」+ 各模板。五项以内用分段胶囊（可拖动），更多换传送带。 */
const NONE = '__none__';
const directionItems = computed(() => [
  { value: NONE, label: t.value.noDirection },
  ...props.templates.map((template) => ({ value: template.id, label: templateName(template) })),
]);
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
const examples = computed(() => [t.value.example1, t.value.example2, t.value.example3]);
</script>

<template>
  <section class="ai-card" aria-labelledby="ai-step-direction">
    <div class="ai-step-head">
      <span class="ai-step-no">2</span>
      <h2 id="ai-step-direction" class="ai-step-title">{{ t.title }}</h2>
    </div>
    <p class="ai-step-hint">{{ t.hint }}</p>

    <p class="ai-label">{{ t.directionLabel }}</p>
    <SegmentTrack v-if="directionItems.length <= 5" class="direction-track" :items="directionItems" :model-value="activeDirection"
      :aria-label="t.directionLabel" @update:model-value="pickDirection" />
    <CapsuleWheel v-else loop :span="260" :items="directionItems" :model-value="activeDirection"
      :aria-label="t.directionLabel" @update:model-value="pickDirection" />
    <p class="ai-hint">{{ activeSeed || t.directionHint }}</p>

    <div class="ai-field">
      <label class="ai-field-label" for="ai-question">{{ t.questionLabel }}</label>
      <textarea id="ai-question" class="ai-field-input" rows="2" :maxlength="AI_TASK_PROMPT_MAX" :value="draft.prompt"
        :placeholder="t.questionPlaceholder" @input="setPrompt(($event.target as HTMLTextAreaElement).value); grow($event)"></textarea>
      <span class="ai-field-count">{{ t.counter(draft.prompt.length, AI_TASK_PROMPT_MAX) }}</span>
    </div>
    <div v-if="!draft.prompt.trim()" class="examples" :aria-label="t.examplesLabel">
      <span class="examples-label">{{ t.examplesLabel }}</span>
      <button v-for="example in examples" :key="example" type="button" class="example" @click="setPrompt(example)">{{ example }}</button>
    </div>

    <div class="ai-field">
      <label class="ai-field-label" for="ai-note">{{ t.noteLabel }}</label>
      <textarea id="ai-note" class="ai-field-input" rows="2" :value="draft.personal_note" :placeholder="t.notePlaceholder"
        @input="setPersonalNote(($event.target as HTMLTextAreaElement).value); grow($event)"></textarea>
    </div>
  </section>
</template>

<style scoped>
.direction-track { max-width: 100%; }
.examples { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; margin: 8px 2px 0; }
.examples-label { color: var(--subtle); font-size: var(--fs-2xs); }
.example { padding: 5px 11px; border: 0; border-radius: 999px; background: color-mix(in srgb, var(--ink) 6%, transparent); color: var(--muted);
  font: inherit; font-size: var(--fs-xs); cursor: pointer; transition: background var(--dur-fast) ease, color var(--dur-fast) ease; }
.example:hover { background: color-mix(in srgb, var(--accent) 16%, transparent); color: var(--ink); }
</style>
