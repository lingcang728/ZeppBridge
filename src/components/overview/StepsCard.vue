<script setup lang="ts">
/* 概览的「今日步数」卡：圆环 + 目标行。 */
import { computed } from 'vue';
import { RouterLink } from 'vue-router';
import Icon from '../Icon.vue';
import GlyphTile from '../GlyphTile.vue';
import { metricColor } from '../../lib/metricTone';
import { formatMetric, formatWhen, isFiniteNumber } from '../../lib/format';
import { displayDateTimeFormatter, parseDisplayDate } from '../../lib/dateTime';
import type { MetricSeriesPoint } from '../../types';
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
    weekTitle: '近 7 天',
    weekAria: '近 7 天每天的步数，虚线是目标',
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
    weekTitle: 'Last 7 days',
    weekAria: 'Steps on each of the last 7 days; the dashed line is the goal',
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
    weekTitle: 'Últimos 7 días',
    weekAria: 'Pasos de cada uno de los últimos 7 días; la línea discontinua es la meta',
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
  /** 近 7 天每天的步数（只含有记录的日子）：卡片下沿一排小柱，不再空着半张卡。 */
  week?: MetricSeriesPoint[];
}>();
const latestWhen = computed(() => formatWhen(props.latestAt));

const weekBars = computed(() => {
  const points = (props.week ?? []).filter((point) => isFiniteNumber(point.value));
  if (points.length < 2) return [];
  const top = Math.max(stepGoal.value, ...points.map((point) => point.value));
  const formatDay = displayDateTimeFormatter({ weekday: 'narrow' });
  return points.slice(-7).map((point) => ({
    key: point.date,
    height: Math.max(4, Math.round((point.value / top) * 100)),
    reached: point.value >= stepGoal.value,
    day: formatDay.format(parseDisplayDate(`${point.date}T12:00:00`)),
    title: `${point.date} · ${formatMetric(point.value)}`,
  }));
});
const goalLine = computed(() => {
  const points = (props.week ?? []).filter((point) => isFiniteNumber(point.value));
  const top = Math.max(stepGoal.value, ...points.map((point) => point.value));
  return Math.round((stepGoal.value / top) * 100);
});

const DEFAULT_STEP_GOAL = 10000;
const stepGoal = computed(() =>
  isFiniteNumber(props.goal) && (props.goal ?? 0) > 0 ? props.goal ?? 0 : DEFAULT_STEP_GOAL);
const stepGoalIsReference = computed(() =>
  !(isFiniteNumber(props.goal) && (props.goal ?? 0) > 0));
const stepsPercent = computed(() =>
  props.steps === null ? 0 : Math.min(100, Math.round((props.steps / stepGoal.value) * 100)));

const num = (value: unknown) => isFiniteNumber(value) ? formatMetric(value) : '—';

/* 步数在哪儿都是同一个颜色（lib/metricTone.ts）：圆环、针脚、日常活动页那条线。
   以前圆环拿的是准备度的颜色，磁贴和详情页又是另一个，三处三个色。 */
const ringColor = computed(() => metricColor('steps'));
</script>

<template>
  <!-- 今天还没有步数（包括第一次同步之前）时不提任何目标：「参考目标 10,000」会让人以为已经有数据了。 -->
  <RouterLink class="metric-panel steps-panel" to="/activity" :aria-label="t.stepsPanelAria">
    <div class="panel-head">
      <span class="panel-title"><GlyphTile name="steps" :size="38" /><span><strong>{{ t.stepsTitle }}</strong><small v-if="steps !== null">{{ stepGoalIsReference ? t.stepsGoalReference : t.stepsGoalToday }}</small></span></span>
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
      <div v-if="weekBars.length" class="steps-week" role="img" :aria-label="t.weekAria">
        <span class="steps-week-head">{{ t.weekTitle }}</span>
        <div class="steps-week-bars" :style="{ '--goal': goalLine, '--tone': ringColor }">
          <span v-for="bar in weekBars" :key="bar.key" class="steps-week-col" :title="bar.title">
            <i :class="{ 'is-reached': bar.reached }" :style="{ height: `${bar.height}%` }"></i>
            <small>{{ bar.day }}</small>
          </span>
        </div>
      </div>
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
/* 近 7 天：排在卡片下沿（margin-top: auto），和旁边那张卡的底边齐平；虚线是目标。 */
.steps-week { display: grid; gap: 8px; margin-top: auto; padding-top: 16px; }
.steps-week-head { color: var(--subtle); font-size: var(--fs-2xs); }
.steps-week-bars { position: relative; display: grid; grid-auto-flow: column; grid-auto-columns: minmax(0, 1fr); gap: 6px; height: 72px; }
.steps-week-bars::before {
  content: ''; position: absolute; right: 0; bottom: calc(16px + (100% - 16px) * var(--goal) / 100); left: 0;
  border-top: 1px dashed color-mix(in srgb, var(--ink) 20%, transparent); pointer-events: none;
}
.steps-week-col { display: grid; grid-template-rows: minmax(0, 1fr) 16px; justify-items: center; align-items: end; min-width: 0; height: 100%; }
.steps-week-col i { display: block; width: min(16px, 100%); border-radius: 5px 5px 3px 3px; background: color-mix(in srgb, var(--tone) 36%, transparent); }
.steps-week-col i.is-reached { background: var(--tone); }
.steps-week-col small { color: var(--subtle); font-size: var(--fs-2xs); line-height: 16px; }
.steps-missing { display: grid; gap: 3px; margin-top: 18px; }
.steps-missing small { color: var(--subtle); font-size: var(--fs-xs); }
</style>
