<script setup lang="ts">
/**
 * 交给 AI —— 一块舞台，几层浮在上面的玻璃。
 *
 *   舞台：关系网（TaskGraph）。中心是分析对象（某次运动或「最近 N 天」），圈内外就是交不交给 AI，
 *         每个类别外面一圈日环——哪几天有数据一眼看见；展开的类别镜头俯冲进去看逐指标排除。
 *         画布只占看得见的那一块（扣掉左上的任务名和底部的对话条），圈按它的大小算。
 *   左上：任务名胶囊（改名、切换已保存的任务、新建、保存）；下面是四个入口胶囊——点一个就带上推荐的
 *         方向和范围，光标落到底部的问题条。
 *   右侧：步骤栏，一次只展开一步 —— ① 分析对象 ② 方向与背景 ③ 附件与选项；
 *         收起的步骤只露一行摘要，不用滚动就能看清整个任务。
 *   底部：问题条 + 交付坞。写字和交付在同一块视线里，整页唯一的主按钮「交给 ChatGPT」就在问题条下面。
 *   舞台下面：训练计划（贴回 AI 的回复 → 检查 → 发到手表），向下滚才看到。
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
import AiQuestionBar from '../components/ai/AiQuestionBar.vue';
import TrainingPlanSection from '../components/plan/TrainingPlanSection.vue';
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
    centerDays: selectedWorkouts.value.length ? null : recentWindowDays(draft.value),
    daysLabel: t.value.daysOption,
    coverageLabel: t.value.graphCoverage,
  }));

/* 入口动作：带上方向和推荐范围后，光标落到底部的问题条。 */
const questionRef = ref<InstanceType<typeof AiQuestionBar> | null>(null);
const askRef = ref<InstanceType<typeof AiAskStart> | null>(null);
const focusQuestion = () => { window.setTimeout(() => questionRef.value?.focus(), 120); };
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
const dockRef = ref<{ $el?: Element; details?: boolean } | null>(null);
/* 最终提示词浮层打开时，舞台其余部分磨砂变暗，视线落在浮层上（和运动页弹窗一样）。 */
const focusDock = computed(() => !!dockRef.value?.details);
const dockHeight = ref(0);
let dockObserver: ResizeObserver | null = null;
onMounted(() => {
  // 只量底部那一块（问题条 + 按钮栏）：以前量的是整个交付坞，最终提示词浮层、进度那一截一展开，坞就长高一大截，
  // 关系网的安全区跟着变、镜头重新居中——用户看到的「交给 AI 页跳动」。浮层本来就浮在画布上面。
  const dock = dockRef.value?.$el;
  const el = dock instanceof Element ? dock.querySelector('.core') ?? dock : null;
  if (!el || typeof ResizeObserver === 'undefined') return;
  const measure = () => { dockHeight.value = Math.round(el.getBoundingClientRect().height); };
  measure();
  dockObserver = new ResizeObserver(measure);
  dockObserver.observe(el);
});
/* 顶上任务名胶囊的实际高度：多语言 / 窄窗口里范围开关折到第二行时，画布跟着往下让。
   四个入口胶囊浮在画布左上角的空角里（圈是圆的，角上本来就没东西），不占画布高度。 */
const stageRef = ref<HTMLElement | null>(null);
const topRef = ref<HTMLElement | null>(null);
const topHeight = ref(0);
let topObserver: ResizeObserver | null = null;
onMounted(() => {
  const row = topRef.value;
  if (!row || typeof ResizeObserver === 'undefined') return;
  const measure = () => {
    const stage = stageRef.value?.getBoundingClientRect();
    if (!stage) return;
    // 只量这一排里的控件本身：任务历史的下拉是浮层，打开它不该把画布推下去。
    const bottoms = [...row.querySelectorAll<HTMLElement>('.head-task')].map((el) => el.getBoundingClientRect().bottom);
    if (bottoms.length) topHeight.value = Math.round(Math.max(...bottoms) - stage.top);
  };
  measure();
  topObserver = new ResizeObserver(measure);
  for (const el of row.querySelectorAll('.head-task')) topObserver.observe(el);
});
onBeforeUnmount(() => { dockObserver?.disconnect(); topObserver?.disconnect(); });
</script>

