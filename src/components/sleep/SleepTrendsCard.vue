<script setup lang="ts">
/**
 * 睡眠随时间：两种看法。
 *   - 时长：每晚一根柱子，按分期叠起来（深睡 / 浅睡 / REM / 清醒），7–9 小时的参考带画在背后；
 *   - 规律：每晚一根悬空的柱子，从入睡画到起床。柱子左右对齐、上下起点一致就是作息规律，
 *     参差不齐就是不规律；下面给入睡时刻的波动（标准差）。
 * 范围跟着页面的全局趋势范围走；超过 90 晚时一周合成一根（取平均），否则几百根柱子挤不下。
 * 没有记录的晚上是空位，不画成 0 小时。
 */
import { computed, onMounted, ref } from 'vue';
import { useRevisionReload } from '../../composables/useRevisionReload';
import { useTrendRange } from '../../composables/useTrendRange';
import { isDesktop } from '../../lib/bridge';
import { displayDateTimeFormatter, parseDisplayDate } from '../../lib/dateTime';
import { formatDuration } from '../../lib/format';
import { rangeBounds } from '../../lib/hourlySteps';
import { periodChange, previousPeriodLabel, trailingMean } from '../../lib/periodDelta';
import { useTrendSmoothing } from '../../composables/useTrendSmoothing';
import { useGoals } from '../../composables/useGoals';
import { localDateString } from '../../lib/format';
import { pageQuery } from '../../lib/pageQueries';
import { cached } from '../../lib/readCache';
import { averageBedtime, averageMinutes, averageWake, bedtimeSpread, clockText, sleepNights, type SleepNight } from '../../lib/sleepTrends';
import { mondayOf } from '../../lib/weeklyVolume';
import type { SleepSession } from '../../types';
import { defineMessages, useMessages } from '../../i18n';

const messages = defineMessages(
  {
    title: '睡眠趋势',
    duration: '时长',
    regularity: '规律',
    stages: '分期',
    vsPrevious: (span: string) => `对比前一段（${span}）`,
    movingAverage: (window: string) => `${window}均线`,
    goalLabel: (value: string) => `目标 ${value}`,
    days7: '7 晚',
    weeks4: '4 周',
    stageShare: '各期占比（有分期数据的夜晚）',
    noStages: '这段范围没有分期数据。',
    stageDeltaNote: (span: string) => `箭头是各期平均时长相对前一段（${span}）的变化`,
    average: (value: string) => `平均 ${value}`,
    nights: (count: number) => `${count} 晚有记录`,
    target: '7–9 小时',
    deep: '深睡',
    light: '浅睡',
    rem: 'REM',
    awake: '清醒',
    unstaged: '未分期',
    bedtime: (value: string) => `平均入睡 ${value}`,
    wake: (value: string) => `平均起床 ${value}`,
    spread: (minutes: number) => `入睡时刻波动 ±${minutes} 分钟`,
    weekAvg: '每根柱子是一周的平均',
    nightTitle: (day: string, duration: string) => `${day}：${duration}`,
    windowTitle: (day: string, bed: string, wake: string) => `${day}：${bed} – ${wake}`,
    empty: '这段范围还没有睡眠记录。',
    aria: '每晚的睡眠',
  },
  {
    title: 'Sleep over time',
    duration: 'Duration',
    regularity: 'Regularity',
    stages: 'Stages',
    vsPrevious: (span: string) => `vs the previous period (${span})`,
    movingAverage: (window: string) => `${window} average`,
    goalLabel: (value: string) => `Goal ${value}`,
    days7: '7-night',
    weeks4: '4-week',
    stageShare: 'Share of each stage (nights with stage data)',
    noStages: 'No stage data in this range.',
    stageDeltaNote: (span: string) => `Arrows show the change in each stage's average against the previous period (${span})`,
    average: (value: string) => `${value} on average`,
    nights: (count: number) => `${count} nights with records`,
    target: '7–9 h',
    deep: 'Deep',
    light: 'Light',
    rem: 'REM',
    awake: 'Awake',
    unstaged: 'Not staged',
    bedtime: (value: string) => `Average bedtime ${value}`,
    wake: (value: string) => `Average wake-up ${value}`,
    spread: (minutes: number) => `Bedtime varies by ±${minutes} min`,
    weekAvg: 'Each bar is a weekly average',
    nightTitle: (day: string, duration: string) => `${day}: ${duration}`,
    windowTitle: (day: string, bed: string, wake: string) => `${day}: ${bed} – ${wake}`,
    empty: 'No sleep records in this range yet.',
    aria: 'Sleep for each night',
  },
  {
    title: 'Sueño en el tiempo',
    duration: 'Duración',
    regularity: 'Regularidad',
    stages: 'Fases',
    vsPrevious: (span: string) => `frente al periodo anterior (${span})`,
    movingAverage: (window: string) => `Media de ${window}`,
    goalLabel: (value: string) => `Objetivo ${value}`,
    days7: '7 noches',
    weeks4: '4 semanas',
    stageShare: 'Proporción de cada fase (noches con datos de fases)',
    noStages: 'No hay datos de fases en este rango.',
    stageDeltaNote: (span: string) => `Las flechas indican el cambio de la media de cada fase frente al periodo anterior (${span})`,
    average: (value: string) => `${value} de media`,
    nights: (count: number) => `${count} noches con registro`,
    target: '7–9 h',
    deep: 'Profundo',
    light: 'Ligero',
    rem: 'REM',
    awake: 'Despierto',
    unstaged: 'Sin fases',
    bedtime: (value: string) => `Hora media de acostarte ${value}`,
    wake: (value: string) => `Hora media de levantarte ${value}`,
    spread: (minutes: number) => `La hora de acostarte varía ±${minutes} min`,
    weekAvg: 'Cada barra es la media de una semana',
    nightTitle: (day: string, duration: string) => `${day}: ${duration}`,
    windowTitle: (day: string, bed: string, wake: string) => `${day}: ${bed} – ${wake}`,
    empty: 'Todavía no hay registros de sueño en este rango.',
    aria: 'Sueño de cada noche',
  },
  'components/sleep/SleepTrendsCard',
);
const t = useMessages(messages);

