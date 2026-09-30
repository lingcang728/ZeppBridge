<script setup lang="ts">
/**
 * 交给 AI —— 一块舞台，三层浮在上面的玻璃。
 *
 *   舞台：关系网（TaskGraph）铺满整页。中心是分析对象（某次运动或「最近 N 天」），
 *         圈内外就是交不交给 AI，展开的类别镜头俯冲进去看逐指标排除。
 *   左上：任务名胶囊（改名、切换已保存的任务、新建、保存）。
 *   右侧：步骤栏，一次只展开一步 —— ① 分析对象 ② 你想问什么 ③ 附件与选项；
 *         收起的步骤只露一行摘要，不用滚动就能看清整个任务。
 *   底部：交付坞，整页唯一的主按钮「交给 ChatGPT」。
 *
 * 本组件只做编排：状态归 useAiTaskDraft / useAiTaskLibrary / useAiTaskPreview /
 * useAiTaskHandoff 四个 composable，纯逻辑归 src/lib/aiTask/*。
 */
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import '../styles/ai-task.css';
import AiTaskHeader from '../components/ai/AiTaskHeader.vue';
import TaskGraph from '../components/ai/TaskGraph.vue';
import WorkoutPicker from '../components/ai/WorkoutPicker.vue';
import DirectionPanel from '../components/ai/DirectionPanel.vue';
import TaskExtras from '../components/ai/TaskExtras.vue';
import HandoffPanel from '../components/ai/HandoffPanel.vue';
import AiStepRail, { type RailStep } from '../components/ai/AiStepRail.vue';
import AiAskStart from '../components/ai/AiAskStart.vue';
import SegmentTrack from '../components/SegmentTrack.vue';
import { useAiTaskDraft } from '../composables/useAiTaskDraft';
import { useAiTaskLibrary } from '../composables/useAiTaskLibrary';
import { useAiTaskPreview } from '../composables/useAiTaskPreview';
import { useSyncController } from '../composables/useSyncController';
import type { AiTaskCategory, AiTaskTemplate } from '../lib/bridge/types';
import { buildGraph } from '../lib/aiTask/graph/model';
import { categoryLabel } from '../lib/aiTask/categories';
import { metricLabel } from '../lib/aiTask/metrics';
import { directionText } from '../lib/aiTask/prompt';
import { autoTaskTitle, recentWindowDays } from '../lib/aiTask/title';
import { displayableWorkouts, workoutDisplayLabel } from '../lib/workouts';
import { formatDate } from '../lib/format';
import { defineMessages, useMessages } from '../i18n';

defineOptions({ name: 'AiComposer' });

