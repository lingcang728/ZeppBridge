<script setup lang="ts">
/**
 * 每周训练量：一周一根柱子（周一到周日），按运动类型叠起来；口径可切「距离 / 时长 / 次数」。
 * 跟着页面的范围走，但至少显示 4 周（7 天范围只有一根柱子没法比较）。
 * 数据是逐条运动记录，所以空周的 0 是真的「那周没练」。没有距离的运动不进「距离」口径，只进时长和次数。
 */
import { computed, onMounted, ref } from 'vue';
import { useRevisionReload } from '../../composables/useRevisionReload';
import { isDesktop } from '../../lib/bridge';
import { displayDateTimeFormatter, parseDisplayDate } from '../../lib/dateTime';
import { formatNumber } from '../../lib/format';
import { workoutLabel } from '../../lib/labels';
import { pageQuery } from '../../lib/pageQueries';
import { cached } from '../../lib/readCache';
import { distanceUnitLabel, toBigDistance } from '../../lib/units';
import { OTHER_SPORT, weeklyVolume, type VolumeMetric } from '../../lib/weeklyVolume';
import { displayableWorkouts } from '../../lib/workouts';
import { trendToday } from '../../lib/trendWindow';
import type { Workout } from '../../types';
import { defineMessages, useMessages } from '../../i18n';

const props = defineProps<{ days: number }>();

const messages = defineMessages(
  {
    title: '每周训练量',
    distance: '距离',
    duration: '时长',
    sessions: '次数',
    average: (value: string) => `平均每周 ${value}`,
    total: (value: string) => `合计 ${value}`,
    other: '其他',
    weekTitle: (day: string, value: string) => `${day} 起一周：${value}`,
    sessionsUnit: (count: string) => `${count} 次`,
    hoursUnit: (value: string) => `${value} 小时`,
    empty: '这段时间没有运动记录。',
    failed: '运动记录暂时读不到。',
    aria: '每周训练量',
  },
  {
    title: 'Weekly training volume',
    distance: 'Distance',
    duration: 'Time',
    sessions: 'Sessions',
    average: (value: string) => `${value} a week on average`,
    total: (value: string) => `${value} in total`,
    other: 'Other',
    weekTitle: (day: string, value: string) => `Week of ${day}: ${value}`,
    sessionsUnit: (count: string) => `${count} sessions`,
    hoursUnit: (value: string) => `${value} h`,
    empty: 'No workouts in this period.',
    failed: 'Workouts could not be read right now.',
    aria: 'Training volume for each week',
  },
  {
    title: 'Volumen semanal de entrenamiento',
    distance: 'Distancia',
    duration: 'Tiempo',
    sessions: 'Sesiones',
    average: (value: string) => `${value} por semana de media`,
    total: (value: string) => `${value} en total`,
    other: 'Otros',
    weekTitle: (day: string, value: string) => `Semana del ${day}: ${value}`,
    sessionsUnit: (count: string) => `${count} sesiones`,
    hoursUnit: (value: string) => `${value} h`,
    empty: 'No hay entrenamientos en este periodo.',
    failed: 'Los entrenamientos no se pueden leer de momento.',
    aria: 'Volumen de entrenamiento de cada semana',
  },
  'components/training/WeeklyVolumeCard',
);
const t = useMessages(messages);

const workouts = ref<Workout[]>([]);
const loaded = ref(false);
const failed = ref(false);
const metric = ref<VolumeMetric>('distance');

let seq = 0;
const load = async () => {
  if (!isDesktop()) { loaded.value = true; return; }
  const mine = ++seq;
  try {
    const next = await cached(pageQuery.recentWorkouts(500));
    if (mine !== seq) return;
    workouts.value = displayableWorkouts(next);
    failed.value = false;
  } catch {
    if (mine !== seq) return;
    failed.value = workouts.value.length === 0;
  } finally {
    if (mine === seq) loaded.value = true;
  }
};
onMounted(() => { void load(); });
useRevisionReload(() => { void load(); });

const weekCount = computed(() => Math.max(4, Math.ceil(props.days / 7)));
const volume = computed(() => weeklyVolume(workouts.value, metric.value, weekCount.value, trendToday()));
const peak = computed(() => Math.max(1, ...volume.value.weeks.map((week) => week.total)));
const total = computed(() => volume.value.weeks.reduce((sum, week) => sum + week.total, 0));
const average = computed(() => total.value / volume.value.weeks.length);

/** 距离按当前单位，时长按小时（一位小数），次数取整。 */
const valueText = (raw: number): string => {
  if (metric.value === 'distance') return `${formatNumber(Math.round(toBigDistance(raw * 1000) * 10) / 10)} ${distanceUnitLabel()}`;
  if (metric.value === 'duration') return t.value.hoursUnit(formatNumber(Math.round((raw / 60) * 10) / 10));
  return t.value.sessionsUnit(formatNumber(Math.round(raw)));
};
const sportLabel = (sport: string) => (sport === OTHER_SPORT ? t.value.other : workoutLabel(sport));
const shortDay = (date: string) => displayDateTimeFormatter({ month: 'numeric', day: 'numeric' }).format(parseDisplayDate(date));

/** 五级色阶：强调色最深，其余是中性灰阶，不给每个运动一个颜色（调色板最多一个强调色）。 */
const TONES = [
  'var(--accent)',
  'color-mix(in srgb, var(--accent) 50%, transparent)',
  'color-mix(in srgb, var(--ink) 38%, transparent)',
  'color-mix(in srgb, var(--ink) 22%, transparent)',
  'color-mix(in srgb, var(--ink) 12%, transparent)',
];
const tone = (index: number) => TONES[index] ?? TONES[TONES.length - 1]!;

