<script setup lang="ts">
/**
 * 选中的那一天：左边强度走势（PlanChart）+ 图例，右边步骤时间线（重复组折成「重复 N 次」），
 * 下面是这一天的校验问题。
 *
 * 问题分两种：`error` 挡住发送，`unverified` 只是提醒（格式没问题，但 Zepp 在你手表上怎么显示还没核实）。
 * 都用文字说清楚，不只靠颜色。
 */
import { computed } from 'vue';
import PlanChart from './PlanChart.vue';
import type { DayRow } from '../../lib/trainingPlan/week';
import { issueStepPath } from '../../lib/trainingPlan/week';
import { workoutProfile, type StepRow } from '../../lib/trainingPlan/profile';
import { INTENSITY_COLOR, usedIntensities } from '../../lib/trainingPlan/intensity';
import { planIssueText } from '../../lib/trainingPlan/issues';
import { displayDateTimeFormatter, parseDisplayDate } from '../../lib/dateTime';
import type { PlanIssue } from '../../types/trainingPlan';
import Icon from '../Icon.vue';
import { usePlanText } from './usePlanText';

const props = defineProps<{ row: DayRow | null; issues: PlanIssue[] }>();
const { t, sport, intensity, minutes, length, target } = usePlanText();

const dateLine = computed(() => {
  if (!props.row) return '';
  const date = parseDisplayDate(props.row.date);
  return displayDateTimeFormatter({ month: 'long', day: 'numeric', weekday: 'long' }).format(date);
});
const workout = computed(() => props.row?.after[0] ?? null);
const profile = computed(() => (workout.value ? workoutProfile(workout.value) : null));
const facts = computed(() => {
  if (!workout.value || !profile.value) return [];
  const total = minutes(Math.round(profile.value.seconds / 60));
  return [sport(workout.value.sport), profile.value.approx ? t.value.totalAbout(total) : total];
});
const legend = computed(() => (profile.value ? usedIntensities(profile.value.segments) : []));

const issueLines = computed(() => props.issues.map((issue) => {
  const path = issueStepPath(issue);
  return {
    key: `${issue.message_code}:${issue.workout ?? ''}:${issue.step ?? ''}`,
    severity: issue.severity,
    tag: issue.severity === 'error' ? t.value.issueError : t.value.issueUnverified,
    where: path.length ? t.value.stepNumber(path[0]) : '',
    text: planIssueText(issue),
  };
}));
const hasUnverified = computed(() => issueLines.value.some((line) => line.severity === 'unverified'));
const stepTarget = (row: StepRow) => target(row.target);
</script>

<template>
  <section class="detail" :aria-label="dateLine">
    <template v-if="row">
      <header class="head">
        <p class="date">{{ dateLine }}</p>
        <h3>{{ workout?.name ?? t.rest }}</h3>
        <p v-if="facts.length" class="facts"><span v-for="fact in facts" :key="fact">{{ fact }}</span></p>
      </header>

      <div v-if="workout && profile" class="grid">
        <div class="chart-col">
          <p class="col-label">{{ t.chartTitle }}</p>
          <PlanChart :profile="profile" />
          <div class="legend">
            <span v-for="kind in legend" :key="kind" :style="{ '--c': INTENSITY_COLOR[kind] }"><i></i>{{ intensity(kind) }}</span>
          </div>
          <p v-if="profile.approx" class="note">{{ t.chartApprox }}</p>
          <p v-else-if="!profile.hasHeartRate" class="note">{{ t.chartNoHr }}</p>
        </div>

        <div class="steps-col">
          <p class="col-label">{{ t.stepsTitle }}</p>
          <ol class="steps">
            <template v-for="(group, index) in profile.groups" :key="index">
              <li v-if="group.kind === 'step'" class="step" :style="{ '--c': INTENSITY_COLOR[group.row.intensity] }">
                <i aria-hidden="true"></i>
                <span class="what"><b>{{ intensity(group.row.intensity) }}</b>{{ length(group.row.length) }}</span>
                <span class="target">{{ stepTarget(group.row) }}</span>
              </li>
              <li v-else class="rep">
                <span class="rep-head"><Icon name="refresh" :size="13" />{{ t.repeatTimes(group.times) }}</span>
                <ol>
                  <li v-for="(inner, innerIndex) in group.rows" :key="innerIndex" class="step" :style="{ '--c': INTENSITY_COLOR[inner.intensity] }">
                    <i aria-hidden="true"></i>
                    <span class="what"><b>{{ intensity(inner.intensity) }}</b>{{ length(inner.length) }}</span>
                    <span class="target">{{ stepTarget(inner) }}</span>
                  </li>
                </ol>
              </li>
            </template>
          </ol>
        </div>
      </div>
      <p v-else class="empty"><Icon name="moon" :size="16" />{{ row.before[0] ? t.wasName(row.before[0].name) : t.noPlanDay }}</p>

      <p v-if="!row.inWindow && workout" class="note">{{ t.outsideNote }}</p>

      <div v-if="issueLines.length" class="issues">
        <h4>{{ t.issuesTitle }}</h4>
        <ul>
          <li v-for="line in issueLines" :key="line.key" :class="['issue', line.severity]">
            <span class="tag">{{ line.tag }}</span>
            <span class="msg"><b v-if="line.where">{{ line.where }} · </b>{{ line.text }}</span>
          </li>
        </ul>
        <p v-if="hasUnverified" class="note"><Icon name="info" :size="13" />{{ t.unverifiedNote }}</p>
      </div>
    </template>
  </section>
