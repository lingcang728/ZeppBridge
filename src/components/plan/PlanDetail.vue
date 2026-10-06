<script setup lang="ts">
/**
 * 选中的那一天：左边强度走势（PlanChart）+ 图例，右边步骤时间线（重复组折成「重复 N 次」），
 * 下面是这一天的校验问题。
 *
 * 问题分三种：`error` / `unverified` 挡住发送，`warning` 只是提醒（名字太长会被手表截断）。
 * 都用文字说清楚，不只靠颜色。
 *
 * 2026-10 起：
 *   - 头部写训练目的和要点（手表描述就是它们），并如实说「手表上会让你再选一次类型」——
 *     第三方计划在手表上只到大类，这是 Zepp 的限制，不藏起来；
 *   - 走路这类发不到手表的训练照原样显示（绝不当休息日），就地给两条出路：删掉，或用玻璃分段
 *     换成能发的大类。只有 `editable` 时才给出路（历史和 MCP 未接受的草稿只读）。
 */
import { computed } from 'vue';
import SegmentTrack, { type SegmentItem } from '../SegmentTrack.vue';
import { SPORT_VARIANTS } from '../../lib/trainingPlan/reshape';
import PlanChart from './PlanChart.vue';
import type { DayRow } from '../../lib/trainingPlan/week';
import { issueStepPath } from '../../lib/trainingPlan/week';
import { workoutProfile, type StepRow } from '../../lib/trainingPlan/profile';
import { INTENSITY_COLOR, usedIntensities } from '../../lib/trainingPlan/intensity';
import { planIssueText } from '../../lib/trainingPlan/issues';
import { displayDateTimeFormatter, parseDisplayDate } from '../../lib/dateTime';
import type { PlanHeldWorkout, PlanIssue, PlanSport } from '../../types/trainingPlan';
import Icon from '../Icon.vue';
import { usePlanText } from './usePlanText';
import { useBridgeText } from '../ai/bridge/bridge.i18n';

const props = withDefaults(defineProps<{ row: DayRow | null; issues: PlanIssue[]; editable?: boolean; showDate?: boolean }>(), { showDate: true });
const emit = defineEmits<{ retype: [index: number, sport: PlanSport]; remove: [index: number] }>();
const { t, sport, activity, variant, intensity, minutes, length, target } = usePlanText();
const bridgeText = useBridgeText();
const restTime = computed(() => { const n = props.row?.rest?.bedtime_minutes; return n == null ? null : `${String(Math.floor(n / 60)).padStart(2,'0')}:${String(n % 60).padStart(2,'0')}`; });

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
  const kind = variant(workout.value.sport, workout.value.variant) ?? sport(workout.value.sport);
  return [kind, profile.value.approx ? t.value.totalAbout(total) : total];
});
/* 手表上第三方计划只到大类：跑步、骑行要再选一次子类型。游泳不用。 */
const pickNote = computed(() => {
  const current = workout.value;
  if (!current || !SPORT_VARIANTS[current.sport].length) return '';
  const name = variant(current.sport, current.variant);
  return name ? t.value.variantPick(name) : t.value.variantPickAny;
});
const held = computed<PlanHeldWorkout[]>(() => props.row?.held ?? []);
const heldMinutes = (item: PlanHeldWorkout) => {
  const seconds = item.steps.length ? workoutProfile({ date: item.date, sport: 'running', name: item.name, steps: item.steps }).seconds : 0;
  return seconds ? minutes(Math.round(seconds / 60)) : '';
};
const sportItems = computed<SegmentItem<PlanSport>[]>(() => ([
  { value: 'running', label: sport('running'), icon: 'run' },
  { value: 'cycling', label: sport('cycling'), icon: 'bike' },
  { value: 'pool_swim', label: sport('pool_swim'), icon: 'swim' },
]));
const legend = computed(() => (profile.value ? usedIntensities(profile.value.segments) : []));

