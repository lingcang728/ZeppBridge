<script setup lang="ts">
/**
 * 交给 AI —— 一页三步。
 *
 *   左：关系网（TaskGraph）。中心是分析对象（某次运动或「最近 N 天」），
 *       圈内外就是交不交给 AI，展开的类别能看到逐指标排除。
 *   右：① 选运动（可以不选） ② 方向（模板）+ 你的问题 + 背景
 *       ③ 交付（导出到桌面 → 复制提示词 → 打开 AI）。
 *
 * 本组件只做编排：状态归 useAiTaskDraft / useAiTaskLibrary / useAiTaskPreview /
 * useAiTaskHandoff 四个 composable，纯逻辑归 src/lib/aiTask/*。
 */
import { computed, onMounted, reactive, watch } from 'vue';
import { useRoute } from 'vue-router';
import '../styles/ai-task.css';
import AiTaskHeader from '../components/ai/AiTaskHeader.vue';
import TaskGraph from '../components/ai/TaskGraph.vue';
import WorkoutPicker from '../components/ai/WorkoutPicker.vue';
import DirectionPanel from '../components/ai/DirectionPanel.vue';
import TaskExtras from '../components/ai/TaskExtras.vue';
import HandoffPanel from '../components/ai/HandoffPanel.vue';
import { useAiTaskDraft } from '../composables/useAiTaskDraft';
import { useAiTaskLibrary } from '../composables/useAiTaskLibrary';
import { useAiTaskPreview } from '../composables/useAiTaskPreview';
import type { AiTaskCategory } from '../lib/bridge/types';
import { buildGraph } from '../lib/aiTask/graph/model';
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
  },
  {
    daysOption: (days: number) => `${days} days`,
    recentDays: (days: number) => `Last ${days} days`,
    andMore: (count: number) => `and ${count - 1} more`,
  },
  {
    daysOption: (days: number) => `${days} días`,
    recentDays: (days: number) => `Últimos ${days} días`,
  },
  'views/AiComposer',
));

const route = useRoute();
const draftCtl = useAiTaskDraft();
const library = useAiTaskLibrary();
const previewCtl = useAiTaskPreview();

const { draft, canUndo } = draftCtl;
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
  }));

const selectedTemplate = computed(() => templates.value.find((template) => template.id === draft.value.template_id) ?? null);
const direction = computed(() => directionText(selectedTemplate.value));
const fallbackTitle = computed(() => autoTaskTitle(draft.value, selectedWorkouts.value, selectedTemplate.value ? selectedTemplate.value.name : null));
const recentDays = computed(() => recentWindowDays(draft.value));

/* —— 载入 —— */
previewCtl.watchDraft(draft);
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
    <AiTaskHeader :fallback-title="fallbackTitle" />

    <div class="layout">
      <div class="graph-side">
        <TaskGraph :model="graphModel" :can-undo="canUndo" @undo="draftCtl.undo()"
          @set-category="draftCtl.setCategoryEnabled"
          @set-metric="(category, metric, included) => draftCtl.setMetricExcluded(category, metric, !included)"
          @set-days="draftCtl.setCategoryDays" @set-include-day="draftCtl.setIncludeWorkoutDay"
          @toggle-expand="toggleExpand" />
      </div>

      <div class="steps">
        <WorkoutPicker :workouts="workoutChoices" :selected-ids="draft.workout_ids" :recent-days="recentDays"
          @toggle="draftCtl.toggleWorkout" />
        <DirectionPanel :templates="templates" />
        <TaskExtras :preview="preview" />
        <HandoffPanel :preview="preview" :preview-error="previewError" :direction="direction" :fallback-title="fallbackTitle" />
      </div>
    </div>
  </section>
</template>

<style scoped>
.ai-page { padding-bottom: 32px; }
.layout { display: grid; grid-template-columns: minmax(0, 1.15fr) minmax(380px, 1fr); gap: 18px; align-items: start; }
.graph-side { position: sticky; top: 16px; height: calc(100vh - 120px); min-height: 480px; border: 1px solid var(--line); border-radius: var(--radius-md); background: var(--surface); overflow: hidden; }
.steps { display: grid; gap: 14px; min-width: 0; }
@media (max-width: 1100px) {
  .layout { grid-template-columns: 1fr; }
  .graph-side { position: static; height: 520px; }
}
</style>