<template>
  <section class="page ai-page" aria-labelledby="ai-page-title">
    <div ref="stageRef" class="stage" :style="{ '--dock-h': dockHeight ? `${dockHeight}px` : undefined, '--top-h': topHeight ? `${topHeight}px` : undefined }">
      <div class="stage-graph">
        <TaskGraph :model="graphModel" :can-undo="canUndo" :undo-hint="undoHint" :undo-seq="lastChange?.seq ?? 0" @undo="draftCtl.undo()"
          @set-category="draftCtl.setCategoryEnabled"
          @set-metric="(category, metric, included) => draftCtl.setMetricExcluded(category, metric, !included)"
          @set-days="draftCtl.setCategoryDays" @set-include-day="draftCtl.setIncludeWorkoutDay"
          @toggle-expand="toggleExpand" />
      </div>

      <!-- 左上一列：任务名胶囊，下面一排四个入口。展开某一类、镜头俯冲进去的时候入口让位给「全部类别」面包屑。 -->
      <div ref="topRef" class="stage-top">
        <AiTaskHeader class="stage-head" :fallback-title="fallbackTitle" />
        <AiAskStart v-show="!expanded.size" ref="askRef" class="stage-ask" :draft="draft" :preview="preview" :templates="templates"
          :workout-count="draft.workout_ids.length" @template="applyTemplate" @pick-workout="pickWorkout" @ask="focusQuestion"
          @all-days="draftCtl.setWindowDays" />
      </div>

      <!-- 右栏的毛玻璃垫在它身后的一层上，右栏自己不带 backdrop-filter：否则里面的胶囊挂不上折射玻璃
           （lib/glassLens.ts；右栏会滚动，不能用 .is-lens-host 的伪元素，伪元素会跟着内容滚走）。 -->
      <div class="stage-rail-glass glass-control" aria-hidden="true"></div>
      <aside class="stage-rail">
        <AiStepRail v-model:open="openStep" :steps="railSteps">
          <template #target>
            <WorkoutPicker :workouts="workoutChoices" :selected-ids="draft.workout_ids" :recent-days="recentDays"
              @toggle="draftCtl.toggleWorkout" />
          </template>
          <template #ask><DirectionPanel :templates="templates" /></template>
          <template #extras><TaskExtras :preview="preview" /></template>
        </AiStepRail>
      </aside>

      <!-- 遮罩本身只淡入淡出（opacity），模糊是静态的一层，不做逐帧模糊过渡。 -->
      <Transition name="scrim"><div v-if="focusDock" class="stage-scrim" aria-hidden="true"></div></Transition>
      <HandoffPanel ref="dockRef" class="stage-dock" :preview="preview" :preview-error="previewError" :direction="direction"
        :fallback-title="fallbackTitle" :handover="askRef?.handover ?? null">
        <AiQuestionBar ref="questionRef" />
      </HandoffPanel>
    </div>

    <!-- 舞台下面：AI 回复了训练计划，贴回来检查再发到手表。首屏仍是整块舞台，向下滚才看到。 -->
    <TrainingPlanSection />
  </section>
</template>

<style scoped>
/* 舞台贴满顶栏以下的整块视口；关系网在最底层，其余几块玻璃浮在上面。
   关系网的画布只占「看得见的那一块」：上面让出任务名胶囊，下面让出对话条和按钮栏，右边让出步骤栏——
   圈按这一块的大小算、圆心落在这一块正中，不再有一截被压在交付坞下面白占地方。 */
.ai-page { --rail-w: min(344px, 27vw); padding: 4px 20px 20px; }
.stage {
  position: relative;
  height: calc(100vh - 84px);
  min-height: 600px;
  overflow: hidden;
  border-radius: var(--radius-xl);
  background:
    radial-gradient(80% 70% at 36% 48%, color-mix(in srgb, var(--accent) 8%, transparent), transparent 70%),
    var(--mat-card);
  box-shadow: var(--mat-rim), var(--mat-shadow-lift);
}
/* --graph-safe-*：节点弹层摆放时离画布四边留多远。 */
.stage-graph {
  --graph-safe-top: 14px;
  --graph-safe-bottom: 14px;
  position: absolute;
  inset: calc(var(--top-h, 54px) + 4px) calc(var(--rail-w) + 24px) calc(var(--dock-h, 130px) + 30px) 0;
  border-radius: inherit;
  /* 节点被平移 / 放大推到边上时，用一道静态渐隐收尾，不是被一条硬边截断。 */
  -webkit-mask-image: linear-gradient(to bottom, transparent, #000 14px, #000 calc(100% - 22px), transparent);
  mask-image: linear-gradient(to bottom, transparent, #000 14px, #000 calc(100% - 22px), transparent);
}
.stage-top { position: absolute; top: 16px; right: calc(var(--rail-w) + 40px); left: 16px; z-index: 4; display: grid; justify-items: start; gap: 10px;
  pointer-events: none; }
.stage-top > * { pointer-events: auto; }
.stage-head { min-width: 0; max-width: 100%; }
.stage-ask { max-width: 100%; }
.stage-rail, .stage-rail-glass {
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
.stage-rail-glass { overflow: visible; padding: 0; pointer-events: none; }
.stage-scrim { position: absolute; inset: 0; z-index: 5; border-radius: inherit; background: color-mix(in srgb, var(--canvas) 45%, transparent);
  -webkit-backdrop-filter: blur(6px); backdrop-filter: blur(6px); }
.scrim-enter-active, .scrim-leave-active { transition: opacity 220ms ease; }
.scrim-enter-from, .scrim-leave-to { opacity: 0; }
.stage-dock { position: absolute; right: calc(var(--rail-w) + 36px); bottom: 16px; left: 16px; z-index: 6; }

@media (max-width: 1100px) {
  .ai-page { --rail-w: 100%; padding: 4px 12px 16px; }
  .stage { height: auto; overflow: visible; background: none; box-shadow: none; }
  .stage-graph { position: relative; inset: auto; height: 62vh; min-height: 440px; border-radius: var(--radius-xl); background: var(--mat-card); box-shadow: var(--mat-rim), var(--mat-shadow);
    -webkit-mask-image: none; mask-image: none; }
  .stage-top { top: 12px; right: 12px; left: 12px; }
  .stage-rail { position: static; width: auto; margin-top: 12px; background: var(--mat-glass-strong); box-shadow: var(--glass-rim), var(--glass-shadow); }
  .stage-rail-glass { display: none; }
  .stage-dock { position: sticky; right: auto; bottom: 12px; left: auto; margin-top: 12px; }
}
</style>
