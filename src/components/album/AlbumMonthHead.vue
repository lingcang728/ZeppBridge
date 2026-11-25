<script setup lang="ts">
/* 月档每一组的组头（月度分析）：
   - 睡眠：平均时长 · 平均评分 · 平均入睡 · 记录几晚 · 平均时长比上个月多 / 少（涨绿跌红）· 分期占比小环；
   - 运动：次数 · 距离 · 时长 · 距离比上个月多 / 少。
   哪一项没有数据就写「—」，上个月没有记录就不写比较那一项（不拿 0 当上个月）。 */
import { computed } from 'vue';
import { useMessages } from '../../i18n';
import { albumMessages } from './album.i18n';
import { formatDistance, formatDuration } from '../../lib/format';
import { displayDateTimeFormatter } from '../../lib/dateTime';
import { clockFromNoon, periodDelta, previousMonth, stageRing, type AlbumKind, type SleepPeriod, type WorkoutPeriod } from '../../lib/album/album';

const props = defineProps<{ kind: AlbumKind; month: string; periods: (WorkoutPeriod | SleepPeriod)[] }>();
const t = useMessages(albumMessages);

const dateOf = (key: string) => new Date(Number(key.slice(0, 4)), Number(key.slice(5, 7)) - 1, 1);
const title = computed(() => displayDateTimeFormatter({ year: 'numeric', month: 'long' }).format(dateOf(props.month)));
const prevName = computed(() => displayDateTimeFormatter({ month: 'long' }).format(dateOf(previousMonth(props.month))));
const period = computed(() => props.periods.find((p) => p.key === props.month) ?? null);

const signed = (value: number, text: string) => `${value > 0 ? '+' : '−'}${text}`;
const sleep = computed(() => {
  if (props.kind !== 'sleep' || !period.value) return null;
  const p = period.value as SleepPeriod;
  const delta = periodDelta(props.periods as SleepPeriod[], props.month, (x) => x.avg_duration_min);
  return {
    duration: formatDuration(p.avg_duration_min, '—'),
    score: p.avg_score === null ? '—' : String(Math.round(p.avg_score)),
    onset: p.avg_onset_min === null ? '—' : clockFromNoon(p.avg_onset_min),
    nights: t.value.nights(p.nights),
    delta: delta === null || Math.round(delta) === 0 ? null : { text: signed(delta, formatDuration(Math.abs(delta))), good: delta > 0 },
    ring: stageRing(p.stages),
  };
});
const workout = computed(() => {
  if (props.kind !== 'workouts' || !period.value) return null;
  const p = period.value as WorkoutPeriod;
  const delta = periodDelta(props.periods as WorkoutPeriod[], props.month, (x) => (x.distance_m > 0 ? x.distance_m : null));
  return {
    count: String(p.count),
    distance: formatDistance(p.distance_m, '—'),
    duration: p.duration_s > 0 ? formatDuration(p.duration_s / 60) : '—',
    delta: delta === null || Math.abs(delta) < 50 ? null : { text: signed(delta, formatDistance(Math.abs(delta))), good: delta > 0 },
  };
});
</script>

<template>
  <header class="month-head">
    <h3 class="month-name">{{ title }}</h3>
    <dl v-if="sleep" class="month-facts">
      <div><dt>{{ t.avgDuration }}</dt><dd>{{ sleep.duration }}</dd></div>
      <div><dt>{{ t.avgScore }}</dt><dd>{{ sleep.score }}</dd></div>
      <div><dt>{{ t.avgOnset }}</dt><dd>{{ sleep.onset }}</dd></div>
      <div><dt>{{ t.nightsLabel }}</dt><dd>{{ sleep.nights }}</dd></div>
      <div v-if="sleep.delta"><dt>{{ t.vsMonth(prevName) }}</dt><dd :class="sleep.delta.good ? 'good' : 'bad'">{{ sleep.delta.text }}</dd></div>
    </dl>
    <dl v-else-if="workout" class="month-facts">
      <div><dt>{{ t.count }}</dt><dd>{{ workout.count }}</dd></div>
      <div><dt>{{ t.distance }}</dt><dd>{{ workout.distance }}</dd></div>
      <div><dt>{{ t.duration }}</dt><dd>{{ workout.duration }}</dd></div>
      <div v-if="workout.delta"><dt>{{ t.vsMonth(prevName) }}</dt><dd :class="workout.delta.good ? 'good' : 'bad'">{{ workout.delta.text }}</dd></div>
    </dl>
    <svg v-if="sleep?.ring.length" class="month-ring" viewBox="0 0 42 42" role="img" :aria-label="t.stageShare" focusable="false">
      <circle class="ring-base" cx="21" cy="21" r="15.915" />
      <circle v-for="arc in sleep.ring" :key="arc.stage" :class="['ring-part', arc.stage]" cx="21" cy="21" r="15.915" :stroke-dasharray="arc.dash" :stroke-dashoffset="arc.offset" />
    </svg>
  </header>
</template>

<style scoped>
.month-head { display: grid; grid-template-columns: minmax(0, 1fr) auto; align-items: center; gap: 6px 14px; margin: 0 0 10px; }
.month-name { grid-column: 1; margin: 0; color: var(--ink); font-size: var(--fs-md); font-weight: 700; font-variant-numeric: tabular-nums; }
.month-facts { grid-column: 1; display: flex; flex-wrap: wrap; gap: 4px 18px; margin: 0; }
.month-facts div { display: grid; gap: 1px; min-width: 0; }
.month-facts dt { color: var(--muted); font-size: var(--fs-xs); font-weight: 600; white-space: nowrap; }
.month-facts dd { margin: 0; color: var(--ink); font-size: var(--fs-sm); font-weight: 650; font-variant-numeric: tabular-nums; white-space: nowrap; }
.month-facts dd.good { color: var(--accent); }
.month-facts dd.bad { color: var(--danger); }
.month-ring { grid-column: 2; grid-row: 1 / span 2; width: 44px; height: 44px; }
.month-ring circle { fill: none; stroke-width: 6; }
.ring-base { stroke: color-mix(in srgb, var(--ink) 6%, transparent); }
.ring-part.deep { stroke: var(--sleep-deep); }
.ring-part.light { stroke: var(--sleep-light); }
.ring-part.rem { stroke: var(--sleep-rem); }
.ring-part.awake { stroke: var(--sleep-awake); }
</style>
