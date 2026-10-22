<script setup lang="ts">
/**
 * 计划留档（/ai/plan/history，批次 7）：推到手表的每一份计划都在这里，新的在前。
 *
 * 每一份写明哪天发的、是你写的还是 AI 回复 / MCP 起草的、送没送到、换下了几条，下面列出这份计划里的
 * 每一条训练（形状缩略图和周视图同一把尺），练完打过分的带上那一档。滚动补发不是新计划，不列。
 * 只读：要改计划回周视图。
 */
import { computed, onMounted, ref } from 'vue';
import PageHeader from '../../components/PageHeader.vue';
import PlanShape from '../../components/plan/PlanShape.vue';
import { usePlanText } from '../../components/plan/usePlanText';
import { useFeedbackText } from '../../components/feedback/feedback.i18n';
import { backend, isDesktop, toUserMessage } from '../../lib/bridge';
import { displayDateTimeFormatter, parseDisplayDate } from '../../lib/dateTime';
import { formatFullDateTime } from '../../lib/format';
import { profileMinutes, workoutProfile } from '../../lib/trainingPlan/profile';
import { sharedHrDomain } from '../../lib/trainingPlan/summary';
import type { FeedbackRating, PlanHistoryEntry } from '../../types/feedback';
import { usePlanHistoryText } from './AiPlanHistory.i18n';

defineOptions({ name: 'AiPlanHistory' });
const t = usePlanHistoryText();
const f = useFeedbackText();
const { sport } = usePlanText();

const entries = ref<PlanHistoryEntry[] | null>(null);
const error = ref<string | null>(null);
onMounted(async () => {
  if (!isDesktop()) { entries.value = []; return; }
  try { entries.value = await backend.trainingPlanHistory(); } catch (e) { error.value = toUserMessage(e, ''); entries.value = []; }
});

/** 所有缩略图用同一把尺：最长的那条占满。 */
const profiled = computed(() => (entries.value ?? []).map((entry) => ({
  entry,
  rows: entry.workouts.map((workout) => ({ workout, profile: workoutProfile(workout) })),
})));
const scale = computed(() => Math.max(1, ...profiled.value.flatMap((item) => item.rows.map((row) => row.profile.seconds))));
const domain = computed(() => sharedHrDomain(profiled.value.flatMap((item) => item.rows.map((row) => row.profile))));

const kind = (entry: PlanHistoryEntry) => ({
  publish: t.value.kindPublish, roll: t.value.kindPublish, undo: t.value.kindUndo, clear: t.value.kindClear, revoked: t.value.kindRevoked,
})[entry.record.kind];
const origin = (entry: PlanHistoryEntry) => (entry.origin === 'user' ? t.value.originUser : entry.origin === 'ai_paste' ? t.value.originAi : entry.origin === 'mcp' ? t.value.originMcp : null);
const state = (entry: PlanHistoryEntry) => ({
  pending: t.value.statePending, unknown: t.value.stateUnknown, rejected: t.value.stateRejected, partial: t.value.statePartial, sent: null,
})[entry.record.state];
const day = (date: string) => displayDateTimeFormatter({ month: 'short', day: 'numeric', weekday: 'short' }).format(parseDisplayDate(date));
const ratingWord = (rating: FeedbackRating) => [f.value.level1, f.value.level2, f.value.level3, f.value.level4, f.value.level5][rating - 1];
</script>

<template>
  <section class="page ai-sub-page story" aria-labelledby="plan-history-title">
    <PageHeader title-id="plan-history-title" :title="t.title" />
    <p v-if="error" class="ai-panel ai-empty" role="alert">{{ error }}</p>
    <p v-else-if="entries && !entries.length" class="ai-panel ai-empty">{{ t.empty }}</p>
    <article v-for="{ entry, rows } in profiled" :key="entry.record.batch_id" class="ai-panel history-entry">
      <header class="entry-head">
        <strong>{{ kind(entry) }}</strong>
        <span class="entry-when">{{ formatFullDateTime(entry.record.created_at) }}</span>
        <span v-if="origin(entry)" class="entry-chip">{{ origin(entry) }}</span>
        <span v-if="state(entry)" class="entry-chip is-warn">{{ state(entry) }}</span>
        <span v-if="entry.replaced" class="entry-replaced">{{ t.replaced(entry.replaced) }}</span>
      </header>
      <p v-if="entry.summary" class="entry-summary">{{ entry.summary }}</p>
      <ol v-if="rows.length" class="entry-workouts">
        <li v-for="row in rows" :key="row.workout.plan_workout_id">
          <span class="w-day">{{ day(row.workout.date) }}</span>
          <span class="w-name"><b>{{ row.workout.name }}</b><small>{{ sport(row.workout.sport) }} · {{ row.profile.approx ? t.approxMinutes(profileMinutes(row.profile)) : t.minutes(profileMinutes(row.profile)) }}</small></span>
          <PlanShape class="w-shape" :profile="row.profile" :scale-seconds="scale" :domain="domain" />
          <span :class="['w-rating', row.workout.rating ? `is-${row.workout.rating}` : 'is-none']">{{ row.workout.rating ? ratingWord(row.workout.rating) : '' }}</span>
        </li>
      </ol>
      <p v-else-if="entry.record.kind !== 'clear' && entry.record.kind !== 'revoked'" class="entry-summary">{{ t.nothingSent }}</p>
    </article>
  </section>
</template>

<style scoped src="./aiPage.css"></style>
<style scoped>
.history-entry { gap: 10px; }
.entry-head { display: flex; flex-wrap: wrap; align-items: baseline; gap: 6px 10px; }
.entry-head strong { color: var(--ink); font-size: var(--fs-md); font-weight: 600; }
.entry-when { color: var(--subtle); font-size: var(--fs-xs); font-variant-numeric: tabular-nums; }
.entry-chip { padding: 1px 9px; border-radius: 999px; background: color-mix(in srgb, var(--ink) 7%, transparent); color: var(--muted); font-size: var(--fs-2xs); font-weight: 600; }
.entry-chip.is-warn { color: var(--warning); background: color-mix(in srgb, var(--warning) 12%, transparent); }
.entry-replaced { margin-left: auto; color: var(--subtle); font-size: var(--fs-xs); }
.entry-summary { margin: 0; color: var(--muted); font-size: var(--fs-sm); line-height: 1.6; }
.entry-workouts { display: grid; gap: 8px; margin: 0; padding: 0; list-style: none; }
.entry-workouts li { display: grid; grid-template-columns: 92px minmax(0, 1fr) 120px 64px; align-items: center; gap: 12px; }
.w-day { color: var(--subtle); font-size: var(--fs-xs); font-variant-numeric: tabular-nums; }
.w-name { display: grid; min-width: 0; }
.w-name b { overflow: hidden; color: var(--ink); font-size: var(--fs-sm); font-weight: 600; text-overflow: ellipsis; white-space: nowrap; }
.w-name small { color: var(--subtle); font-size: var(--fs-2xs); }
.w-shape { width: 120px; }
.w-rating { justify-self: end; font-size: var(--fs-xs); font-weight: 600; }
.w-rating.is-1, .w-rating.is-2 { color: var(--muted); }
.w-rating.is-3 { color: var(--accent); }
.w-rating.is-4, .w-rating.is-5 { color: var(--warning); }
@media (max-width: 700px) {
  .entry-workouts li { grid-template-columns: 72px minmax(0, 1fr) 56px; }
  .w-shape { display: none; }
}
</style>