const range = useTrendRange();
const view = ref<'duration' | 'stages' | 'regularity'>('duration');
const smooth = useTrendSmoothing();
const sessions = ref<SleepSession[]>([]);
const loaded = ref(false);

let seq = 0;
const load = async () => {
  if (!isDesktop()) { loaded.value = true; return; }
  const mine = ++seq;
  try {
    const next = await cached(pageQuery.recentSleep(500));
    if (mine !== seq) return;
    sessions.value = next;
  } catch {
    // 读不出来就当没有记录：卡片自己说「还没有记录」。
  } finally {
    if (mine === seq) loaded.value = true;
  }
};
onMounted(() => { void load(); });
useRevisionReload(() => { void load(); });

const nights = computed(() => {
  const { start, end } = rangeBounds(range.value);
  return sleepNights(sessions.value, start, end);
});

interface Bucket {
  key: string;
  count: number;
  minutes: number;
  stages: { deep: number; light: number; rem: number; awake: number };
  bedtime: number;
  wake: number;
}
const avg = (values: number[]) => values.reduce((sum, value) => sum + value, 0) / (values.length || 1);
const bucketOf = (key: string, group: SleepNight[]): Bucket => ({
  key,
  count: group.length,
  minutes: avg(group.map((night) => night.minutes)),
  stages: {
    deep: avg(group.map((night) => night.deep ?? 0)),
    light: avg(group.map((night) => night.light ?? 0)),
    rem: avg(group.map((night) => night.rem ?? 0)),
    awake: avg(group.map((night) => night.awake ?? 0)),
  },
  bedtime: avg(group.map((night) => night.bedtime)),
  wake: avg(group.map((night) => night.wake)),
});
const weekly = computed(() => nights.value.length > 90);
const buckets = computed<Bucket[]>(() => {
  if (!weekly.value) return nights.value.map((night) => bucketOf(night.date, [night]));
  const groups = new Map<string, SleepNight[]>();
  for (const night of nights.value) {
    const key = mondayOf(parseDisplayDate(night.date));
    groups.set(key, [...(groups.get(key) ?? []), night]);
  }
  return [...groups.entries()].map(([key, group]) => bucketOf(key, group));
});

/* 前一段（紧挨着、一样长）的夜晚：用来和这一段比平均时长、各期分钟数。读数不到这一段的一半就不比。 */
const previousNights = computed(() => {
  const { start } = rangeBounds(range.value);
  const prior = rangeBounds(range.value * 2);
  const [y, m, d] = start.split('-').map(Number);
  const end = localDateString(new Date(y!, m! - 1, d! - 1));
  const list = sleepNights(sessions.value, prior.start, end);
  return list.length >= 2 && list.length >= Math.ceil(nights.value.length / 2) ? list : [];
});
const meanOf = (list: SleepNight[], pick: (night: SleepNight) => number | null): number | null => {
  const values = list.map(pick).filter((value): value is number => value !== null);
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
};
const previousSpan = computed(() => previousPeriodLabel(range.value));
const durationDelta = computed(() => periodChange(
  meanOf(nights.value, (night) => night.minutes),
  previousNights.value.length ? meanOf(previousNights.value, (night) => night.minutes) : null,
  'sleep_duration',
));

