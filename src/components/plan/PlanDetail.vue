<script setup lang="ts">
/**
 * 选中的那一天：区间图、图例、步骤清单（重复组折成「重复 N 次」）和这一天的校验问题。
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

const title = computed(() => {
  if (!props.row) return '';
  const date = parseDisplayDate(props.row.date);
  const monthDay = displayDateTimeFormatter({ month: 'numeric', day: 'numeric' }).format(date);
  const weekday = displayDateTimeFormatter({ weekday: 'short' }).format(date);
  return `${monthDay} ${weekday} · ${props.row.after[0]?.name ?? t.value.rest}`;
});
const workout = computed(() => props.row?.after[0] ?? null);
const profile = computed(() => (workout.value ? workoutProfile(workout.value) : null));
const subtitle = computed(() => {
  if (!workout.value || !profile.value) return '';
  const total = minutes(Math.round(profile.value.seconds / 60));
  return `${sport(workout.value.sport)} · ${profile.value.approx ? t.value.totalAbout(total) : total}`;
});
const legend = computed(() => (profile.value ? usedIntensities(profile.value.segments) : []));
const stepLine = (row: StepRow) => `${intensity(row.intensity)} ${length(row.length)} · ${target(row.target)}`;

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
</script>

<template>
  <section class="detail" :aria-label="title">
    <template v-if="row">
      <h3>{{ title }}<small v-if="subtitle">{{ subtitle }}</small></h3>

      <template v-if="workout && profile">
        <div class="chart-wrap"><PlanChart :profile="profile" /></div>
        <div class="legend">
          <span v-for="kind in legend" :key="kind" :style="{ '--c': INTENSITY_COLOR[kind] }"><i></i>{{ intensity(kind) }}</span>
          <span class="axis-note">{{ t.chartAxis }}</span>
        </div>
        <p v-if="profile.approx" class="note">{{ t.chartApprox }}</p>
        <p v-else-if="!profile.hasHeartRate" class="note">{{ t.chartNoHr }}</p>

        <ul class="steps">
          <template v-for="(group, index) in profile.groups" :key="index">
            <li v-if="group.kind === 'step'" :style="{ '--c': INTENSITY_COLOR[group.row.intensity] }">
              <i></i><span>{{ stepLine(group.row) }}</span>
            </li>
            <li v-else class="rep">
              <small>{{ t.repeatTimes(group.times) }}</small>
              <ul>
                <li v-for="(inner, innerIndex) in group.rows" :key="innerIndex" :style="{ '--c': INTENSITY_COLOR[inner.intensity] }">
                  <i></i><span>{{ stepLine(inner) }}</span>
                </li>
              </ul>
            </li>
          </template>
        </ul>
      </template>
      <p v-else class="note">{{ row.before[0] ? t.wasName(row.before[0].name) : t.noPlanDay }}</p>

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
.detail { display: grid; align-content: start; gap: 12px; padding: 20px 24px 18px; border-left: 1px solid var(--line); min-width: 0; }
h3 { display: flex; flex-wrap: wrap; align-items: baseline; gap: 4px 10px; margin: 0; font-size: var(--fs-2xl); }
h3 small { color: var(--subtle); font-size: var(--fs-xs); font-weight: 400; }
.chart-wrap { padding: 10px 10px 4px; border-radius: 20px; background: var(--mat-inset); box-shadow: var(--mat-inset-shadow); }
.legend { display: flex; flex-wrap: wrap; gap: 4px 14px; color: var(--muted); font-size: var(--fs-2xs); }
.legend span { display: inline-flex; align-items: center; gap: 6px; }
.legend i { width: 10px; height: 10px; border-radius: 3px; background: var(--c); }
.legend .axis-note { margin-left: auto; color: var(--subtle); }
.note { display: flex; align-items: flex-start; gap: 6px; margin: 0; color: var(--subtle); font-size: var(--fs-2xs); line-height: 1.5; }
.steps, .steps ul { display: grid; gap: 2px; margin: 0; padding: 0; list-style: none; font-size: var(--fs-xs); }
.steps li { display: grid; grid-template-columns: 10px minmax(0, 1fr); align-items: center; gap: 10px; padding: 6px 4px; }
.steps li > i { width: 10px; height: 10px; border-radius: 3px; background: var(--c); }
.steps li.rep { display: grid; grid-template-columns: minmax(0, 1fr); gap: 2px; margin: 2px 0 2px 4px; padding: 4px 0 4px 14px; border-left: 2px solid var(--line-strong); }
.steps li.rep > small { padding-left: 4px; color: var(--subtle); font-size: var(--fs-2xs); }
.issues h4 { margin: 4px 0 8px; color: var(--muted); font-size: var(--fs-xs); font-weight: 650; }
.issues ul { display: grid; gap: 6px; margin: 0; padding: 0; list-style: none; }
.issue { display: flex; align-items: flex-start; gap: 10px; padding: 9px 12px; border-radius: 14px; background: var(--mat-inset); box-shadow: var(--mat-inset-shadow); font-size: var(--fs-xs); line-height: 1.5; }
.issue .tag { flex: none; padding: 1px 9px; border-radius: 999px; box-shadow: inset 0 0 0 1px currentColor; font-size: 11.5px; font-weight: 700; }
.issue.error .tag { color: var(--danger); }
.issue.unverified .tag { color: var(--warning); }
.issue .msg { min-width: 0; color: var(--muted); overflow-wrap: anywhere; }
.issue .msg b { color: var(--ink); font-weight: 600; }
.issues .note { margin-top: 8px; }
@media (max-width: 1180px) { .detail { border-left: 0; border-top: 1px solid var(--line); } }
</style>
