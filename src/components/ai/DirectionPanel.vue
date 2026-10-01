<script setup lang="ts">
/**
 * 第 ② 步：方向和问题。
 *
 * 模板 = 分析方向（全局框架，带推荐的数据范围）；问题 = 这次想重点问的。
 * 两者并存，最终提示词里方向在前、问题在后。
 *
 * 方向按目的分组平铺（日常状态 / 跑步训练 / 其他），一眼看完、一点就选——以前是一枚
 * 胶囊滚轮，里面只有三道跑步题，关心睡眠的人在这一步以为这是跑步软件。问题和个人
 * 背景是无硬框的玻璃输入面，随内容长高；下面的示例问题一点就填进去，并选上对应的方向。
 */
import { computed } from 'vue';
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
    hint: '方向定框架，问题定重点，一起交给 AI',
    directionLabel: '分析方向（模板）',
    noDirection: '不指定',
    directionHint: '选方向会顺带调好推荐范围，图谱里能看到变化，可撤销。',
    questionLabel: '你的问题',
    questionPlaceholder: '这次想重点问什么？例如：周三那次恢复跑的强度合适吗？',
    counter: (used: number, max: number) => `${used}/${max}`,
    noteLabel: '个人背景（可选）',
    notePlaceholder: '伤病史、目标、最近状态……会写进导出数据给 AI 参考。',
    examplesLabel: '试试这样问',
    example1: '最近睡得怎么样？有什么值得改的？',
    example2: '这周的训练量对我来说合适吗？',
    example3: '我的恢复在变好还是变差？',
    groupDaily: '日常状态',
    groupRun: '跑步训练',
    groupOther: '其他方向',
  },
  {
    title: 'Direction and question',
    hint: 'The direction sets the frame, the question sets the focus — both go to the AI',
    directionLabel: 'Analysis direction (template)',
    noDirection: 'None',
    directionHint: 'Picking a direction also applies its recommended data range — visible in the graph, undoable.',
    questionLabel: 'Your question',
    questionPlaceholder: 'What do you want to focus on? E.g. was Wednesday\'s recovery run the right intensity?',
    counter: (used: number, max: number) => `${used}/${max}`,
    noteLabel: 'Personal background (optional)',
    notePlaceholder: 'Injuries, goals, recent form… included in the export for the AI.',
    examplesLabel: 'Try asking',
    example1: 'How have I been sleeping lately, and what should I change?',
    example2: 'Was this week’s training load right for me?',
    example3: 'Is my recovery getting better or worse?',
    groupDaily: 'Everyday',
    groupRun: 'Running',
    groupOther: 'More',
  },
  {
    title: 'Enfoque y pregunta',
    hint: 'El enfoque da el marco y la pregunta el foco; van juntos a la IA',
    directionLabel: 'Enfoque del análisis (plantilla)',
    noDirection: 'Ninguno',
    directionHint: 'Elegir un enfoque ajusta el rango recomendado; el grafo muestra el cambio y se puede deshacer.',
    questionLabel: 'Tu pregunta',
    questionPlaceholder: '¿Qué quieres consultar? Ej.: ¿fue adecuada la intensidad de la carrera de recuperación del miércoles?',
    counter: (used: number, max: number) => `${used}/${max}`,
    noteLabel: 'Contexto personal (opcional)',
    notePlaceholder: 'Lesiones, metas, estado reciente… se incluirá en la exportación para la IA.',
    examplesLabel: 'Ejemplos de preguntas',
    example1: '¿Cómo he dormido últimamente y qué podría mejorar?',
    example2: '¿Fue adecuada mi carga de entrenamiento esta semana?',
    example3: '¿Mi recuperación está mejorando o empeorando?',
    groupDaily: 'Día a día',
    groupRun: 'Carrera',
    groupOther: 'Más',
  },
  'components/ai/DirectionPanel',
));

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

    <div class="ai-field">
      <label class="ai-field-label" for="ai-question">{{ t.questionLabel }}</label>
      <textarea id="ai-question" class="ai-field-input" rows="2" :maxlength="AI_TASK_PROMPT_MAX" :value="draft.prompt"
        :placeholder="t.questionPlaceholder" @input="setPrompt(($event.target as HTMLTextAreaElement).value); grow($event)"></textarea>
      <span class="ai-field-count">{{ t.counter(draft.prompt.length, AI_TASK_PROMPT_MAX) }}</span>
    </div>
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