const STAGES = ['deep', 'light', 'rem', 'awake'] as const;
const stageMinutes = (night: SleepNight, key: (typeof STAGES)[number]) => night[key];
const hasStages = (night: SleepNight) => STAGES.some((key) => (stageMinutes(night, key) ?? 0) > 0);
const stagedNights = computed(() => nights.value.filter(hasStages));
const stageFacts = computed(() => {
  const previous = previousNights.value.filter(hasStages);
  const totals = STAGES.map((key) => meanOf(stagedNights.value, (night) => stageMinutes(night, key) ?? 0) ?? 0);
  const sum = totals.reduce((acc, value) => acc + value, 0);
  return STAGES.map((key, index) => ({
    key,
    minutes: totals[index]!,
    percent: sum > 0 ? Math.round((totals[index]! / sum) * 100) : 0,
    delta: previous.length >= 2 ? periodChange(totals[index], meanOf(previous, (night) => stageMinutes(night, key) ?? 0), key) : null,
  }));
});
/* 分期视图：每晚一根满高的柱子，按各期占当晚分期总分钟的比例叠起来；没有分期数据的夜晚是空位。 */
const stageBars = computed(() => buckets.value.map((bucket) => {
  const total = bucket.stages.deep + bucket.stages.light + bucket.stages.rem + bucket.stages.awake;
  return {
    key: bucket.key,
    bucket,
    empty: total <= 0,
    parts: STAGES.map((key) => ({ key, share: total > 0 ? (bucket.stages[key] / total) * 100 : 0 })).filter((part) => part.share > 0),
  };
}));

/* 移动平均折线（时长视图）：一晚一根柱子取 7 晚，一周一根取 4 周。 */
const maPoints = computed(() => {
  if (!smooth.value || view.value !== 'duration') return '';
  const means = trailingMean(buckets.value.map((bucket) => bucket.minutes), weekly.value ? 4 : 7);
  const count = buckets.value.length;
  const parts: string[] = [];
  means.forEach((value, index) => {
    if (value === null) return;
    parts.push(`${(((index + 0.5) / count) * 100).toFixed(2)},${(100 - Math.min(100, (value / topMinutes.value) * 100)).toFixed(2)}`);
  });
  return parts.length > 1 ? parts.join(' ') : '';
});

const averageText = computed(() => {
  const value = averageMinutes(nights.value);
  return value === null ? '' : formatDuration(Math.round(value));
});
const spread = computed(() => bedtimeSpread(nights.value));
const bedAvg = computed(() => averageBedtime(nights.value));
const wakeAvg = computed(() => averageWake(nights.value));

/* —— 时长：纵轴 0 到「最长那晚（至少 9 小时）」。 */
const goalMinutes = computed(() => {
  const hours = useGoals().value.sleepHours;
  return hours ? hours * 60 : null;
});
const topMinutes = computed(() => Math.max(9 * 60, goalMinutes.value ?? 0, ...buckets.value.map((bucket) => bucket.minutes)));
const goalStyle = computed(() => (goalMinutes.value ? { bottom: `calc(18px + (100% - 18px) * ${goalMinutes.value / topMinutes.value})` } : null));
const bandStyle = computed(() => ({
  bottom: `calc(18px + (100% - 18px) * ${7 * 60 / topMinutes.value})`,
  height: `calc((100% - 18px) * ${2 * 60 / topMinutes.value})`,
}));
const durationBars = computed(() => buckets.value.map((bucket) => {
  const staged = bucket.stages.deep + bucket.stages.light + bucket.stages.rem + bucket.stages.awake;
  const parts = [
    { key: 'deep', minutes: bucket.stages.deep },
    { key: 'light', minutes: bucket.stages.light },
    { key: 'rem', minutes: bucket.stages.rem },
    { key: 'awake', minutes: bucket.stages.awake },
  ];
  // 没有分期数据的晚上整根画成一种中性色（「未分期」），不假装知道分期。
  if (staged <= 0) parts.splice(0, parts.length, { key: 'unstaged', minutes: bucket.minutes });
  return { key: bucket.key, height: (bucket.minutes / topMinutes.value) * 100, bucket, parts: parts.filter((part) => part.minutes > 0).map((part) => ({ ...part, share: (part.minutes / Math.max(1, parts.reduce((sum, item) => sum + item.minutes, 0))) * 100 })) };
}));

