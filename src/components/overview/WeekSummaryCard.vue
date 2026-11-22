<script setup lang="ts">
/**
 * 这一周 / 这个月：最近 7 天（或 30 天）对比紧挨着的前一段，一眼看出走得怎么样。
 * 每项一个大数字 + 变化箭头：朝好的方向是绿、朝坏的方向是红、持平是灰；
 * 没有公认方向的（训练量……）只给箭头和幅度、不判断好坏，见 lib/periodDelta.ts。
 * 前一段读数太少（不到一半）时不比，只显示数字。
 */
import { computed, ref } from 'vue';
import { today as currentToday } from '../../lib/currentDay';
import { displayDateTimeFormatter, parseDisplayDate } from '../../lib/dateTime';
import { formatDuration, formatNumber } from '../../lib/format';
import { periodChange } from '../../lib/periodDelta';
import { addDays, periodStats, type DayPoint, type PeriodStats } from '../../lib/progress';
import type { SleepNight } from '../../lib/sleepTrends';
import { formatDay } from '../../lib/trendWindow';
import { distanceUnitLabel, toBigDistance } from '../../lib/units';
import type { Workout } from '../../types';
import { defineMessages, useMessages } from '../../i18n';

const props = defineProps<{ steps: DayPoint[]; hrv: DayPoint[]; restingHr: DayPoint[]; nights: SleepNight[]; workouts: Workout[] }>();

const messages = defineMessages(
  {
    title: '概览',
    week: '本周',
    month: '本月',
    stepsLabel: '步数 / 天',
    sleepLabel: '平均睡眠',
    trainLabel: '训练',
    hrvLabel: 'HRV',
    restingLabel: '静息心率',
    sessions: (count: number) => `${count} 次`,
    versus: (span: string) => `对比 ${span}`,
    last: (days: number) => `最近 ${days} 天`,
    noData: '没有记录',
    empty: '同步后会在这里显示这一段的概览。',
  },
  {
    title: 'Summary',
    week: 'Week',
    month: 'Month',
    stepsLabel: 'Steps / day',
    sleepLabel: 'Average sleep',
    trainLabel: 'Training',
    hrvLabel: 'HRV',
    restingLabel: 'Resting HR',
    sessions: (count: number) => `${count} sessions`,
    versus: (span: string) => `vs ${span}`,
    last: (days: number) => `Last ${days} days`,
    noData: 'No data',
    empty: 'A summary of this period shows up here after a sync.',
  },
  {
    title: 'Resumen',
    week: 'Semana',
    month: 'Mes',
    stepsLabel: 'Pasos / día',
    sleepLabel: 'Sueño medio',
    trainLabel: 'Entrenamiento',
    hrvLabel: 'VFC',
    restingLabel: 'FC en reposo',
    sessions: (count: number) => `${count} sesiones`,
    versus: (span: string) => `frente a ${span}`,
    last: (days: number) => `Últimos ${days} días`,
    noData: 'Sin datos',
    empty: 'El resumen de este periodo aparecerá aquí tras sincronizar.',
  },
  'components/overview/WeekSummaryCard',
);
const t = useMessages(messages);

const days = ref<7 | 30>(7);
const shortDay = (date: string) => displayDateTimeFormatter({ day: 'numeric', month: 'short' }).format(parseDisplayDate(date));

const windows = computed(() => {
  const end = formatDay(currentToday());
  const start = addDays(end, -(days.value - 1));
  const previousEnd = addDays(start, -1);
  const previousStart = addDays(previousEnd, -(days.value - 1));
  return { start, end, previousStart, previousEnd };
});
const stats = computed<{ now: PeriodStats; before: PeriodStats }>(() => {
  const input = { steps: props.steps, hrv: props.hrv, restingHr: props.restingHr, nights: props.nights, workouts: props.workouts };
  return {
    now: periodStats(input, windows.value.start, windows.value.end),
    before: periodStats(input, windows.value.previousStart, windows.value.previousEnd),
  };
});
const span = computed(() => `${shortDay(windows.value.previousStart)} – ${shortDay(windows.value.previousEnd)}`);

/** 前一段读数太少（不到这一段的一半）时不比：拿零星几天当「上一周期」没有意义。 */
const comparable = (now: number, before: number) => before >= Math.ceil(now / 2);
const countIn = (points: DayPoint[], start: string, end: string) => points.filter((point) => point.date >= start && point.date <= end).length;

interface Tile {
  key: string;
  label: string;
  value: string | null;
  detail: string | null;
  change: ReturnType<typeof periodChange>;
}