const bars = computed(() => volume.value.weeks.map((week) => ({
  start: week.start,
  total: week.total,
  height: week.total > 0 ? Math.max(3, (week.total / peak.value) * 100) : 0,
  parts: volume.value.sports
    .filter((sport) => (week.bySport[sport] ?? 0) > 0)
    .map((sport) => ({ sport, share: (week.bySport[sport]! / week.total) * 100, color: tone(volume.value.sports.indexOf(sport)) })),
})));
const labelEvery = computed(() => (bars.value.length > 30 ? 8 : bars.value.length > 14 ? 4 : bars.value.length > 8 ? 2 : 1));

const hovered = ref<string | null>(null);
const hoverText = computed(() => {
  const bar = bars.value.find((item) => item.start === hovered.value);
  if (!bar) return '';
  const week = volume.value.weeks.find((item) => item.start === bar.start)!;
  const parts = volume.value.sports.filter((sport) => (week.bySport[sport] ?? 0) > 0)
    .map((sport) => `${sportLabel(sport)} ${valueText(week.bySport[sport]!)}`).join(' · ');
  return `${t.value.weekTitle(shortDay(bar.start), valueText(bar.total))}${parts && bar.parts.length > 1 ? ` (${parts})` : ''}`;
});
</script>

<template>
  <section class="vol-card" :aria-label="t.title">
    <header>
      <span class="vol-head"><strong>{{ t.title }}</strong>
        <small v-if="total > 0">{{ t.average(valueText(average)) }} · {{ t.total(valueText(total)) }}</small>
      </span>
      <span class="vol-metric" role="group" :aria-label="t.title">
        <button v-for="key in (['distance', 'duration', 'sessions'] as const)" :key="key" type="button" :aria-pressed="metric === key" @click="metric = key">{{ t[key] }}</button>
      </span>
    </header>
    <p v-if="failed" class="vol-empty" role="alert">{{ t.failed }}</p>
    <p v-else-if="loaded && total <= 0" class="vol-empty">{{ t.empty }}</p>
    <template v-else-if="loaded">
      <p class="vol-hover" aria-hidden="true">{{ hoverText || ' ' }}</p>
      <ol class="vol-bars" role="list" :aria-label="t.aria" :style="{ '--n': bars.length }" @pointerleave="hovered = null">
        <li v-for="(bar, index) in bars" :key="bar.start" :aria-label="t.weekTitle(shortDay(bar.start), valueText(bar.total))" @pointerenter="hovered = bar.start">
          <span :class="['stack', { empty: bar.total <= 0, hot: hovered === bar.start }]" :style="{ height: `${bar.height}%` }">
            <i v-for="part in bar.parts" :key="part.sport" :style="{ height: `${part.share}%`, background: part.color }" />
          </span>
          <small v-if="index % labelEvery === (bars.length - 1) % labelEvery">{{ shortDay(bar.start) }}</small>
        </li>
      </ol>
      <p class="vol-legend">
        <span v-for="(sport, index) in volume.sports" :key="sport"><i :style="{ background: tone(index) }" />{{ sportLabel(sport) }}</span>
      </p>
    </template>
  </section>
</template>

<style scoped>
.vol-card { display: grid; gap: 12px; padding: 20px 22px; border-radius: var(--radius-lg); background: var(--mat-card); box-shadow: var(--mat-rim); }
header { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 10px; }
.vol-head { display: grid; gap: 2px; }
header strong { font-size: var(--fs-sm); font-weight: 600; }
header small, .vol-empty { color: var(--subtle); font-size: var(--fs-xs); }
.vol-empty { margin: 0; padding: 22px 0; text-align: center; }
.vol-metric { display: inline-flex; gap: 2px; padding: 2px; border-radius: var(--radius-sm); box-shadow: inset 0 0 0 1px var(--mat-line); }
.vol-metric button { padding: 3px 10px; border: 0; border-radius: 4px; background: transparent; color: var(--muted); font: inherit; font-size: var(--fs-xs); cursor: pointer; }
.vol-metric button[aria-pressed='true'] { background: color-mix(in srgb, var(--ink) 10%, transparent); color: var(--ink); }
.vol-hover { margin: 0; min-height: 1.4em; color: var(--ink); font-size: var(--fs-xs); font-variant-numeric: tabular-nums; }
.vol-bars { display: grid; grid-template-columns: repeat(var(--n), minmax(0, 56px)); align-items: end; gap: clamp(2px, 0.6vw, 8px); height: 150px; margin: 0; padding: 0 0 18px; list-style: none; }
.vol-bars li { position: relative; display: flex; align-items: flex-end; height: 100%; }
.stack { display: flex; flex-direction: column-reverse; width: 100%; overflow: hidden; border-radius: 2px 2px 0 0; transition: height 420ms var(--ease-out), opacity 120ms ease; }
.stack i { display: block; width: 100%; }
.stack.empty { height: 1px !important; background: color-mix(in srgb, var(--ink) 12%, transparent); }
.vol-bars:has(.hot) .stack:not(.hot) { opacity: .55; }
.vol-bars small { position: absolute; bottom: -18px; left: 50%; transform: translateX(-50%); color: var(--subtle); font-size: 10px; font-variant-numeric: tabular-nums; white-space: nowrap; }
.vol-legend { display: flex; flex-wrap: wrap; gap: 6px 14px; margin: 0; color: var(--muted); font-size: var(--fs-xs); }
.vol-legend span { display: inline-flex; align-items: center; gap: 6px; }
.vol-legend i { width: 9px; height: 9px; border-radius: 2px; }
</style>