/* —— 规律：纵轴 20:00 到次日 12:00，从上到下是晚到早。 */
const AXIS_START = 20 * 60;
const AXIS_SPAN = 16 * 60;
const windowBars = computed(() => buckets.value.map((bucket) => {
  const wake = bucket.wake < bucket.bedtime - 300 ? bucket.wake + 1440 : bucket.wake;
  const top = Math.min(100, Math.max(0, ((bucket.bedtime - AXIS_START) / AXIS_SPAN) * 100));
  const bottom = Math.min(100, Math.max(top + 2, ((wake - AXIS_START) / AXIS_SPAN) * 100));
  return { key: bucket.key, top, height: bottom - top, bucket };
}));
const axisTicks = [20, 24, 28, 32, 36].map((hour) => ({ label: clockText(hour * 60), top: ((hour * 60 - AXIS_START) / AXIS_SPAN) * 100 }));

const shortDay = (date: string) => displayDateTimeFormatter({ month: 'numeric', day: 'numeric' }).format(parseDisplayDate(date));
const labelEvery = computed(() => (buckets.value.length > 40 ? 8 : buckets.value.length > 20 ? 4 : buckets.value.length > 10 ? 2 : 1));
const hovered = ref<string | null>(null);
const hoverText = computed(() => {
  const bucket = buckets.value.find((item) => item.key === hovered.value);
  if (!bucket) return '';
  const day = weekly.value ? `${shortDay(bucket.key)}+` : shortDay(bucket.key);
  if (view.value === 'stages') {
    const total = bucket.stages.deep + bucket.stages.light + bucket.stages.rem + bucket.stages.awake;
    if (total <= 0) return `${day}: ${t.value.noStages}`;
    return `${day}: ${STAGES.map((key) => `${stageLabel(key)} ${formatDuration(Math.round(bucket.stages[key]))}`).join(' · ')}`;
  }
  return view.value === 'duration'
    ? t.value.nightTitle(day, formatDuration(Math.round(bucket.minutes)))
    : t.value.windowTitle(day, clockText(bucket.bedtime), clockText(bucket.wake));
});
const STAGE_TONE: Record<string, string> = {
  deep: 'var(--accent)',
  light: 'color-mix(in srgb, var(--accent) 50%, transparent)',
  rem: 'color-mix(in srgb, var(--ink) 38%, transparent)',
  awake: 'color-mix(in srgb, var(--ink) 16%, transparent)',
  unstaged: 'color-mix(in srgb, var(--ink) 30%, transparent)',
};
const stageLabel = (key: string) => (t.value as unknown as Record<string, string>)[key] ?? key;
</script>