const tiles = computed<Tile[]>(() => {
  const { now, before } = stats.value;
  const w = windows.value;
  const nightsIn = (start: string, end: string) => props.nights.filter((night) => night.date >= start && night.date <= end).length;
  const gate = <T,>(a: T, ok: boolean): T | null => (ok ? a : null);
  const km = (meters: number) => `${formatNumber(Math.round(toBigDistance(meters) * 10) / 10)} ${distanceUnitLabel()}`;
  return [
    {
      key: 'steps', label: t.value.stepsLabel,
      value: now.steps !== null ? formatNumber(Math.round(now.steps)) : null, detail: null,
      change: periodChange(now.steps, gate(before.steps, comparable(countIn(props.steps, w.start, w.end), countIn(props.steps, w.previousStart, w.previousEnd))), 'steps'),
    },
    {
      key: 'sleep', label: t.value.sleepLabel,
      value: now.sleepMinutes !== null ? formatDuration(Math.round(now.sleepMinutes)) : null, detail: null,
      change: periodChange(now.sleepMinutes, gate(before.sleepMinutes, comparable(nightsIn(w.start, w.end), nightsIn(w.previousStart, w.previousEnd))), 'sleep_duration'),
    },
    {
      key: 'train', label: t.value.trainLabel,
      value: now.sessions > 0 ? km(now.distanceMeters) : null, detail: now.sessions > 0 ? t.value.sessions(now.sessions) : null,
      // 训练量多少没有好坏（休息周不是「差」）：用没有登记方向的名字，只给箭头和幅度，不上红绿。
      change: now.sessions > 0 ? periodChange(now.distanceMeters, before.distanceMeters > 0 ? before.distanceMeters : null, 'training_volume') : null,
    },
    {
      key: 'hrv', label: t.value.hrvLabel,
      value: now.hrv !== null ? formatNumber(Math.round(now.hrv)) : null, detail: now.hrv !== null ? 'ms' : null,
      change: periodChange(now.hrv, gate(before.hrv, comparable(countIn(props.hrv, w.start, w.end), countIn(props.hrv, w.previousStart, w.previousEnd))), 'hrv'),
    },
    {
      key: 'resting', label: t.value.restingLabel,
      value: now.restingHr !== null ? formatNumber(Math.round(now.restingHr)) : null, detail: now.restingHr !== null ? 'bpm' : null,
      change: periodChange(now.restingHr, gate(before.restingHr, comparable(countIn(props.restingHr, w.start, w.end), countIn(props.restingHr, w.previousStart, w.previousEnd))), 'resting_hr'),
    },
  ];
});
const hasAny = computed(() => tiles.value.some((tile) => tile.value !== null));
</script>

<template>
  <section class="wk-card" :aria-label="t.title">
    <header>
      <span class="wk-head"><strong>{{ t.title }}</strong><small>{{ t.last(days) }} · {{ t.versus(span) }}</small></span>
      <span class="wk-switch" role="group" :aria-label="t.title">
        <button type="button" :aria-pressed="days === 7" @click="days = 7">{{ t.week }}</button>
        <button type="button" :aria-pressed="days === 30" @click="days = 30">{{ t.month }}</button>
      </span>
    </header>
    <p v-if="!hasAny" class="wk-empty">{{ t.empty }}</p>
    <ul v-else class="wk-grid">
      <li v-for="tile in tiles" :key="tile.key">
        <span class="wk-label">{{ tile.label }}</span>
        <span class="wk-value"><b>{{ tile.value ?? '—' }}</b><small v-if="tile.detail">{{ tile.detail }}</small></span>
        <em v-if="tile.change" :class="['delta', `delta-${tile.change.tone}`]">{{ tile.change.text }}</em>
        <span v-else-if="tile.value === null" class="wk-none">{{ t.noData }}</span>
      </li>
    </ul>
  </section>
</template>

<style scoped>
.wk-card { display: grid; gap: 14px; padding: 20px 22px; border-radius: var(--radius-lg); background: var(--mat-card); box-shadow: var(--mat-rim); }
header { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 10px; }
.wk-head { display: grid; gap: 2px; }
header strong { font-size: var(--fs-sm); font-weight: 600; }
header small, .wk-empty { color: var(--subtle); font-size: var(--fs-xs); }
.wk-empty { margin: 0; padding: 16px 0; text-align: center; }
.wk-switch { display: inline-flex; gap: 2px; padding: 2px; border-radius: var(--radius-sm); box-shadow: inset 0 0 0 1px var(--mat-line); }
.wk-switch button { padding: 3px 10px; border: 0; border-radius: 4px; background: transparent; color: var(--muted); font: inherit; font-size: var(--fs-xs); cursor: pointer; }
.wk-switch button[aria-pressed='true'] { background: color-mix(in srgb, var(--ink) 10%, transparent); color: var(--ink); }
.wk-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(9.5rem, 1fr)); gap: 10px; margin: 0; padding: 0; list-style: none; }
.wk-grid li { display: grid; align-content: start; gap: 3px; padding: 12px 14px; border-radius: var(--radius-md); box-shadow: inset 0 0 0 1px var(--mat-line); }
.wk-label { color: var(--muted); font-size: var(--fs-xs); }
.wk-value { display: flex; align-items: baseline; gap: 5px; }
.wk-value b { color: var(--ink); font-size: var(--fs-3xl); font-weight: 600; letter-spacing: -0.02em; font-variant-numeric: tabular-nums; }
.wk-value small { color: var(--subtle); font-size: var(--fs-xs); }
.wk-card .delta { font-size: var(--fs-xs); }
.wk-none { color: var(--subtle); font-size: var(--fs-xs); }
</style>
