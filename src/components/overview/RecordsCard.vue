<script setup lang="ts">
/**
 * 个人纪录：你自己这段历史里的最好成绩（最多步数的一天、睡得最久的一晚、距离最长的一周……）。
 * 只和你自己比，数字全从本机记录里算出来；最近 7 天里创下的纪录标「新」。
 * 配速纪录只看不短于 5 / 10 公里的跑步，并且丢掉快得离谱的脏数据。
 */
import { computed } from 'vue';
import { today as currentToday } from '../../lib/currentDay';
import { displayDateTimeFormatter, parseDisplayDate } from '../../lib/dateTime';
import { formatDuration, formatNumber } from '../../lib/format';
import { workoutLabel } from '../../lib/labels';
import { formatPaceSeconds } from '../../lib/metricSeries';
import { personalRecords, type DayPoint, type PersonalRecord, type RecordId } from '../../lib/progress';
import type { SleepNight } from '../../lib/sleepTrends';
import { formatDay } from '../../lib/trendWindow';
import { distanceUnitLabel, paceUnitLabel, toBigDistance } from '../../lib/units';
import type { Workout } from '../../types';
import { defineMessages, useMessages } from '../../i18n';

const props = defineProps<{ steps: DayPoint[]; distance: DayPoint[]; nights: SleepNight[]; workouts: Workout[] }>();

const messages = defineMessages(
  {
    title: '个人纪录',
    steps: '步数最多的一天',
    sleep: '睡得最久的一晚',
    deep: '深睡最多的一晚',
    weekDistance: '总距离最长的一周（全天）',
    longest: '最远的一次运动（训练）',
    pace5: '最快 5 公里以上配速',
    pace10: '最快 10 公里以上配速',
    stepsUnit: '步',
    weekOf: (day: string) => `${day} 起一周`,
    isNew: '新',
    empty: '有了记录之后，这里会列出你自己的最好成绩。',
    aria: '个人纪录',
  },
  {
    title: 'Personal records',
    steps: 'Most steps in a day',
    sleep: 'Longest night of sleep',
    deep: 'Most deep sleep in a night',
    weekDistance: 'Longest week by total distance (all day)',
    longest: 'Longest single workout (training)',
    pace5: 'Fastest pace over 5 km or more',
    pace10: 'Fastest pace over 10 km or more',
    stepsUnit: 'steps',
    weekOf: (day: string) => `Week of ${day}`,
    isNew: 'New',
    empty: 'Once there are records, your own best results are listed here.',
    aria: 'Personal records',
  },
  {
    title: 'Récords personales',
    steps: 'Más pasos en un día',
    sleep: 'La noche que más has dormido',
    deep: 'Más sueño profundo en una noche',
    weekDistance: 'Semana con más distancia en total (todo el día)',
    longest: 'El entrenamiento más largo (sesión)',
    pace5: 'Mejor ritmo en 5 km o más',
    pace10: 'Mejor ritmo en 10 km o más',
    stepsUnit: 'pasos',
    weekOf: (day: string) => `Semana del ${day}`,
    isNew: 'Nuevo',
    empty: 'Cuando haya registros, aquí aparecerán tus mejores marcas.',
    aria: 'Récords personales',
  },
  'components/overview/RecordsCard',
);
const t = useMessages(messages);

const ORDER: RecordId[] = ['steps', 'sleep', 'deep', 'weekDistance', 'longest', 'pace5', 'pace10'];

const records = computed<PersonalRecord[]>(() => {
  const all = personalRecords({ steps: props.steps, distance: props.distance, nights: props.nights, workouts: props.workouts }, formatDay(currentToday()));
  return ORDER.map((id) => all.find((record) => record.id === id)).filter((record): record is PersonalRecord => Boolean(record));
});

const dayText = (date: string) => displayDateTimeFormatter({ day: 'numeric', month: 'short', year: 'numeric' }).format(parseDisplayDate(date));
const km = (meters: number) => `${formatNumber(Math.round(toBigDistance(meters) * 10) / 10)} ${distanceUnitLabel()}`;
const valueText = (record: PersonalRecord): string => {
  switch (record.id) {
    case 'steps': return `${formatNumber(Math.round(record.value))} ${t.value.stepsUnit}`;
    case 'sleep':
    case 'deep': return formatDuration(Math.round(record.value));
    case 'weekDistance':
    case 'longest': return km(record.value);
    default: return `${formatPaceSeconds(record.value)} ${paceUnitLabel()}`;
  }
};
const whenText = (record: PersonalRecord): string => {
  if (record.id === 'weekDistance') return t.value.weekOf(dayText(record.date));
  const sport = record.sport ? `${workoutLabel(record.sport)} · ` : '';
  return `${sport}${dayText(record.date)}`;
};
</script>

<template>
  <section class="rec-card" :aria-label="t.title">
    <header><strong>{{ t.title }}</strong></header>
    <p v-if="!records.length" class="rec-empty">{{ t.empty }}</p>
    <ul v-else class="rec-grid" :aria-label="t.aria">
      <li v-for="record in records" :key="record.id">
        <span class="rec-label">{{ t[record.id] }}<em v-if="record.recent" class="rec-new">{{ t.isNew }}</em></span>
        <b class="rec-value">{{ valueText(record) }}</b>
        <span class="rec-when">{{ whenText(record) }}</span>
      </li>
    </ul>
  </section>
</template>

<style scoped>
.rec-card { display: grid; align-content: start; gap: 14px; padding: 20px 22px; border-radius: var(--radius-lg); background: var(--mat-card); box-shadow: var(--mat-rim); }
header strong { font-size: var(--fs-sm); font-weight: 600; }
.rec-empty { margin: 0; padding: 16px 0; color: var(--subtle); font-size: var(--fs-xs); text-align: center; }
.rec-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(11.5rem, 1fr)); gap: 10px; margin: 0; padding: 0; list-style: none; }
.rec-grid li { display: grid; gap: 2px; padding: 12px 14px; border-radius: var(--radius-md); background: transparent; box-shadow: inset 0 0 0 1px var(--mat-line); }
.rec-label { display: flex; align-items: center; gap: 8px; color: var(--muted); font-size: var(--fs-xs); }
.rec-new { padding: 0 6px; border-radius: 4px; background: color-mix(in srgb, var(--accent) 18%, transparent); color: var(--accent); font-size: 10px; font-style: normal; font-weight: 700; text-transform: none; }
.rec-value { color: var(--ink); font-size: var(--fs-xl); font-weight: 600; letter-spacing: -0.01em; font-variant-numeric: tabular-nums; }
.rec-when { color: var(--subtle); font-size: var(--fs-2xs); }
</style>
