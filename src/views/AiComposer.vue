<script setup lang="ts">
/**
 * 交给 AI —— 左流右结：左边是做事的流程，右边是粘住的结账栏。
 *
 *   左列（从上到下）：任务名 + 四个入口胶囊 → 包裹区（六块类别砖，点一下带/不带）
 *   → 分析对象（默认收起的折叠段）→ 问题区 → 方向与背景 → 附件与选项（折叠）。
 *   右列：sticky 的交付卡（就绪度、交给谁、订阅档、主按钮），主按钮永远不滚出视线。
 *   页面下方：训练计划（贴回 AI 的回复 → 检查 → 发到手表）。
 *
 * 关系网已经退役（2026-10-04 重做）：力导向布局位置不定、必须靠六色区分节点，
 * 是这个页面「乱」和「艳」的根因。包裹区用固定网格 + 水面填充代替它。
 *
 * 本组件只做编排：状态归 useAiTaskDraft / useAiTaskLibrary / useAiTaskPreview /
 * useAiTaskHandoff 四个 composable，纯逻辑归 src/lib/aiTask/*。
 */
import { computed, onMounted, ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import '../styles/ai-task.css';
import Icon from '../components/Icon.vue';
import AiTaskHeader from '../components/ai/AiTaskHeader.vue';
import PackageZone from '../components/ai/PackageZone.vue';
import WorkoutPicker from '../components/ai/WorkoutPicker.vue';
import DirectionPanel from '../components/ai/DirectionPanel.vue';
import TaskExtras from '../components/ai/TaskExtras.vue';
import HandoffPanel from '../components/ai/HandoffPanel.vue';
import AiAskStart from '../components/ai/AiAskStart.vue';
import AiQuestionBar from '../components/ai/AiQuestionBar.vue';
import TrainingPlanSection from '../components/plan/TrainingPlanSection.vue';
import { useAiTaskDraft } from '../composables/useAiTaskDraft';
import { useAiTaskLibrary } from '../composables/useAiTaskLibrary';
import { useAiTaskPreview } from '../composables/useAiTaskPreview';
import { useSyncController } from '../composables/useSyncController';
import { useTrainingPlan } from '../composables/useTrainingPlan';
import type { AiTaskTemplate } from '../lib/bridge/types';
import { categoryLabel } from '../lib/aiTask/categories';
import { directionText } from '../lib/aiTask/prompt';
import { autoTaskTitle, recentWindowDays } from '../lib/aiTask/title';
import { displayableWorkouts, workoutDisplayLabel } from '../lib/workouts';
import { defineMessages, useMessages } from '../i18n';

defineOptions({ name: 'AiComposer' });

const t = useMessages(defineMessages(
  {
    andMore: (count: number) => `等 ${count} 次`,
    targetFold: '分析哪次运动',
    targetRecent: (days: number) => `没选运动 · 分析最近 ${days} 天`,
    targetPicked: (count: number) => `已选 ${count} 次运动`,
    questionTitle: '你想问什么',
    extrasFold: '附件与选项',
    extrasNone: '没有附件 · 默认选项',
    extrasFiles: (count: number) => `${count} 个附件`,
    undoAdded: (name: string) => `已加入「${name}」`,
    undoRemoved: (name: string) => `已移出「${name}」`,
    undoPicked: (name: string) => `已选「${name}」`,
    undoUnpicked: (name: string) => `已取消「${name}」`,
    undoDirection: '已换分析方向',
    'ui.ai_task.metric_exclusions_dropped': '旧版任务里按单个指标的排除已自动去掉：现在按类别整类带或不带',
    dismiss: '知道了',
    planFold: '收到 AI 的计划？贴回来',
    planIdle: '还没有贴回的计划',
    planReview: '有计划在等你检查',
    planSent: '之前发过计划到手表',
  },
  {
    andMore: (count: number) => `and ${count - 1} more`,
    targetFold: 'Which workouts',
    targetRecent: (days: number) => `None picked · the last ${days} days`,
    targetPicked: (count: number) => `${count} workout(s) picked`,
    questionTitle: 'What to ask',
    extrasFold: 'Attachments and options',
    extrasNone: 'No attachments · default options',
    extrasFiles: (count: number) => (count === 1 ? '1 attachment' : `${count} attachments`),
    undoAdded: (name: string) => `Added “${name}”`,
    undoRemoved: (name: string) => `Removed “${name}”`,
    undoPicked: (name: string) => `Picked “${name}”`,
    undoUnpicked: (name: string) => `Unpicked “${name}”`,
    undoDirection: 'Direction changed',
    'ui.ai_task.metric_exclusions_dropped': 'Per-metric exclusions saved by the old version were dropped: each category now goes as a whole or not at all',
    dismiss: 'Got it',
    planFold: 'Got a plan from the AI? Paste it back',
    planIdle: 'No plan pasted back yet',
    planReview: 'A plan is waiting for your review',
    planSent: 'A plan was sent to the watch before',
  },
  {
    andMore: (count: number) => `y ${count} más`,
    targetFold: 'Qué entrenamientos',
    targetRecent: (days: number) => `Sin elegir · los últimos ${days} días`,
    targetPicked: (count: number) => `${count} entrenamiento(s) elegido(s)`,
    questionTitle: 'Qué preguntar',
    extrasFold: 'Adjuntos y opciones',
    extrasNone: 'Sin adjuntos · opciones por defecto',
    extrasFiles: (count: number) => `${count} adjuntos`,
    undoAdded: (name: string) => `Se añadió «${name}»`,
    undoRemoved: (name: string) => `Se quitó «${name}»`,
    undoPicked: (name: string) => `Se eligió «${name}»`,
    undoUnpicked: (name: string) => `Se deseleccionó «${name}»`,
    undoDirection: 'Enfoque cambiado',
    'ui.ai_task.metric_exclusions_dropped': 'Se quitaron las exclusiones por métrica guardadas por la versión anterior: cada categoría va entera o no va',
    dismiss: 'Entendido',
    planFold: '¿La IA te dio un plan? Pégalo aquí',
    planIdle: 'Aún no has pegado ningún plan',
    planReview: 'Hay un plan esperando tu revisión',
    planSent: 'Ya enviaste un plan al reloj',
  },
  'views/AiComposer',
));

const route = useRoute();
const draftCtl = useAiTaskDraft();
const library = useAiTaskLibrary();
const previewCtl = useAiTaskPreview();

const { draft, canUndo, lastChange, legacyNotice } = draftCtl;
const { templates, recentWorkouts } = library;
const { preview, previewError } = previewCtl;

const workoutChoices = computed(() => displayableWorkouts(recentWorkouts.value));
const selectedWorkouts = computed(() =>
  workoutChoices.value.filter((workout) => draft.value.workout_ids.includes(workout.workout_id)));
const recentDays = computed(() => recentWindowDays(draft.value));

/* 入口动作：带上方向和推荐范围后，光标落到问题区。 */
const questionRef = ref<InstanceType<typeof AiQuestionBar> | null>(null);
const askRef = ref<InstanceType<typeof AiAskStart> | null>(null);
const focusQuestion = () => { window.setTimeout(() => questionRef.value?.focus(), 120); };
const applyTemplate = (template: AiTaskTemplate) => {
  draftCtl.setTemplate(template);
  focusQuestion();
};

/* 分析对象折叠段：默认收起；点了「分析一次运动」、或已经选过运动（旧任务）时展开。 */
const workoutOpen = ref(false);
const pickWorkout = () => { workoutOpen.value = true; };
watch(() => draft.value.id, () => { workoutOpen.value = draft.value.workout_ids.length > 0; }, { immediate: true });
const targetSummary = computed(() =>
  selectedWorkouts.value.length ? t.value.targetPicked(selectedWorkouts.value.length) : t.value.targetRecent(recentDays.value));

/* 附件折叠段摘要。 */
const extrasOpen = ref(false);
const extrasSummary = computed(() =>
  draft.value.attachments.length ? t.value.extrasFiles(draft.value.attachments.length) : t.value.extrasNone);

/* 训练计划折叠段（页面最下方）：摘要一行说清现状；AI 的计划贴回来、
   审阅卡一出现就自己展开，别让人不知道下面在等。 */
const planCtl = useTrainingPlan();
const planOpen = ref(false);
const planSummary = computed(() => {
  if (planCtl.preview.value) return t.value.planReview;
  const state = planCtl.state.value;
  if (state?.last_publish || state?.sent.length) return t.value.planSent;
  return t.value.planIdle;
});
watch(planCtl.preview, (value) => { if (value) planOpen.value = true; });

/* 撤销胶囊里那一句：刚才改了什么。 */
const undoHint = computed(() => {
  const change = lastChange.value;
  if (!change) return null;
  if (change.kind === 'category' && change.category) {
    const name = categoryLabel(change.category);
    return change.included ? t.value.undoAdded(name) : t.value.undoRemoved(name);
  }
  if (change.kind === 'workout') {
    const workout = workoutChoices.value.find((item) => item.workout_id === change.workoutId);
    const name = workout ? workoutDisplayLabel(workout) : '';
    return change.included ? t.value.undoPicked(name) : t.value.undoUnpicked(name);
  }
  return t.value.undoDirection;
});

const selectedTemplate = computed(() => templates.value.find((template) => template.id === draft.value.template_id) ?? null);
const direction = computed(() => directionText(selectedTemplate.value));
const fallbackTitle = computed(() => autoTaskTitle(draft.value, selectedWorkouts.value, selectedTemplate.value ? selectedTemplate.value.name : null));

/* —— 载入 —— */
previewCtl.watchDraft(draft);
/* 同步写进了新数据：运动列表和覆盖预览都重新取。以前人在这一页等同步，
   同步完了这里还是旧的，要切出去再切回来才会变。 */
const { dataRevision } = useSyncController();
watch(dataRevision, () => {
  void library.loadRecentWorkouts();
  void previewCtl.loadPreview(draft.value);
});
onMounted(() => {
  void library.loadTemplates();
  void library.loadTaskList();
  void library.loadRecentWorkouts();
});
watch(
  () => route.query.task,
  (taskId) => {
    if (typeof taskId === 'string' && taskId && taskId !== draft.value.id) {
      void draftCtl.loadTask(taskId).catch(() => undefined);
    }
  },
  { immediate: true },
);
</script>

<template>
  <section class="page ai-page" aria-labelledby="ai-page-title">
    <div class="ai-grid">
      <div class="flow">
        <div class="flow-head">
          <AiTaskHeader :fallback-title="fallbackTitle" />
          <AiAskStart ref="askRef" :draft="draft" :preview="preview" :templates="templates"
            :workout-count="draft.workout_ids.length" @template="applyTemplate" @pick-workout="pickWorkout" @ask="focusQuestion"
            @all-days="draftCtl.setWindowDays" />
        </div>

        <!-- 旧任务里带着已退役的指标级排除：载入时已丢，这里说一句。 -->
        <p v-if="legacyNotice" class="ai-note warn legacy-note" role="status">
          <Icon name="info" :size="13" />
          <span class="legacy-text">{{ t['ui.ai_task.metric_exclusions_dropped'] }}</span>
          <button type="button" class="legacy-dismiss" @click="draftCtl.dismissLegacyNotice()">{{ t.dismiss }}</button>
        </p>

        <PackageZone :preview="preview" :can-undo="canUndo" :undo-hint="undoHint" :undo-seq="lastChange?.seq ?? 0"
          @undo="draftCtl.undo()" />

        <!-- 分析对象：默认收起的折叠段，摘要一行说清现状。 -->
        <section :class="['ai-card', 'fold', { 'is-open': workoutOpen }]">
          <button type="button" class="fold-head" :aria-expanded="workoutOpen" aria-controls="ai-fold-workouts"
            @click="workoutOpen = !workoutOpen">
            <span class="fold-copy">
              <span class="fold-title">{{ t.targetFold }}</span>
              <span v-if="!workoutOpen" class="fold-summary">{{ targetSummary }}</span>
            </span>
            <Icon name="chevron-down" :size="16" class="fold-chevron" />
          </button>
          <div id="ai-fold-workouts" class="fold-body" :inert="!workoutOpen || undefined">
            <div class="fold-inner">
              <WorkoutPicker :workouts="workoutChoices" :selected-ids="draft.workout_ids" :recent-days="recentDays"
                @toggle="draftCtl.toggleWorkout" />
            </div>
          </div>
        </section>

        <!-- 问题区：整页唯一写字的地方，模板选完光标就落在这里。 -->
        <section class="ai-card ask" aria-labelledby="ai-ask-title">
          <h2 id="ai-ask-title" class="ask-title">{{ t.questionTitle }}</h2>
          <AiQuestionBar ref="questionRef" />
        </section>

        <DirectionPanel :templates="templates" />

        <section :class="['ai-card', 'fold', { 'is-open': extrasOpen }]">
          <button type="button" class="fold-head" :aria-expanded="extrasOpen" aria-controls="ai-fold-extras"
            @click="extrasOpen = !extrasOpen">
            <span class="fold-copy">
              <span class="fold-title">{{ t.extrasFold }}</span>
              <span v-if="!extrasOpen" class="fold-summary">{{ extrasSummary }}</span>
            </span>
            <Icon name="chevron-down" :size="16" class="fold-chevron" />
          </button>
          <div id="ai-fold-extras" class="fold-body" :inert="!extrasOpen || undefined">
            <div class="fold-inner">
              <TaskExtras :preview="preview" />
            </div>
          </div>
        </section>
      </div>

      <!-- 结账栏：sticky，主按钮一直在视线里。 -->
      <aside class="rail">
        <HandoffPanel rail :preview="preview" :preview-error="previewError" :direction="direction"
          :fallback-title="fallbackTitle" :handover="askRef?.handover ?? null" />
      </aside>
    </div>

    <!-- 页面最下方：AI 回复了训练计划，贴回来检查再发到手表。 -->
    <section :class="['ai-card', 'fold', 'plan-fold', { 'is-open': planOpen }]">
      <button type="button" class="fold-head" :aria-expanded="planOpen" aria-controls="ai-fold-plan"
        @click="planOpen = !planOpen">
        <span class="fold-copy">
          <span class="fold-title">{{ t.planFold }}</span>
          <span v-if="!planOpen" class="fold-summary">{{ planSummary }}</span>
        </span>
        <Icon name="chevron-down" :size="16" class="fold-chevron" />
      </button>
      <div id="ai-fold-plan" class="fold-body" :inert="!planOpen || undefined">
        <div class="fold-inner">
          <TrainingPlanSection />
        </div>
      </div>
    </section>
  </section>
</template>

<style scoped>
/* 左流右结：左列是流程，右列粘住。 */
.ai-page { --rail-w: min(344px, 28vw); padding: 8px 20px 20px; }
.ai-grid { display: grid; grid-template-columns: minmax(0, 1fr) var(--rail-w); gap: 16px; align-items: start; }
.flow { display: grid; min-width: 0; gap: 14px; align-content: start; }
.flow-head { display: grid; gap: 10px; justify-items: start; }
.rail { position: sticky; top: 12px; min-width: 0; }

/* 折叠段：头是一行标题 + 摘要 + 箭头；体用 grid-rows 0fr→1fr 过渡，不用量高度。 */
.fold { padding: 0; }
.fold-head {
  display: flex; width: 100%; align-items: center; gap: 12px; padding: 13px 16px;
  border: 0; border-radius: inherit; background: transparent; color: inherit; text-align: left; cursor: pointer;
}
.fold-head:focus-visible { outline: 2px solid var(--focus); outline-offset: -2px; }
.fold-copy { display: flex; flex: 1; min-width: 0; align-items: baseline; gap: 10px; }
.fold-title { flex: 0 0 auto; color: var(--ink); font-size: var(--fs-md); font-weight: 650; }
.fold-summary { min-width: 0; overflow: hidden; color: var(--subtle); font-size: var(--fs-xs); text-overflow: ellipsis; white-space: nowrap; }
.fold-chevron { flex: 0 0 auto; color: var(--subtle); transition: rotate var(--dur-base) var(--ease-out); }
.fold.is-open .fold-chevron { rotate: 180deg; }
.fold-body { display: grid; grid-template-rows: 0fr; transition: grid-template-rows 360ms var(--ease-out); }
.fold.is-open .fold-body { grid-template-rows: 1fr; }
.fold-inner { min-height: 0; overflow: hidden; }
.fold-inner > :first-child { padding: 0 16px 16px; }

/* 问题区：标题小一号，输入面是主角。 */
.ask { display: grid; gap: 2px; }
.ask-title { margin: 0; color: var(--muted); font-size: var(--fs-xs); font-weight: 650; }

/* 旧任务提示：一行胶囊，可关掉。 */
.legacy-note { align-items: center; margin: 0; padding: 7px 8px 7px 12px; border-radius: 999px; background: var(--mat-glass); }
.legacy-text { flex: 1; min-width: 0; color: var(--ink); font-size: var(--fs-xs); }
.legacy-dismiss { flex: 0 0 auto; min-height: 26px; padding: 0 12px; border: 0; border-radius: 999px; background: transparent; color: var(--muted); font: inherit; font-size: var(--fs-xs); cursor: pointer; }
.legacy-dismiss:hover { background: var(--glass-press); color: var(--ink); }
.legacy-dismiss:focus-visible { outline: 2px solid var(--focus); outline-offset: 1px; }

/* 训练计划段：横跨整页宽，和上面的两列网格拉开一段。 */
.plan-fold { margin-top: 24px; }

@media (max-width: 1100px) {
  .ai-page { --rail-w: 100%; padding: 4px 12px 16px; }
  .ai-grid { grid-template-columns: minmax(0, 1fr); }
  .rail { position: static; }
}
@media (prefers-reduced-motion: reduce) {
  .fold-body, .fold-chevron { transition: none; }
}
</style>