<template>
  <section v-if="loaded" class="sleep-trends" :aria-label="t.title">
    <header>
      <span class="st-head"><strong>{{ t.title }}</strong>
        <small v-if="nights.length">{{ t.nights(nights.length) }}<template v-if="weekly"> · {{ t.weekAvg }}</template></small>
      </span>
      <span class="st-switch" role="group" :aria-label="t.title">
        <button type="button" :aria-pressed="view === 'duration'" @click="view = 'duration'">{{ t.duration }}</button>
        <button type="button" :aria-pressed="view === 'stages'" @click="view = 'stages'">{{ t.stages }}</button>
        <button type="button" :aria-pressed="view === 'regularity'" @click="view = 'regularity'">{{ t.regularity }}</button>
      </span>
    </header>
    <p v-if="!nights.length" class="st-empty">{{ t.empty }}</p>
    <template v-else>
      <p class="st-facts">
        <template v-if="view === 'duration'"><b>{{ averageText }}</b> {{ t.average('').trim() }}<span v-if="durationDelta"> · <em :class="['delta', `delta-${durationDelta.tone}`]">{{ durationDelta.text }}</em> {{ t.vsPrevious(previousSpan) }}</span></template>
        <template v-else-if="view === 'stages'">
          <span v-if="!stagedNights.length">{{ t.noStages }}</span>
          <span v-for="(fact, index) in stageFacts" v-else :key="fact.key">{{ index ? ' · ' : '' }}{{ stageLabel(fact.key) }} <b class="st-small">{{ formatDuration(Math.round(fact.minutes)) }}</b> ({{ fact.percent }}%)<template v-if="fact.delta"> <em :class="['delta', `delta-${fact.delta.tone}`]">{{ fact.delta.text }}</em></template></span>
        </template>
        <template v-else>
          <span v-if="bedAvg !== null">{{ t.bedtime(clockText(bedAvg)) }}</span>
          <span v-if="wakeAvg !== null"> · {{ t.wake(clockText(wakeAvg)) }}</span>
          <span v-if="spread !== null"> · {{ t.spread(Math.round(spread)) }}</span>
        </template>
      </p>
      <p v-if="view === 'stages' && stageFacts.some((fact) => fact.delta)" class="st-note">{{ t.stageDeltaNote(previousSpan) }}</p>
      <p class="st-hover" aria-hidden="true">{{ hoverText || ' ' }}</p>
      <div class="st-plot" :style="{ '--n': buckets.length }">
        <div v-if="view === 'duration' && goalStyle" class="st-goal" :style="goalStyle" aria-hidden="true"><em>{{ t.goalLabel(formatDuration(Math.round(goalMinutes ?? 0))) }}</em></div>
        <div v-if="view === 'duration'" class="st-band" :style="bandStyle" aria-hidden="true"><em>{{ t.target }}</em></div>
        <div v-else-if="view === 'regularity'" class="st-axis" aria-hidden="true"><span v-for="tick in axisTicks" :key="tick.label" :style="{ top: `${tick.top}%` }">{{ tick.label }}</span></div>
        <ol :class="['st-bars', { windowed: view === 'regularity' }]" role="list" :aria-label="t.aria" @pointerleave="hovered = null">
          <template v-if="view === 'duration'">
            <li v-for="(bar, index) in durationBars" :key="bar.key" :aria-label="t.nightTitle(shortDay(bar.key), formatDuration(Math.round(bar.bucket.minutes)))" @pointerenter="hovered = bar.key">
              <span :class="['stack', { hot: hovered === bar.key }]" :style="{ height: `${bar.height}%` }">
                <i v-for="part in bar.parts" :key="part.key" :style="{ height: `${part.share}%`, background: STAGE_TONE[part.key] }" />
              </span>
              <small v-if="index % labelEvery === (durationBars.length - 1) % labelEvery">{{ shortDay(bar.key) }}</small>
            </li>
          </template>
          <template v-else-if="view === 'stages'">
            <li v-for="(bar, index) in stageBars" :key="bar.key" :aria-label="bar.empty ? t.noStages : t.stageShare" @pointerenter="hovered = bar.key">
              <span :class="['stack', 'full', { hot: hovered === bar.key, none: bar.empty }]">
                <i v-for="part in bar.parts" :key="part.key" :style="{ height: `${part.share}%`, background: STAGE_TONE[part.key] }" />
              </span>
              <small v-if="index % labelEvery === (stageBars.length - 1) % labelEvery">{{ shortDay(bar.key) }}</small>
            </li>
          </template>
          <template v-else>
            <li v-for="(bar, index) in windowBars" :key="bar.key" :aria-label="t.windowTitle(shortDay(bar.key), clockText(bar.bucket.bedtime), clockText(bar.bucket.wake))" @pointerenter="hovered = bar.key">
              <span :class="['win', { hot: hovered === bar.key }]" :style="{ top: `${bar.top}%`, height: `${bar.height}%` }" />
              <small v-if="index % labelEvery === (windowBars.length - 1) % labelEvery">{{ shortDay(bar.key) }}</small>
            </li>
          </template>
        </ol>
        <svg v-if="maPoints" class="st-ma" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true"><polyline :points="maPoints" vector-effect="non-scaling-stroke" /></svg>
        <span v-if="maPoints" class="st-ma-key" aria-hidden="true">{{ t.movingAverage(weekly ? t.weeks4 : t.days7) }}</span>
      </div>
      <p v-if="view !== 'regularity'" class="st-legend" aria-hidden="true">
        <span v-for="key in ['deep', 'light', 'rem', 'awake']" :key="key"><i :style="{ background: STAGE_TONE[key] }" />{{ stageLabel(key) }}</span>
      </p>
    </template>
  </section>
</template>

