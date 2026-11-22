<script setup lang="ts">
/**
 * 每日步数柱状图：替换原来的「每小时步数」。
 *
 * 柱子用的是和下面「步数」趋势卡同一份按天总步数（daily_metrics），不再把逐分钟/按小时的记录
 * 重新加总——后者只在有分钟记录的日子才有，平均出来偏低。
 *
 *   - 7 天 / 1 个月：一天一根柱子；
 *   - 6 个月：一周一根柱子（有记录的天的日均），否则 180 根柱子挤不下；
 *   - 虚线 = 范围内有记录的天的日均；没有记录的日子画成一小段空槽，不画成 0。
 */
import { computed, ref } from 'vue';
import { displayDateTimeFormatter, parseDisplayDate } from '../../lib/dateTime';
import { formatNumber } from '../../lib/format';
import { dateSpan, rangeBounds } from '../../lib/hourlySteps';
import { sliceSeries } from '../../lib/metricSeries';
import { periodChange, previousPeriodLabel, trailingMean } from '../../lib/periodDelta';
import { useTrendSmoothing } from '../../composables/useTrendSmoothing';
import { useGoals } from '../../composables/useGoals';
import type { MetricSeries } from '../../types';
import { defineMessages, useMessages } from '../../i18n';

const props = defineProps<{ days: number; series: MetricSeries | null }>();

const messages = defineMessages(
  {
    title: '每日步数',
    perDayUnit: '步 / 天',
    vsPrevious: (span: string) => `对比前一段（${span}）`,
    movingAverage: (window: string) => `${window}均线`,
    goalLabel: (value: string) => `目标 ${value}`,
    days7: '7 天',
    weeks4: '4 周',
    averageNote: (days: number) => `按有记录的 ${days} 天平均`,
    weeklyNote: (days: number) => `每根柱子是一周的日均 · 共 ${days} 天有记录`,
    best: (day: string, steps: string) => `最多：${day}，${steps} 步`,
    total: (steps: string) => `合计 ${steps} 步`,
    dayTitle: (day: string, steps: string) => `${day}：${steps} 步`,
    weekTitle: (day: string, steps: string) => `${day} 起一周：日均 ${steps} 步`,
    noRecord: (day: string) => `${day}：没有记录`,
    average: '日均',
    empty: '这段范围还没有按天的步数。',
    aria: '每天的步数',
  },
  {
    title: 'Daily steps',
    perDayUnit: 'steps / day',
    vsPrevious: (span: string) => `vs the previous period (${span})`,
    movingAverage: (window: string) => `${window} average`,
    goalLabel: (value: string) => `Goal ${value}`,
    days7: '7-day',
    weeks4: '4-week',
    averageNote: (days: number) => `Averaged over the ${days} days with records`,
    weeklyNote: (days: number) => `Each bar is a week's daily average · ${days} days with records`,
    best: (day: string, steps: string) => `Best: ${day}, ${steps} steps`,
    total: (steps: string) => `${steps} steps in total`,
    dayTitle: (day: string, steps: string) => `${day}: ${steps} steps`,
    weekTitle: (day: string, steps: string) => `Week of ${day}: ${steps} steps a day`,
    noRecord: (day: string) => `${day}: nothing recorded`,
    average: 'Avg',
    empty: 'No daily steps in this range yet.',
    aria: 'Steps for each day',
  },
  {
    title: 'Pasos por día',
    perDayUnit: 'pasos / día',
    vsPrevious: (span: string) => `frente al periodo anterior (${span})`,
    movingAverage: (window: string) => `Media de ${window}`,
    goalLabel: (value: string) => `Objetivo ${value}`,
    days7: '7 días',
    weeks4: '4 semanas',
    averageNote: (days: number) => `Promedio de los ${days} días con registros`,
    weeklyNote: (days: number) => `Cada barra es el promedio diario de una semana · ${days} días con registros`,
    best: (day: string, steps: string) => `Mejor día: ${day}, ${steps} pasos`,
    total: (steps: string) => `${steps} pasos en total`,
    dayTitle: (day: string, steps: string) => `${day}: ${steps} pasos`,
    weekTitle: (day: string, steps: string) => `Semana del ${day}: ${steps} pasos al día`,
    noRecord: (day: string) => `${day}: sin registro`,
    average: 'Media',
    empty: 'Todavía no hay pasos diarios en este rango.',
    aria: 'Pasos de cada día',
  },
  'components/activity/DailyStepsCard',
);
const t = useMessages(messages);

interface Bar {
  start: string;
  /** 一天时是那天的步数；一周时是有记录的天的日均；没有记录是 null。 */
  steps: number | null;
  covered: number;
  total: number;
  label: string;
}

const perWeek = computed(() => props.days > 35);
const bounds = computed(() => rangeBounds(props.days));
const shortDay = (date: string) => displayDateTimeFormatter({ month: 'numeric', day: 'numeric' }).format(parseDisplayDate(date));
const weekdayDay = (date: string) => displayDateTimeFormatter({ weekday: 'short', day: 'numeric' }).format(parseDisplayDate(date));
const fullDay = (date: string) => displayDateTimeFormatter({ weekday: 'short', month: 'short', day: 'numeric' }).format(parseDisplayDate(date));