const t = useMessages(defineMessages(
  {
    daysOption: (days: number) => `${days} 天`,
    recentDays: (days: number) => `最近 ${days} 天`,
    andMore: (count: number) => `等 ${count} 次`,
    stepTarget: '分析对象',
    stepAsk: '你想问什么',
    stepExtras: '附件与选项',
    targetRecent: (days: number) => `没选运动 · 分析最近 ${days} 天`,
    askEmpty: '还没写问题 · 只选方向也可以',
    askTemplate: (name: string) => `方向：${name}`,
    extrasNone: '没有附件 · 默认选项',
    extrasFiles: (count: number) => `${count} 个附件`,
    undoAdded: (name: string) => `已加入「${name}」`,
    undoRemoved: (name: string) => `已移出「${name}」`,
    undoKept: (name: string) => `已保留「${name}」`,
    undoExcluded: (name: string) => `已排除「${name}」`,
    undoPicked: (name: string) => `已选「${name}」`,
    undoUnpicked: (name: string) => `已取消「${name}」`,
    undoDirection: '已换分析方向',
    viewAria: '视图',
    viewAsk: '先问问题',
    viewGraph: '图谱',
    graphCoverage: (have: number, total: number) => `${have}/${total} 天有数据`,
  },
  {
    daysOption: (days: number) => `${days} days`,
    recentDays: (days: number) => `Last ${days} days`,
    andMore: (count: number) => `and ${count - 1} more`,
    stepTarget: 'What to analyse',
    stepAsk: 'What to ask',
    stepExtras: 'Attachments and options',
    targetRecent: (days: number) => `No workout picked · the last ${days} days`,
    askEmpty: 'No question yet · a direction alone is fine',
    askTemplate: (name: string) => `Direction: ${name}`,
    extrasNone: 'No attachments · default options',
    extrasFiles: (count: number) => (count === 1 ? '1 attachment' : `${count} attachments`),
    undoAdded: (name: string) => `Added “${name}”`,
    undoRemoved: (name: string) => `Removed “${name}”`,
    undoKept: (name: string) => `Kept “${name}”`,
    undoExcluded: (name: string) => `Excluded “${name}”`,
    undoPicked: (name: string) => `Picked “${name}”`,
    undoUnpicked: (name: string) => `Unpicked “${name}”`,
    undoDirection: 'Direction changed',
    viewAria: 'View',
    viewAsk: 'Ask first',
    viewGraph: 'Graph',
    graphCoverage: (have: number, total: number) => `${have}/${total} days with data`,
  },
  {
    daysOption: (days: number) => `${days} días`,
    recentDays: (days: number) => `Últimos ${days} días`,
    andMore: (count: number) => `y ${count} más`,
    stepTarget: 'Qué analizar',
    stepAsk: 'Qué preguntar',
    stepExtras: 'Adjuntos y opciones',
    targetRecent: (days: number) => `Sin entrenamiento · los últimos ${days} días`,
    askEmpty: 'Sin pregunta aún · solo un enfoque también vale',
    askTemplate: (name: string) => `Enfoque: ${name}`,
    extrasNone: 'Sin adjuntos · opciones por defecto',
    extrasFiles: (count: number) => `${count} adjuntos`,
    undoAdded: (name: string) => `Se añadió «${name}»`,
    undoRemoved: (name: string) => `Se quitó «${name}»`,
    undoKept: (name: string) => `Se conservó «${name}»`,
    undoExcluded: (name: string) => `Se excluyó «${name}»`,
    undoPicked: (name: string) => `Se eligió «${name}»`,
    undoUnpicked: (name: string) => `Se deseleccionó «${name}»`,
    undoDirection: 'Enfoque cambiado',
    viewAria: 'Vista',
    viewAsk: 'Preguntar primero',
    viewGraph: 'Grafo',
    graphCoverage: (have: number, total: number) => `${have}/${total} días con datos`,
  },
  'views/AiComposer',
));

const route = useRoute();
const draftCtl = useAiTaskDraft();
const library = useAiTaskLibrary();
const previewCtl = useAiTaskPreview();

const { draft, canUndo, lastChange } = draftCtl;
const { templates, recentWorkouts } = library;
const { preview, previewError } = previewCtl;

/* —— 关系网 —— */
const expanded = reactive(new Set<AiTaskCategory>());
const toggleExpand = (category: AiTaskCategory) => {
  if (expanded.has(category)) expanded.delete(category);
  else expanded.add(category);
};

const workoutChoices = computed(() => displayableWorkouts(recentWorkouts.value));
const selectedWorkouts = computed(() =>
  workoutChoices.value.filter((workout) => draft.value.workout_ids.includes(workout.workout_id)));

/** 中心节点：选了运动就是那次运动，没选就是「最近 N 天」。 */
const center = computed(() => {
  const [first] = [...selectedWorkouts.value].sort((a, b) => a.start_time.localeCompare(b.start_time));
  if (first) {
    const extra = selectedWorkouts.value.length > 1 ? ` ${t.value.andMore(selectedWorkouts.value.length)}` : '';
    return {
      label: `${workoutDisplayLabel(first)}${extra}`,
      sublabel: formatDate(first.start_time, 'long'),
      icon: 'run' as const,
    };
  }
  return { label: t.value.recentDays(recentWindowDays(draft.value)), sublabel: null, icon: 'clock' as const };
});

const graphModel = computed(() =>
  buildGraph({
    task: draft.value,
    preview: preview.value,
    expanded,
    centerLabel: center.value.label,
    centerSublabel: center.value.sublabel,
    centerIcon: center.value.icon,
    daysLabel: t.value.daysOption,
    coverageLabel: t.value.graphCoverage,
  }));

/* —— 视图（U06）：默认「先问问题」——四个入口 + 与图谱同步的清单；喜欢关系网的人切到「图谱」，记住选择。 —— */
type ComposerView = 'ask' | 'graph';
const VIEW_KEY = 'zeppbridge.ai.view';
const readView = (): ComposerView => {
  try {
    return window.localStorage.getItem(VIEW_KEY) === 'graph' ? 'graph' : 'ask';
  } catch {
    return 'ask';
  }
};
const view = ref<ComposerView>(readView());
watch(view, (value) => {
  try {
    window.localStorage.setItem(VIEW_KEY, value);
  } catch {
    // 记不住就算了。
  }
});
const viewItems = computed(() => [
  { value: 'ask' as const, label: t.value.viewAsk, icon: 'edit' as const },
  { value: 'graph' as const, label: t.value.viewGraph, icon: 'grid' as const },
]);
/* 入口动作：带上方向和推荐范围后，右边步骤栏跳到「你想问什么」，文本框拿到焦点。 */
const focusQuestion = () => {
  openStep.value = 'ask';
  window.setTimeout(() => document.getElementById('ai-question')?.focus(), 360);
};
const applyTemplate = (template: AiTaskTemplate) => {
  draftCtl.setTemplate(template);
  focusQuestion();
};
const pickWorkout = () => { openStep.value = 'target'; };

