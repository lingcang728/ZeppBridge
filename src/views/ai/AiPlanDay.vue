<script setup lang="ts">
/**
 * 单天页（/ai/plan/:date）：这一天的每一条训练都能就地改（PlanWorkoutEditor：名字、目的、要点、运动与子类型、
 * 总览条 + 步骤卡、每一步滚轮精调、加删步骤、重复组轮数），缺目的 / 缺要点、步骤写错的训练也照样画出来、红框标出要补的地方；
 * 走路这类发不到手表的在下面给「删掉 / 换成能发的大类」。页头：前一天 / 后一天直接换（替换当前历史，返回仍回到周视图、
 * 缩回当初那一格），「⋯」里是把这一天的训练存成模板、从模板或 .zwo / .fit 文件加一条、删掉这一天。
 * 已经发出去的计划也能改：第一下改动时把它拿回来变成草稿。
 */
import { computed, nextTick, ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import PageHeader from '../../components/PageHeader.vue';
import Icon from '../../components/Icon.vue';
import GlassPopover from '../../components/GlassPopover.vue';
import PlanDetail from '../../components/plan/PlanDetail.vue';
import PlanWorkoutEditor from '../../components/plan/PlanWorkoutEditor.vue';
import PlanLibraryItems from '../../components/plan/PlanLibraryItems.vue';
import PlanAddNotice from '../../components/plan/PlanAddNotice.vue';
import { usePlanAdd } from '../../composables/usePlanAdd';
import { useLibraryText } from '../../components/plan/library.i18n';
import { addWorkout } from '../../lib/trainingPlan/reshape';
import type { PlanTemplate } from '../../lib/trainingPlan/templates';
import { useAiHub } from '../../composables/ai/useAiHub';
import { useTrainingPlan } from '../../composables/useTrainingPlan';
import { useBridgeText } from '../../components/ai/bridge/bridge.i18n';
import { useHubText } from '../../components/ai/hub/hub.i18n';
import { usePlanText } from '../../components/plan/usePlanText';
import { useEditorText } from '../../components/plan/editor.i18n';
import { issueDate } from '../../lib/trainingPlan/week';
import { documentIndexOf, workoutToInput } from '../../lib/trainingPlan/edit';
import { displayDateTimeFormatter, parseDisplayDate } from '../../lib/dateTime';
import type { PlanDocument, PlanSport, PlanWorkout } from '../../types/trainingPlan';
import '../../styles/ai-task.css';

defineOptions({ name: 'AiPlanDay' });
const route = useRoute();
const hub = useAiHub();
const plan = useTrainingPlan();
const t = useBridgeText();
const h = useHubText();
const e = useEditorText();
const { t: pt } = usePlanText();
const l = useLibraryText();
const SPORTS: PlanSport[] = ['running', 'cycling', 'pool_swim', 'open_water_swim'];
const date = computed(() => String(route.params.date ?? ''));
const index = computed(() => hub.rows.value.findIndex((row) => row.date === date.value));
const row = computed(() => hub.rows.value[index.value] ?? null);
const prev = computed(() => hub.rows.value[index.value - 1]?.date ?? null);
const next = computed(() => hub.rows.value[index.value + 1]?.date ?? null);
const allIssues = computed(() => hub.future.value?.check.issues ?? []);
const issues = computed(() => allIssues.value.filter((issue) => issueDate(issue, hub.written.value) === date.value));
/** 原文里被挡住的训练（校验结果里没有它们，按原文顺序数的时候要跳过）。 */
const blocked = () => new Set(allIssues.value.filter((i) => i.severity !== 'warning' && i.workout !== undefined).map((i) => i.workout!));

type Entry = { key: string; workout: PlanWorkout; locate: (doc: PlanDocument) => number | null; held: boolean };
const entries = computed<Entry[]>(() => {
  const r = row.value;
  if (!r) return [];
  const valid = r.after.map((workout, k): Entry => ({
    key: `ok-${k}`, workout, held: false,
    locate: (doc) => documentIndexOf(doc, date.value, k, blocked()),
  }));
  const fixes = r.held.filter((item) => !item.activity).map((item): Entry => ({
    key: `fix-${item.index}`, held: true,
    workout: {
      date: item.date, name: item.name, focus: item.focus, description: item.description, steps: item.steps,
      sport: (SPORTS as string[]).includes(item.sport) ? item.sport as PlanSport : 'running',
    },
    locate: () => item.index,
  }));
  return [...valid, ...fixes];
});
/** 一条训练自己的问题（红框用）：校验通过的按原文下标找，缺东西的就是它自己的下标。 */
const issuesOf = (entry: Entry) => {
  const doc = plan.document.value;
  const at = doc ? entry.locate(doc) : null;
  return at === null ? [] : allIssues.value.filter((issue) => issue.workout === at);
};
/** 下面那块（走路这类、休息建议、问题清单）有东西才画，不留一块空板。 */
const detailNeeded = computed(() => !!row.value && (!entries.value.length || issues.value.length > 0 || row.value.held.some((item) => item.activity) || !!row.value.rest));
/** 页头「⋯」：存成模板、加一条训练（模板 / 文件）、删掉这一天。能改的日子才有，休息日也有（可以加）。 */
const canDelete = computed(() => hub.editable.value && !!row.value && (row.value.after.length > 0 || row.value.held.length > 0));
const canEdit = computed(() => hub.editable.value && !!row.value);
/** 能存成模板的：校验通过的训练（缺东西的先补齐再存）。 */
const savable = computed(() => entries.value.filter((entry) => !entry.held));
const library = usePlanAdd((workout) => hub.queueEdit((doc) => addWorkout(doc, workout, date.value), [date.value]));
const menu = ref(false);
const moreButton = ref<HTMLElement | null>(null);
const menuPop = ref<InstanceType<typeof GlassPopover> | null>(null);
const deleteDay = async () => {
  await menuPop.value?.close();
  void hub.removeDay(date.value);
};
const saveTemplate = async (entry: Entry) => {
  await menuPop.value?.close();
  library.save(workoutToInput(entry.workout));
};
const placeTemplate = async (template: PlanTemplate) => {
  await menuPop.value?.close();
  await library.place(template.workout);
};
const importFile = async () => {
  await menuPop.value?.close();
  library.openFile();
};
/* 前一天 / 后一天：内容顺着方向滑过去、标题跟着换（10-13：以前是原地硬切，看不出换了一天）。
   同一个路由组件只换参数，外壳的切页动效不管这里，这一页自己放。 */
const dayDir = ref<'next' | 'prev'>('next');
const titleBox = ref<HTMLElement | null>(null);
watch(date, async (now, before) => {
  dayDir.value = before && now < before ? 'prev' : 'next';
  await nextTick();
  if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
  const heading = titleBox.value?.querySelector<HTMLElement>('#ai-day-title');
  const dx = dayDir.value === 'next' ? 18 : -18;
  heading?.animate([{ opacity: 0, transform: `translateX(${dx}px)` }, { opacity: 1, transform: 'none' }], { duration: 420, easing: 'cubic-bezier(.2, .8, .2, 1)' });
});
const title = computed(() => (/^\d{4}-\d{2}-\d{2}$/.test(date.value)
  ? displayDateTimeFormatter({ month: 'long', day: 'numeric', weekday: 'long' }).format(parseDisplayDate(date.value))
  : '—'));
</script>

<template>
  <section ref="titleBox" class="page ai-sub-page" aria-labelledby="ai-day-title">
    <PageHeader title-id="ai-day-title" :title="title">
      <nav class="day-nav" :aria-label="title" data-no-morph>
        <RouterLink v-if="prev" :to="`/ai/plan/${prev}`" replace class="nav-button" :aria-label="h.prevDay" :title="h.prevDay"><Icon name="arrow-left" :size="16" /></RouterLink>
        <RouterLink v-if="next" :to="`/ai/plan/${next}`" replace class="nav-button" :aria-label="h.nextDay" :title="h.nextDay"><Icon name="arrow-right" :size="16" /></RouterLink>
        <button v-if="canEdit" ref="moreButton" type="button" class="nav-button" :aria-label="e.more" :title="e.more" :aria-expanded="menu" @click="menu = true"><Icon name="dots" :size="16" /></button>
      </nav>
    </PageHeader>
    <GlassPopover v-if="menu" ref="menuPop" :anchor="moreButton" :width="260" @close="menu = false">
      <button v-for="entry in savable" :key="entry.key" type="button" class="menu-item" data-pop-item @click="saveTemplate(entry)">
        <Icon name="star" :size="14" /><span class="menu-text">{{ savable.length > 1 ? l.saveTemplateNamed(entry.workout.name) : l.saveTemplate }}</span>
      </button>
      <hr v-if="savable.length" class="menu-rule" />
      <PlanLibraryItems :templates="library.templates.value" @place="placeTemplate" @remove="library.remove" @import="importFile" />
      <template v-if="canDelete">
        <hr class="menu-rule" />
        <button type="button" class="menu-item danger" data-pop-item :disabled="plan.busy.value" @click="deleteDay"><Icon name="trash" :size="14" />{{ t.deleteDay }}</button>
      </template>
    </GlassPopover>
    <PlanAddNotice :outcome="library.outcome.value" :need="library.need.value" @supply="library.supply" @cancel="library.cancelNeed" @dismiss="library.dismiss" />
    <div v-if="hub.notice.value" class="ai-message" role="status"><Icon name="info" :size="14" /><span>{{ hub.notice.value }}</span><button class="pill-button quiet" @click="plan.dismissNotice()">{{ pt.dismiss }}</button></div>
    <div class="day-stage">
      <Transition :name="`day-${dayDir}`">
        <div :key="date" class="day-body">
          <template v-if="row">
            <div v-for="entry in entries" :key="entry.key" class="ai-panel">
              <p v-if="entry.held" class="held-note"><Icon name="warning" :size="14" />{{ e.held }}</p>
              <PlanWorkoutEditor :workout="entry.workout" :locate="entry.locate" :issues="issuesOf(entry)" :editable="hub.editable.value" />
            </div>
            <div v-if="detailNeeded" class="ai-panel">
              <PlanDetail :row="row" :issues="issues" :show-date="false" :show-workout="!entries.length" :editable="hub.editable.value" @retype="hub.retype" @remove="hub.removeWorkout" />
            </div>
          </template>
          <p v-else class="ai-panel ai-empty">{{ pt.noPlanDay }}</p>
        </div>
      </Transition>
    </div>
  </section>
</template>

<style scoped src="./aiPage.css"></style>
<style scoped>
.day-nav { display: flex; gap: 6px; }
/* 换一天：新的一天从前进方向滑进来、旧的往反方向让一小段淡掉（和换顶栏入口同一种节奏）。两天叠在同一格里，不撑高。 */
.day-stage { display: grid; }
.day-body { grid-area: 1 / 1; min-width: 0; }
.day-next-enter-active, .day-prev-enter-active { transition: opacity 320ms cubic-bezier(.2, .7, .2, 1), transform 520ms cubic-bezier(.2, .8, .2, 1); }
.day-next-leave-active, .day-prev-leave-active { transition: opacity 180ms ease-in, transform 260ms ease-in; pointer-events: none; }
.day-next-enter-from { opacity: 0; transform: translateX(64px); }
.day-prev-enter-from { opacity: 0; transform: translateX(-64px); }
.day-next-leave-to { opacity: 0; transform: translateX(-28px); }
.day-prev-leave-to { opacity: 0; transform: translateX(28px); }
@media (prefers-reduced-motion: reduce) {
  .day-next-enter-active, .day-prev-enter-active, .day-next-leave-active, .day-prev-leave-active { transition: opacity 120ms ease; }
  .day-next-enter-from, .day-prev-enter-from, .day-next-leave-to, .day-prev-leave-to { transform: none; }
}
.nav-button { display: grid; width: 36px; height: 36px; place-items: center; padding: 0; border: 1px solid var(--mat-line); border-radius: 50%; background: var(--mat-raised);
  box-shadow: var(--mat-raised-rim); color: var(--ink); cursor: pointer; transition: translate var(--dur-base) var(--ease-spring); }
.nav-button:hover { translate: 0 -1px; }
.nav-button:focus-visible { outline: 2px solid var(--focus); outline-offset: 2px; }
.menu-item { display: flex; align-items: center; gap: 8px; width: 100%; min-height: 38px; padding: 0 12px; border: 0; border-radius: 12px; background: none; color: var(--ink);
  font: inherit; font-size: var(--fs-sm); text-align: left; cursor: pointer; }
.menu-item:hover:not(:disabled) { background: var(--glass-press); }
.menu-item.danger { color: var(--danger); }
.menu-text { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.menu-rule { height: 1px; margin: 4px 8px; border: 0; background: var(--mat-line); }
.held-note { display: flex; align-items: center; gap: 8px; margin: 0; color: var(--danger); font-size: var(--fs-xs); }
</style>
