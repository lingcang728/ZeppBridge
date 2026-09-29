<script setup lang="ts">
/* 概览的「今日步数」卡：圆环 + 目标行。 */
import { computed } from 'vue';
import { RouterLink } from 'vue-router';
import Icon from '../Icon.vue';
import GlyphTile from '../GlyphTile.vue';
import { resolvedTheme } from '../../composables/useTheme';
import { chartPalettes } from '../../lib/echartsTheme';
import { formatMetric, formatWhen, isFiniteNumber } from '../../lib/format';
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
    stepsNotYet: '今天的步数还没到云端',
    stepsLatest: (when: string) => `云端最新数据停在${when}`,
    factGoal: '目标',
    factDone: '已完成',
    factLeft: '还差',
    factReached: '已达成',
  },
  {
    stepsPanelAria: 'Open daily activity detail',
    stepsTitle: "Today's steps",
    stepsGoalReference: 'Reference goal',
    stepsGoalToday: "Today's goal",
    stepsUnit: 'steps',
    stepsGoalLine: (goal: string, percent: number) => `Goal ${goal} · ${percent}%`,
    seeMore: 'See more',
    stepsNotYet: "Today's steps haven't reached the cloud yet",
    stepsLatest: (when: string) => `Newest cloud data is from ${when}`,
    factGoal: 'Goal',
    factDone: 'Done',
    factLeft: 'To go',
    factReached: 'Reached',
  },
  {
    stepsPanelAria: 'Abrir el detalle de actividad diaria',
    stepsTitle: 'Pasos de hoy',
    stepsGoalReference: 'Meta de referencia',
    stepsGoalToday: 'Meta de hoy',
    stepsUnit: 'pasos',
    stepsGoalLine: (goal: string, percent: number) => `Meta ${goal} · ${percent}%`,
    seeMore: 'Ver más',
    stepsNotYet: 'Los pasos de hoy aún no han llegado a la nube',
    stepsLatest: (when: string) => `Los datos más recientes en la nube son de ${when}`,
    factGoal: 'Meta',
    factDone: 'Hecho',
    factLeft: 'Faltan',
    factReached: 'Conseguido',
  },
  // moduleId：让 src/i18n/locales/<locale>.ts 的语言包能覆盖这个模块。
  'components/overview/StepsCard',
);
const t = useMessages(messages);

const props = defineProps<{
  steps: number | null;
  goal: number | null;
  /** 库里最新一条样本（任何一种）的时间：今天还没有步数时，告诉用户云端的数据停在哪儿。
      有步数时不拿它当「更新于」——它其实是心率样本的时间，步数没有自己的时刻。 */
  latestAt?: string | null;
}>();
const latestWhen = computed(() => formatWhen(props.latestAt));

const DEFAULT_STEP_GOAL = 10000;
const stepGoal = computed(() =>
  isFiniteNumber(props.goal) && (props.goal ?? 0) > 0 ? props.goal ?? 0 : DEFAULT_STEP_GOAL);
const stepGoalIsReference = computed(() =>
  !(isFiniteNumber(props.goal) && (props.goal ?? 0) > 0));
const stepsPercent = computed(() =>
  props.steps === null ? 0 : Math.min(100, Math.round((props.steps / stepGoal.value) * 100)));

const num = (value: unknown) => isFiniteNumber(value) ? formatMetric(value) : '—';

/* 圆环色按主题取（SVG stroke 属性不吃 CSS var）。 */
const ringColor = computed(() => chartPalettes[resolvedTheme.value].series.readiness);
</script>

<template>
  <RouterLink class="metric-panel steps-panel" to="/activity" :aria-label="t.stepsPanelAria">
    <div class="panel-head">
      <span class="panel-title"><GlyphTile name="steps" :size="38" /><span><strong>{{ t.stepsTitle }}</strong><small>{{ stepGoalIsReference ? t.stepsGoalReference : t.stepsGoalToday }}</small></span></span>
      <span class="panel-go" :title="t.seeMore" aria-hidden="true"><Icon name="chevron-right" :size="16" /></span>
    </div>
    <template v-if="steps !== null">
      <p class="panel-figure"><span class="figure-value">{{ num(steps) }}</span></p>
      <div class="panel-meter" role="img" :aria-label="t.stepsGoalLine(formatMetric(stepGoal), stepsPercent)"><i :style="{ width: `${Math.max(2, stepsPercent)}%`, background: ringColor }"></i></div>
      <!-- 和睡眠卡的分期列表同一种排法：左边是什么，右边多少。 -->
      <ul class="steps-facts">
        <li><span>{{ t.factGoal }}</span><strong>{{ formatMetric(stepGoal) }}</strong></li>
        <li><span>{{ t.factDone }}</span><strong>{{ stepsPercent }}%</strong></li>
        <li><span>{{ t.factLeft }}</span><strong>{{ steps >= stepGoal ? t.factReached : formatMetric(stepGoal - steps) }}</strong></li>
      </ul>
    </template>
    <p v-else class="steps-goal steps-missing">{{ t.stepsNotYet }}<small v-if="latestWhen">{{ t.stepsLatest(latestWhen) }}</small></p>
  </RouterLink>
</template>

<style scoped>
.steps-panel.metric-panel { display: flex; flex-direction: column; height: 100%; min-height: 286px; padding: 18px; }
.steps-goal { margin: 12px 0 0; color: var(--muted); font-size: var(--fs-sm); font-variant-numeric: tabular-nums; }
.steps-facts { display: grid; gap: 9px; margin: 16px 0 0; padding: 0; list-style: none; }
.steps-facts li { display: flex; align-items: center; justify-content: space-between; gap: 8px; color: var(--subtle); font-size: var(--fs-sm); }
.steps-facts strong { color: var(--muted); font-weight: 600; font-variant-numeric: tabular-nums; white-space: nowrap; }
.steps-missing { display: grid; gap: 3px; margin-top: 18px; }
.steps-missing small { color: var(--subtle); font-size: var(--fs-xs); }
</style>