const issueLines = computed(() => props.issues.map((issue) => {
  const path = issueStepPath(issue);
  return {
    key: `${issue.message_code}:${issue.workout ?? ''}:${issue.step ?? ''}`,
    severity: issue.severity,
    tag: issue.severity === 'error' ? t.value.issueError : issue.severity === 'warning' ? t.value.issueWarning : t.value.issueUnverified,
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
        <p v-if="showDate" class="date">{{ dateLine }}</p>
        <h3>{{ workout?.name ?? held[0]?.name ?? t.rest }}</h3>
        <p v-if="facts.length" class="facts"><span v-for="fact in facts" :key="fact">{{ fact }}</span></p>
        <p v-if="workout?.focus || workout?.description" class="brief">
          <b v-if="workout?.focus">{{ workout.focus }}</b><span v-if="workout?.description">{{ workout.description }}</span>
        </p>
        <p v-if="pickNote" class="note pick"><Icon name="watch" :size="13" />{{ pickNote }}</p>
      </header>

      <section v-for="item in held" :key="item.index" class="held" :aria-label="t.heldBadge">
        <p class="held-head">
          <span class="held-kind">{{ activity(item.activity) }}</span>
          <span v-if="heldMinutes(item)" class="held-dur">{{ heldMinutes(item) }}</span>
          <span class="held-badge"><Icon name="warning" :size="12" />{{ t.heldBadge }}</span>
        </p>
        <p v-if="item.focus || item.description" class="brief"><b v-if="item.focus">{{ item.focus }}</b><span v-if="item.description">{{ item.description }}</span></p>
        <template v-if="editable">
          <p class="note">{{ t.heldNote }}</p>
          <div class="held-acts">
            <SegmentTrack compact :items="sportItems" :model-value="('' as PlanSport)" :aria-label="t.retypeLabel"
              @update:model-value="emit('retype', item.index, $event)" />
            <button type="button" class="pill-button quiet danger" @click="emit('remove', item.index)"><Icon name="trash" :size="13" />{{ bridgeText.deleteDay }}</button>
          </div>
        </template>
      </section>

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
      <p v-else-if="!held.length" class="empty"><Icon name="moon" :size="16" />{{ row.before[0] ? t.wasName(row.before[0].name) : t.noPlanDay }}</p>
      <div v-if="row.rest" class="local-rest"><Icon name="moon" :size="18"/><div><p><span v-if="restTime">{{ bridgeText.bedtime }} {{ restTime }}</span><span v-if="row.rest.sleep_target_seconds != null">{{ bridgeText.sleepTarget }} {{ minutes(Math.round(row.rest.sleep_target_seconds / 60)) }}</span></p><p v-if="row.rest.note">{{ row.rest.note }}</p></div></div>

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
.local-rest { display: flex; gap: 12px; padding: 14px 16px; background: var(--mat-inset); border-radius: 14px; color: var(--muted); font-size: var(--fs-xs); }
.local-rest p { margin: 0; line-height: 1.7; }
.local-rest p:first-child { display: flex; gap: 18px; color: var(--ink); }
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
.issue.warning .tag { color: var(--subtle); }
.issue .msg { min-width: 0; color: var(--muted); overflow-wrap: anywhere; }
.issue .msg b { color: var(--ink); font-weight: 600; }
.issues .note { margin-top: 8px; }
.brief { display: grid; gap: 2px; margin: 6px 0 0; color: var(--muted); font-size: var(--fs-xs); line-height: 1.6; white-space: pre-line; }
.brief b { color: var(--ink); font-weight: 650; }
.pick { margin-top: 4px; }
.held { display: grid; gap: 8px; padding: 14px 16px; border-radius: 16px; background: var(--mat-inset); box-shadow: var(--mat-inset-shadow); }
.held-head { display: flex; flex-wrap: wrap; align-items: center; gap: 4px 12px; margin: 0; font-size: var(--fs-sm); }
.held-kind { color: var(--ink); font-weight: 700; }
.held-dur { color: var(--muted); font-size: var(--fs-xs); font-variant-numeric: tabular-nums; }
.held-badge { display: inline-flex; align-items: center; gap: 5px; margin-left: auto; color: var(--warning); font-size: var(--fs-2xs); font-weight: 650; }
.held-acts { display: flex; flex-wrap: wrap; align-items: center; gap: 8px 12px; }
.held-acts .danger { color: var(--danger); }
@media (max-width: 980px) { .grid { grid-template-columns: minmax(0, 1fr); } }
</style>