const byDate = computed(() => new Map((props.series?.points ?? []).map((point) => [point.date, point.value])));

const bars = computed<Bar[]>(() => {
  const dates = dateSpan(bounds.value.start, bounds.value.end);
  const size = perWeek.value ? 7 : 1;
  const out: Bar[] = [];
  // 从最后一天往回切：最右边那根以今天结尾，和每小时那张热力图一致。
  for (let end = dates.length; end > 0; end -= size) {
    const chunk = dates.slice(Math.max(0, end - size), end);
    const values = chunk.map((date) => byDate.value.get(date)).filter((value): value is number => typeof value === 'number');
    const total = values.reduce((sum, value) => sum + value, 0);
    const start = chunk[0]!;
    out.unshift({
      start,
      steps: values.length ? total / values.length : null,
      covered: values.length,
      total,
      label: perWeek.value ? shortDay(start) : props.days <= 7 ? weekdayDay(start) : shortDay(start),
    });
  }
  return out;
});

const recorded = computed(() => (props.series?.points ?? [])
  .filter((point) => point.date >= bounds.value.start && point.date <= bounds.value.end));
const recordedDays = computed(() => recorded.value.length);
const total = computed(() => recorded.value.reduce((sum, point) => sum + point.value, 0));
const average = computed(() => (recordedDays.value ? total.value / recordedDays.value : null));
const best = computed(() => recorded.value.reduce<{ date: string; value: number } | null>(
  (top, point) => (!top || point.value > top.value ? point : top), null));

/* 个人目标（概览「目标」卡里设的）：画成一条线；达到目标的柱子上一层强调色。纵轴要把目标线也装下。 */
const goal = computed(() => useGoals().value.stepsPerDay);
const peak = computed(() => Math.max(1, goal.value ?? 0, ...bars.value.map((bar) => bar.steps ?? 0)));
const goalHeight = computed(() => (goal.value ? Math.min(100, (goal.value / peak.value) * 100) : null));
const reached = (steps: number | null) => goal.value !== null && steps !== null && steps >= goal.value;
const heightOf = (steps: number | null) => (steps === null ? 0 : Math.max(3, Math.round((steps / peak.value) * 100)));
/* 和紧挨着的前一段比日均（前一段读数太少就不比）。 */
const delta = computed(() => {
  if (!props.series) return null;
  const sliced = sliceSeries(props.series, props.days);
  return periodChange(sliced.average, sliced.previous_average, 'steps');
});
/* 移动平均折线（顶部「均线」开关）：一天一根柱子时取 7 天，一周一根时取 4 周。 */
const smooth = useTrendSmoothing();
const maWindow = computed(() => (perWeek.value ? 4 : 7));
const maPoints = computed(() => {
  if (!smooth.value) return '';
  const means = trailingMean(bars.value.map((bar) => bar.steps), maWindow.value);
  const count = bars.value.length;
  const parts: string[] = [];
  means.forEach((value, index) => {
    if (value === null) return;
    const x = ((index + 0.5) / count) * 100;
    const y = 100 - Math.min(100, (value / peak.value) * 100);
    parts.push(`${x.toFixed(2)},${y.toFixed(2)}`);
  });
  return parts.length > 1 ? parts.join(' ') : '';
});
const averageHeight = computed(() => (average.value === null ? null : Math.min(100, (average.value / peak.value) * 100)));

const labelEvery = computed(() => (props.days <= 7 ? 1 : perWeek.value ? 4 : 5));
const format = (value: number) => formatNumber(Math.round(value));
const textOf = (bar: Bar) => {
  if (bar.steps === null) return t.value.noRecord(perWeek.value ? shortDay(bar.start) : fullDay(bar.start));
  return perWeek.value
    ? t.value.weekTitle(shortDay(bar.start), format(bar.steps))
    : t.value.dayTitle(fullDay(bar.start), format(bar.steps));
};

const hovered = ref<string | null>(null);
const hoverText = computed(() => {
  const bar = bars.value.find((item) => item.start === hovered.value);
  return bar ? textOf(bar) : '';
});
</script>

