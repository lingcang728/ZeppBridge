<script setup lang="ts">
/**
 * 第 ② 步：方向和问题。
 *
 * 模板 = 分析方向（全局框架，带推荐的数据范围）；问题 = 这次想重点问的。
 * 两者并存，最终提示词里方向在前、问题在后——这一步把两者在视觉上分开：
 * 方向是一排可选的 chip，问题是用户自己写的文本框。
 */
import type { AiTaskTemplate } from '../../lib/bridge/types';
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
  },
  {
    title: 'Enfoque y pregunta',
    hint: 'El enfoque da el marco y la pregunta el foco; ambos van a la IA',
    directionLabel: 'Enfoque del análisis (plantilla)',
    noDirection: 'Ninguno',
    questionLabel: 'Tu pregunta',
    noteLabel: 'Contexto personal (opcional)',
  },
  'components/ai/DirectionPanel',
));

const isActive = (template: AiTaskTemplate | null) => (template?.id ?? null) === draft.value.template_id;
</script>

<template>
  <section class="ai-card" aria-labelledby="ai-step-direction">
    <div class="ai-step-head">
      <span class="ai-step-no">2</span>
      <h2 id="ai-step-direction" class="ai-step-title">{{ t.title }}</h2>
    </div>
    <p class="ai-step-hint">{{ t.hint }}</p>

    <p class="ai-label">{{ t.directionLabel }}</p>
    <div class="chips" role="radiogroup" :aria-label="t.directionLabel">
      <button type="button" role="radio" :aria-checked="isActive(null)" :class="['ai-chip', { 'is-on': isActive(null) }]"
        @click="setTemplate(null)">{{ t.noDirection }}</button>
      <button v-for="template in props.templates" :key="template.id" type="button" role="radio"
        :aria-checked="isActive(template)" :class="['ai-chip', { 'is-on': isActive(template) }]"
        :title="templatePromptSeed(template)" @click="setTemplate(template)">{{ templateName(template) }}</button>
    </div>
    <p class="ai-hint">{{ t.directionHint }}</p>

    <label class="ai-label" for="ai-question">{{ t.questionLabel }}</label>
    <textarea id="ai-question" class="ai-input" rows="3" :maxlength="AI_TASK_PROMPT_MAX" :value="draft.prompt"
      :placeholder="t.questionPlaceholder" @input="setPrompt(($event.target as HTMLTextAreaElement).value)"></textarea>
    <p class="ai-hint counter">{{ t.counter(draft.prompt.length, AI_TASK_PROMPT_MAX) }}</p>

    <label class="ai-label" for="ai-note">{{ t.noteLabel }}</label>
    <textarea id="ai-note" class="ai-input" rows="2" :value="draft.personal_note" :placeholder="t.notePlaceholder"
      @input="setPersonalNote(($event.target as HTMLTextAreaElement).value)"></textarea>
  </section>
</template>

<style scoped>
.chips { display: flex; flex-wrap: wrap; gap: 6px; }
.counter { text-align: right; }
</style>