<style scoped>
.sleep-trends { display: grid; gap: 12px; padding: 20px 22px; border-radius: var(--radius-lg); background: var(--mat-card); box-shadow: var(--mat-rim); }
header { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 10px; }
.st-head { display: grid; gap: 2px; }
header strong { font-size: var(--fs-sm); font-weight: 600; }
header small, .st-empty { color: var(--subtle); font-size: var(--fs-xs); }
.st-empty { margin: 0; padding: 22px 0; text-align: center; }
.st-switch { display: inline-flex; gap: 2px; padding: 2px; border-radius: var(--radius-sm); box-shadow: inset 0 0 0 1px var(--mat-line); }
.st-switch button { padding: 3px 10px; border: 0; border-radius: 4px; background: transparent; color: var(--muted); font: inherit; font-size: var(--fs-xs); cursor: pointer; }
.st-switch button[aria-pressed='true'] { background: color-mix(in srgb, var(--ink) 10%, transparent); color: var(--ink); }
.st-facts { margin: 0; color: var(--muted); font-size: var(--fs-xs); }
.st-facts b { color: var(--ink); font-size: 30px; font-weight: 600; letter-spacing: -0.02em; font-variant-numeric: tabular-nums; }
.st-note { margin: 0; color: var(--subtle); font-size: var(--fs-2xs); }
.st-hover { margin: 0; min-height: 1.4em; color: var(--ink); font-size: var(--fs-xs); font-variant-numeric: tabular-nums; }
.st-plot { position: relative; width: min(100%, calc(var(--n) * 64px + 40px)); }
.st-ma { position: absolute; top: 0; right: 0; bottom: 18px; left: 0; width: 100%; height: calc(100% - 18px); overflow: visible; pointer-events: none; z-index: 2; }
.st-ma polyline { fill: none; stroke: var(--ink); stroke-width: 1.6; stroke-linejoin: round; stroke-linecap: round; }
.st-goal { position: absolute; right: 0; left: 0; z-index: 2; height: 0; border-top: 1px solid color-mix(in srgb, var(--accent) 70%, transparent); pointer-events: none; }
.st-goal em { position: absolute; left: 0; bottom: 3px; color: var(--accent); font-size: 10px; font-style: normal; font-variant-numeric: tabular-nums; }
.st-ma-key { position: absolute; top: -14px; left: 0; color: var(--muted); font-size: 10px; }
.stack.full { height: 100%; }
.stack.none { background: color-mix(in srgb, var(--ink) 6%, transparent); }
.st-facts .st-small { color: var(--ink); font-size: inherit; font-weight: 600; letter-spacing: 0; }
.st-bars { position: relative; display: grid; grid-template-columns: repeat(var(--n), minmax(0, 1fr)); align-items: end; gap: clamp(1px, 0.5vw, 6px); height: 170px; margin: 0; padding: 0 0 18px; list-style: none; }
.st-bars.windowed { margin-left: 38px; align-items: stretch; }
.st-bars li { position: relative; display: flex; align-items: flex-end; height: 100%; }
.st-bars.windowed li { display: block; }
.stack { position: relative; z-index: 1; display: flex; flex-direction: column-reverse; width: 100%; overflow: hidden; border-radius: 2px 2px 0 0; transition: opacity 120ms ease; }
.stack i { display: block; width: 100%; }
.st-bars:has(.hot) .stack:not(.hot), .st-bars:has(.hot) .win:not(.hot) { opacity: .5; }
.st-bars small { position: absolute; bottom: -18px; left: 50%; transform: translateX(-50%); color: var(--subtle); font-size: 10px; font-variant-numeric: tabular-nums; white-space: nowrap; }
.st-band { position: absolute; right: 0; left: 0; z-index: 0; border-block: 1px dashed color-mix(in srgb, var(--ink) 25%, transparent); background: color-mix(in srgb, var(--ink) 4%, transparent); pointer-events: none; }
.st-band em { position: absolute; top: 2px; right: 4px; color: var(--subtle); font-size: 10px; font-style: normal; }
.st-axis { position: absolute; top: 0; bottom: 18px; left: 0; width: 34px; }
.st-axis span { position: absolute; left: 0; color: var(--subtle); font-size: 10px; font-variant-numeric: tabular-nums; transform: translateY(-50%); }
.win { position: absolute; right: 0; left: 0; border-radius: 2px; background: color-mix(in srgb, var(--accent) 70%, transparent); transition: opacity 120ms ease; }
.win.hot { background: var(--accent); }
.st-legend { display: flex; flex-wrap: wrap; gap: 6px 14px; margin: 0; color: var(--muted); font-size: var(--fs-xs); }
.st-legend span { display: inline-flex; align-items: center; gap: 6px; }
.st-legend i { width: 9px; height: 9px; border-radius: 2px; }
</style>