</template>

<style scoped>
.detail { display: grid; align-content: start; gap: 16px; min-width: 0; }
.head { display: grid; gap: 2px; }
.date { margin: 0; color: var(--subtle); font-size: var(--fs-xs); font-weight: 600; }
h3 { margin: 0; font-size: var(--fs-2xl); line-height: 1.25; }
.facts { display: flex; flex-wrap: wrap; gap: 4px 14px; margin: 2px 0 0; color: var(--muted); font-size: var(--fs-xs); }
.facts span + span::before { content: ''; display: inline-block; width: 3px; height: 3px; margin: 0 12px 3px -8px; border-radius: 50%; background: var(--subtle); }

.grid { display: grid; grid-template-columns: minmax(0, 1.6fr) minmax(260px, 1fr); gap: 36px; align-items: start; }
.col-label { margin: 0 0 10px; color: var(--subtle); font-size: var(--fs-2xs); font-weight: 700; letter-spacing: .06em; text-transform: uppercase; }
.legend { display: flex; flex-wrap: wrap; gap: 4px 14px; margin-top: 10px; color: var(--muted); font-size: var(--fs-2xs); }
.legend span { display: inline-flex; align-items: center; gap: 6px; }
.legend i { width: 8px; height: 8px; border-radius: 50%; background: var(--c); }
.note { display: flex; align-items: flex-start; gap: 6px; margin: 6px 0 0; color: var(--subtle); font-size: var(--fs-2xs); line-height: 1.5; }

/* 步骤时间线：左边一条细竖线串起来，每一步一个强度色的小圆点。 */
.steps, .steps ol { display: grid; gap: 0; margin: 0; padding: 0; list-style: none; }
.steps { position: relative; }
.step { position: relative; display: grid; grid-template-columns: 14px minmax(0, 1fr) auto; align-items: baseline; gap: 10px; padding: 7px 0; font-size: var(--fs-xs); }
.step + .step, .rep + .step, .step + .rep { border-top: 1px solid color-mix(in srgb, var(--line) 70%, transparent); }
.step > i { width: 9px; height: 9px; align-self: center; border-radius: 50%; background: var(--c); box-shadow: 0 0 0 3px color-mix(in srgb, var(--c) 18%, transparent); }
.what { display: flex; flex-wrap: wrap; gap: 0 8px; min-width: 0; color: var(--muted); }
.what b { color: var(--ink); font-weight: 650; }
.target { color: var(--subtle); font-size: var(--fs-2xs); font-variant-numeric: tabular-nums; text-align: right; white-space: nowrap; }
.rep { padding: 8px 10px 4px; margin: 4px 0; border-radius: 14px; background: color-mix(in srgb, var(--ink) 4%, transparent); }
.rep-head { display: inline-flex; align-items: center; gap: 6px; color: var(--accent); font-size: var(--fs-2xs); font-weight: 700; }
.rep .step + .step { border-top-color: color-mix(in srgb, var(--line) 50%, transparent); }

.empty { display: flex; align-items: center; gap: 8px; margin: 0; padding: 28px 0; color: var(--subtle); font-size: var(--fs-sm); }

.issues h4 { margin: 0 0 8px; color: var(--muted); font-size: var(--fs-xs); font-weight: 650; }
.issues ul { display: grid; gap: 6px; margin: 0; padding: 0; list-style: none; }
.issue { display: flex; align-items: flex-start; gap: 10px; padding: 9px 12px; border-radius: 14px; background: var(--mat-inset); box-shadow: var(--mat-inset-shadow); font-size: var(--fs-xs); line-height: 1.5; }
.issue .tag { flex: none; padding: 1px 9px; border-radius: 999px; box-shadow: inset 0 0 0 1px currentColor; font-size: 11.5px; font-weight: 700; }
.issue.error .tag { color: var(--danger); }
.issue.unverified .tag { color: var(--warning); }
.issue .msg { min-width: 0; color: var(--muted); overflow-wrap: anywhere; }
.issue .msg b { color: var(--ink); font-weight: 600; }
.issues .note { margin-top: 8px; }
@media (max-width: 980px) { .grid { grid-template-columns: minmax(0, 1fr); } }
</style>