<template>
  <section class="daily-card" :aria-label="t.title">
    <header>
      <strong>{{ t.title }}</strong>
      <small>{{ perWeek ? t.weeklyNote(recordedDays) : t.averageNote(recordedDays) }}</small>
    </header>
    <p v-if="!recordedDays" class="daily-empty">{{ t.empty }}</p>
    <template v-else>
      <p class="daily-facts">
        <b>{{ format(average ?? 0) }}</b> {{ t.perDayUnit }}
        <span v-if="best"> · {{ t.best(fullDay(best.date), format(best.value)) }}</span>
        <span> · {{ t.total(format(total)) }}</span>
        <span v-if="delta"> · <em :class="['delta', `delta-${delta.tone}`]">{{ delta.text }}</em> {{ t.vsPrevious(previousPeriodLabel(days)) }}</span>
      </p>
      <p class="daily-hover" aria-hidden="true">{{ hoverText || ' ' }}</p>
      <div class="daily-plot" :style="{ '--n': bars.length }">
        <ol class="daily-bars" role="list" :aria-label="t.aria" @pointerleave="hovered = null">
          <li
            v-for="(bar, index) in bars"
            :key="bar.start"
            :aria-label="textOf(bar)"
            @pointerenter="hovered = bar.start"
          >
            <span :class="['bar', { empty: bar.steps === null, hot: hovered === bar.start, met: reached(bar.steps) }]" :style="{ height: `${heightOf(bar.steps)}%` }" />
            <small v-if="index % labelEvery === (bars.length - 1) % labelEvery">{{ bar.label }}</small>
          </li>
        </ol>
        <svg v-if="maPoints" class="daily-ma" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
          <polyline :points="maPoints" vector-effect="non-scaling-stroke" />
        </svg>
        <span v-if="maPoints" class="daily-ma-key" aria-hidden="true">{{ t.movingAverage(perWeek ? t.weeks4 : t.days7) }}</span>
        <span v-if="goalHeight !== null" class="daily-goal" :style="{ bottom: `calc(18px + (100% - 18px) * ${goalHeight / 100})` }" aria-hidden="true">
          <em>{{ t.goalLabel(format(goal ?? 0)) }}</em>
        </span>
        <span v-if="averageHeight !== null" class="daily-avg" :style="{ bottom: `calc(18px + (100% - 18px) * ${averageHeight / 100})` }" aria-hidden="true">
          <em>{{ t.average }} {{ format(average ?? 0) }}</em>
        </span>
      </div>
    </template>
  </section>
</template>

<style scoped>
/* 极简：平面卡片、细描边、无阴影；柱子是中性灰，强调色只给「悬停的那根」和日均虚线。 */
.daily-card { position: relative; display: grid; gap: 14px; padding: 20px 22px; border-radius: var(--radius-lg); background: var(--mat-card); box-shadow: var(--mat-rim); }
header { display: grid; gap: 2px; }
header strong { font-size: var(--fs-sm); font-weight: 600; }
header small, .daily-empty { color: var(--subtle); font-size: var(--fs-xs); }
.daily-empty { margin: 0; padding: 22px 0; text-align: center; }
.daily-facts { margin: 0; color: var(--muted); font-size: var(--fs-xs); }
.daily-facts b { color: var(--ink); font-size: 30px; font-weight: 600; letter-spacing: -0.02em; font-variant-numeric: tabular-nums; }
.daily-hover { margin: 0; min-height: 1.4em; color: var(--ink); font-size: var(--fs-xs); font-variant-numeric: tabular-nums; }
.daily-plot { position: relative; width: min(100%, calc(var(--n) * 64px)); }
.daily-ma { position: absolute; top: 0; right: 0; bottom: 18px; left: 0; width: 100%; height: calc(100% - 18px); overflow: visible; pointer-events: none; }
.daily-ma polyline { fill: none; stroke: var(--ink); stroke-width: 1.6; stroke-linejoin: round; stroke-linecap: round; }
.daily-ma-key { position: absolute; top: -14px; left: 0; color: var(--muted); font-size: 10px; }
.daily-bars { display: grid; grid-template-columns: repeat(var(--n), minmax(0, 1fr)); align-items: end; gap: clamp(2px, 0.6vw, 8px); height: 160px; margin: 0; padding: 0 0 18px; list-style: none; }
.daily-bars li { position: relative; display: flex; align-items: flex-end; height: 100%; }
.bar { width: 100%; border-radius: 2px 2px 0 0; background: color-mix(in srgb, var(--ink) 22%, transparent); transition: height 420ms var(--ease-out), background-color 120ms ease; }
.bar.met { background: color-mix(in srgb, var(--accent) 45%, transparent); }
.bar.hot { background: var(--accent); }
.daily-goal { position: absolute; left: 0; right: 0; height: 0; border-top: 1px solid color-mix(in srgb, var(--accent) 70%, transparent); pointer-events: none; }
.daily-goal em { position: absolute; left: 0; bottom: 3px; color: var(--accent); font-size: 10px; font-style: normal; font-variant-numeric: tabular-nums; }
.bar.empty { height: 1px !important; background: color-mix(in srgb, var(--ink) 12%, transparent); }
.daily-bars small { position: absolute; bottom: -18px; left: 50%; transform: translateX(-50%); color: var(--subtle); font-size: 10px; font-variant-numeric: tabular-nums; white-space: nowrap; }
.daily-avg { position: absolute; left: 0; right: 0; height: 0; border-top: 1px dashed var(--accent); pointer-events: none; }
.daily-avg em { position: absolute; right: 0; bottom: 3px; color: var(--accent); font-size: 10px; font-style: normal; font-variant-numeric: tabular-nums; }
</style>
