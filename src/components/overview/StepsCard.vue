<script setup lang="ts">
/* 概览的「今日步数」卡：圆环 + 目标行。 */
import { computed } from 'vue';
import { RouterLink } from 'vue-router';
import CircularProgress from '../CircularProgress.vue';
import DesignIcon from '../DesignIcon.vue';
import { resolvedTheme } from '../../composables/useTheme';
import { chartPalettes } from '../../lib/echartsTheme';
import { formatMetric, isFiniteNumber } from '../../lib/format';
import { defineMessages, useMessages } from '../../i18n';

defineOptions({ name: 'OverviewStepsCard' });

const messages = defineMessages(
  {
    stepsPanelAria: '打开日常活动详情',
    stepsTitle: '今日步数',
    stepsGoalReference: '参考目标',
    stepsGoalToday: '今日目标',
    stepsUnit: '步',
    stepsGoalLine: (goal: string, percent: number) => `目标 ${goal} · ${percent}%`,
    seeMore: '看更多',
  },
  {
    stepsPanelAria: 'Open daily activity detail',
    stepsTitle: "Today's steps",
    stepsGoalReference: 'Reference goal',
    stepsGoalToday: "Today's goal",
    stepsUnit: 'steps',
    stepsGoalLine: (goal: string, percent: number) => `Goal ${goal} · ${percent}%`,
    seeMore: 'See more',
  },
  {
    stepsPanelAria: 'Abrir el detalle de actividad diaria',
    stepsTitle: 'Pasos de hoy',
    stepsGoalReference: 'Meta de referencia',
    stepsGoalToday: 'Meta de hoy',
    stepsUnit: 'pasos',
    stepsGoalLine: (goal: string, percent: number) => `Meta ${goal} · ${percent}%`,
    seeMore: 'Ver más',
  },
);
const t = useMessages(messages);

const props = defineProps<{
  steps: number | null;
  goal: number | null;
}>();

const DEFAULT_STEP_GOAL = 10000;
const stepGoal = computed(() =>
  isFiniteNumber(props.goal) && (props.goal ?? 0) > 0 ? props.goal ?? 0 : DEFAULT_STEP_GOAL);
const stepGoalIsReference = computed(() =>
  !(isFiniteNumber(props.goal) && (props.goal ?? 0) > 0));
const stepsPercent = computed(() =>
  props.steps === null ? 0 : Math.min(100, Math.round((props.steps / stepGoal.value) * 100)));

const num = (value: unknown) => isFiniteNumber(value) ? formatMetric(value) : '—';

/* 圆环色按主题取（SVG stroke 属性不吃 CSS var）。 */
const resolvedTrack = (hex: string) => {
  const parsed = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!parsed) return 'var(--line)';
  const int = Number.parseInt(parsed[1], 16);
  return `rgba(${(int >> 16) & 255}, ${(int >> 8) & 255}, ${int & 255}, .16)`;
};
const ringColor = computed(() => chartPalettes[resolvedTheme.value].series.readiness);
const ringTrack = computed(() => resolvedTrack(ringColor.value));
</script>

<template>
  <RouterLink class="metric-panel steps-panel" to="/activity" :aria-label="t.stepsPanelAria">
    <div class="panel-head"><span class="panel-title"><DesignIcon name="steps" :size="34" /><span><strong>{{ t.stepsTitle }}</strong><small>{{ stepGoalIsReference ? t.stepsGoalReference : t.stepsGoalToday }}</small></span></span></div>
    <div class="steps-content">
      <CircularProgress :value="stepsPercent" :size="148" :stroke-width="9" :color="ringColor" :track-color="ringTrack" :show-label="false">
        <div class="steps-inring">
          <strong>{{ num(steps) }}</strong>
          <span>{{ t.stepsUnit }}</span>
        </div>
      </CircularProgress>
      <p class="steps-goal">{{ t.stepsGoalLine(formatMetric(stepGoal), stepsPercent) }}</p>
    </div>
    <span class="panel-more">{{ t.seeMore }} <DesignIcon name="chevron-right" :size="18" /></span>
  </RouterLink>
</template>

<style scoped>
.steps-panel { grid-column: span 3; min-height: 286px; padding: 18px; }
.steps-content { display: grid; min-height: 220px; place-items: center; align-content: center; gap: 14px; }
.steps-inring { display: grid; justify-items: center; gap: 8px; max-width: 116px; }
.steps-inring strong { color: var(--ink); font-family: 'Inter', var(--font-sans); font-size: 30px; font-weight: 600; letter-spacing: -.04em; font-variant-numeric: tabular-nums; line-height: 1; }
.steps-inring span { color: var(--subtle); font-size: var(--fs-xs); }
.steps-goal { margin: 0; color: var(--muted); font-size: var(--fs-sm); font-variant-numeric: tabular-nums; }
@media (max-width: 1180px) { .steps-panel { grid-column: span 4; } }
@media (max-width: 820px) { .steps-panel { grid-column: 1; } }
</style>
