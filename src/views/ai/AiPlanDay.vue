<script setup lang="ts">
/**
 * 单天页（/ai/plan/:date）：这一天的每一条训练都能就地改（PlanWorkoutEditor：名字、目的、要点、运动与子类型、
 * 强度图直接拖、每一步滚轮精调、重复组轮数），缺目的 / 缺要点、步骤写错的训练也照样画出来、红框标出要补的地方；
 * 走路这类发不到手表的在下面给「删掉 / 换成能发的大类」。前一天 / 后一天直接换（替换当前历史，返回仍回到周视图、
 * 缩回当初那一格）。已经发出去的计划也能改：第一下改动时把它拿回来变成草稿。
 */
import { computed } from 'vue';
import { useRoute } from 'vue-router';
import PageHeader from '../../components/PageHeader.vue';
import Icon from '../../components/Icon.vue';
import PlanDetail from '../../components/plan/PlanDetail.vue';
import PlanWorkoutEditor from '../../components/plan/PlanWorkoutEditor.vue';
import { useAiHub } from '../../composables/ai/useAiHub';
import { useTrainingPlan } from '../../composables/useTrainingPlan';
import { useBridgeText } from '../../components/ai/bridge/bridge.i18n';
import { useHubText } from '../../components/ai/hub/hub.i18n';
import { usePlanText } from '../../components/plan/usePlanText';
import { useEditorText } from '../../components/plan/editor.i18n';
import { issueDate } from '../../lib/trainingPlan/week';
import { documentIndexOf } from '../../lib/trainingPlan/edit';
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
const title = computed(() => (/^\d{4}-\d{2}-\d{2}$/.test(date.value)
  ? displayDateTimeFormatter({ month: 'long', day: 'numeric', weekday: 'long' }).format(parseDisplayDate(date.value))
  : '—'));
</script>

<template>
  <section class="page ai-sub-page" aria-labelledby="ai-day-title">
    <PageHeader title-id="ai-day-title" :title="title" :intro="h.dayIntro">
      <nav class="day-nav" :aria-label="title" data-no-morph>
        <RouterLink v-if="prev" :to="`/ai/plan/${prev}`" replace class="pill-button quiet"><Icon name="arrow-left" :size="13" />{{ h.prevDay }}</RouterLink>
        <RouterLink v-if="next" :to="`/ai/plan/${next}`" replace class="pill-button quiet">{{ h.nextDay }}<Icon name="arrow-right" :size="13" /></RouterLink>
      </nav>
    </PageHeader>
    <div v-if="hub.notice.value" class="ai-message" role="status"><Icon name="info" :size="14" /><span>{{ hub.notice.value }}</span><button class="pill-button quiet" @click="plan.dismissNotice()">{{ pt.dismiss }}</button></div>
    <template v-if="row">
      <div v-for="entry in entries" :key="entry.key" class="ai-panel">
        <p v-if="entry.held" class="held-note"><Icon name="warning" :size="14" />{{ e.held }}</p>
        <PlanWorkoutEditor :workout="entry.workout" :locate="entry.locate" :issues="issuesOf(entry)" :editable="hub.editable.value" />
      </div>
      <div class="ai-panel">
        <PlanDetail :row="row" :issues="issues" :show-date="false" :show-workout="!entries.length" :editable="hub.editable.value" @retype="hub.retype" @remove="hub.removeWorkout" />
        <footer v-if="hub.editable.value && (row.after.length || row.held.length)" class="day-foot">
          <button class="pill-button quiet" :disabled="plan.busy.value" @click="hub.removeDay(date)"><Icon name="trash" :size="13" />{{ t.deleteDay }}</button>
        </footer>
      </div>
    </template>
    <p v-else class="ai-panel ai-empty">{{ pt.noPlanDay }}</p>
  </section>
</template>

<style scoped src="./aiPage.css"></style>
<style scoped>
.day-nav { display: flex; gap: 6px; }
.day-foot { display: flex; justify-content: flex-end; padding-top: 8px; border-top: 1px solid var(--line); }
.held-note { display: flex; align-items: center; gap: 8px; margin: 0; color: var(--danger); font-size: var(--fs-xs); }
</style>