/* 撤销胶囊里那一句：刚才改了什么。 */
const undoHint = computed(() => {
  const change = lastChange.value;
  if (!change) return null;
  if (change.kind === 'category' && change.category) {
    const name = categoryLabel(change.category);
    return change.included ? t.value.undoAdded(name) : t.value.undoRemoved(name);
  }
  if (change.kind === 'metric' && change.metric) {
    const name = metricLabel(change.metric);
    return change.included ? t.value.undoKept(name) : t.value.undoExcluded(name);
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
const recentDays = computed(() => recentWindowDays(draft.value));

/* —— 右侧步骤栏：一次只展开一步；收起的步骤给一行摘要 —— */
const openStep = ref<string | null>('target');
const railSteps = computed<RailStep[]>(() => {
  const question = draft.value.prompt.trim();
  const files = draft.value.attachments.length;
  return [
    {
      id: 'target',
      title: t.value.stepTarget,
      summary: selectedWorkouts.value.length
        ? [center.value.label, center.value.sublabel].filter(Boolean).join(' · ')
        : t.value.targetRecent(recentDays.value),
      filled: selectedWorkouts.value.length > 0,
    },
    {
      id: 'ask',
      title: t.value.stepAsk,
      summary: question || (selectedTemplate.value ? t.value.askTemplate(selectedTemplate.value.name) : t.value.askEmpty),
      filled: Boolean(question || selectedTemplate.value),
    },
    {
      id: 'extras',
      title: t.value.stepExtras,
      summary: files ? t.value.extrasFiles(files) : t.value.extrasNone,
      filled: files > 0,
    },
  ];
});

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

/* 交付坞的实际高度：宽度不够时它折成两行，画布上的撤销 / 缩放要跟着往上让。 */
const dockRef = ref<{ $el?: Element } | null>(null);
const dockHeight = ref(0);
let dockObserver: ResizeObserver | null = null;
onMounted(() => {
  const el = dockRef.value?.$el;
  if (!(el instanceof Element) || typeof ResizeObserver === 'undefined') return;
  const measure = () => { dockHeight.value = Math.round(el.getBoundingClientRect().height); };
  measure();
  dockObserver = new ResizeObserver(measure);
  dockObserver.observe(el);
});
onBeforeUnmount(() => dockObserver?.disconnect());
</script>

<template>
  <section class="page ai-page" aria-labelledby="ai-page-title">
    <div class="stage" :style="dockHeight ? { '--dock-h': `${dockHeight}px` } : undefined">
      <div v-if="view === 'ask'" class="stage-graph stage-ask">
        <AiAskStart :draft="draft" :preview="preview" :templates="templates" :workout-count="draft.workout_ids.length"
          @template="applyTemplate" @pick-workout="pickWorkout" @ask="focusQuestion"
          @category="draftCtl.setCategoryEnabled" @days="draftCtl.setCategoryDays" @all-days="draftCtl.setWindowDays" />
      </div>
      <div v-else class="stage-graph">
        <TaskGraph :model="graphModel" :can-undo="canUndo" :undo-hint="undoHint" :undo-seq="lastChange?.seq ?? 0" @undo="draftCtl.undo()"
          @set-category="draftCtl.setCategoryEnabled"
          @set-metric="(category, metric, included) => draftCtl.setMetricExcluded(category, metric, !included)"
          @set-days="draftCtl.setCategoryDays" @set-include-day="draftCtl.setIncludeWorkoutDay"
          @toggle-expand="toggleExpand" />
      </div>

      <AiTaskHeader class="stage-head" :fallback-title="fallbackTitle" />
      <SegmentTrack class="stage-view" compact :items="viewItems" :model-value="view" :aria-label="t.viewAria"
        @update:model-value="(value) => view = value === 'graph' ? 'graph' : 'ask'" />

      <aside class="stage-rail glass-control">
        <AiStepRail v-model:open="openStep" :steps="railSteps">
          <template #target>
            <WorkoutPicker :workouts="workoutChoices" :selected-ids="draft.workout_ids" :recent-days="recentDays"
              @toggle="draftCtl.toggleWorkout" />
          </template>
          <template #ask><DirectionPanel :templates="templates" /></template>
          <template #extras><TaskExtras :preview="preview" /></template>
        </AiStepRail>
      </aside>

      <HandoffPanel ref="dockRef" class="stage-dock" :preview="preview" :preview-error="previewError" :direction="direction" :fallback-title="fallbackTitle" />
    </div>
  </section>
</template>

<style scoped>
/* 舞台贴满顶栏以下的整块视口；关系网在最底层，其余三块玻璃浮在上面。
   关系网的画布右边让出步骤栏的宽度，镜头中心才落在看得见的那一片正中。 */
.ai-page { --rail-w: min(420px, 34vw); padding: 4px 20px 20px; }
.stage {
  position: relative;
  height: calc(100vh - 84px);
  min-height: 560px;
  overflow: hidden;
  border-radius: var(--radius-xl);
  background:
    radial-gradient(80% 70% at 36% 48%, color-mix(in srgb, var(--accent) 8%, transparent), transparent 70%),
    var(--mat-card);
  box-shadow: var(--mat-rim), var(--mat-shadow-lift);
}
/* --graph-safe-*：画布四边被浮层挡住的宽度（上：任务名胶囊，下：交付坞和它上面那一排
   撤销 / 缩放胶囊）。关系网的节点弹层只摆在剩下看得见的那一块里，不会再被盖住半截。 */
.stage-graph { --graph-safe-top: 70px; position: absolute; inset: 0 calc(var(--rail-w) + 24px) 0 0; border-radius: inherit; }
.stage-head { position: absolute; top: 16px; left: 16px; z-index: 4; max-width: calc(100% - var(--rail-w) - 240px); }
.stage-view { position: absolute; top: 18px; right: calc(var(--rail-w) + 40px); z-index: 4; }
.stage-ask { overflow: hidden; }
.stage-rail {
  position: absolute;
  top: 12px;
  right: 12px;
  bottom: 12px;
  z-index: 4;
  width: var(--rail-w);
  overflow-y: auto;
  padding: 10px;
  border-radius: calc(var(--radius-xl) - 8px);
  overscroll-behavior: contain;
}
.stage-dock { position: absolute; right: calc(var(--rail-w) + 36px); bottom: 16px; left: 16px; z-index: 5; }
/* 关系网自己的撤销 / 缩放坞往上让出交付坞的高度；面包屑和提示让出左上角的任务名胶囊。
   交付坞的高度是量出来的（--dock-h）：窗口一窄它就折成两行，以前写死 92px，撤销和缩放
   正好被盖在下面、点不到。 */
.stage-graph { --graph-safe-bottom: calc(var(--dock-h, 64px) + 78px); }
.stage-graph :deep(.dock) { bottom: calc(var(--dock-h, 64px) + 28px); }
.stage-graph :deep(.hint), .stage-graph :deep(.crumb) { top: 72px; }

@media (max-width: 1100px) {
  .ai-page { --rail-w: 100%; padding: 4px 12px 16px; }
  .stage { height: auto; overflow: visible; background: none; box-shadow: none; }
  .stage-graph { position: relative; inset: auto; height: 62vh; min-height: 440px; border-radius: var(--radius-xl); background: var(--mat-card); box-shadow: var(--mat-rim), var(--mat-shadow); }
  .stage-head { top: 12px; left: 12px; max-width: calc(100% - 24px); }
  /* 窄窗口：视图开关在任务名那一行下面靠右，问题入口再往下让一行。 */
  .stage-view { top: 66px; right: 12px; }
  .stage-ask { height: auto; min-height: 0; }
  .stage-ask :deep(.ask-start) { padding-top: 112px; }
  .stage-rail { position: static; width: auto; margin-top: 12px; }
  .stage-dock { position: sticky; right: auto; bottom: 12px; left: auto; margin-top: 12px; }
  .stage-graph :deep(.dock) { bottom: 14px; }
  .stage-graph { --graph-safe-top: 64px; --graph-safe-bottom: 60px; }
}
/* 任务名胶囊在很窄时排成两行（见 AiTaskHeader），关系网的提示和面包屑再往下让一行。 */
@media (max-width: 480px) {
  .stage-graph { --graph-safe-top: 108px; }
  .stage-graph :deep(.hint), .stage-graph :deep(.crumb) { top: 114px; }
}
</style>
