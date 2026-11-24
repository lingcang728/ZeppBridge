<script setup lang="ts">
/* 相册的「年」「月」两层：年是整宽大卡，月是两列卡（按年分组）。
   运动卡：次数、总距离、总时长，右边画这段时间里最长那条带轨迹的运动的轮廓；
   睡眠卡：平均时长、平均入睡、分期占比环。点一张卡就从这张卡展开下一层（动效在 lib/album/albumMotion.ts）。 */
import { computed } from 'vue';
import RouteGlyph from './RouteGlyph.vue';
import { useMessages } from '../../i18n';
import { albumMessages } from './album.i18n';
import { formatDistance, formatDuration } from '../../lib/format';
import { displayDateTimeFormatter } from '../../lib/dateTime';
import { clockFromNoon, type AlbumKind, type SleepPeriod, type WorkoutPeriod } from '../../lib/album/album';

const props = defineProps<{ kind: AlbumKind; level: 'month' | 'year'; periods: (WorkoutPeriod | SleepPeriod)[] }>();
const emit = defineEmits<{ open: [key: string, card: HTMLElement] }>();
const t = useMessages(albumMessages);

const monthName = (key: string) => displayDateTimeFormatter({ month: 'long' }).format(new Date(Number(key.slice(0, 4)), Number(key.slice(5, 7)) - 1, 1));
const yearName = (key: string) => displayDateTimeFormatter({ year: 'numeric' }).format(new Date(Number(key.slice(0, 4)), 0, 1));
const fullName = (key: string) => (key.length === 4 ? yearName(key) : displayDateTimeFormatter({ year: 'numeric', month: 'long' }).format(new Date(Number(key.slice(0, 4)), Number(key.slice(5, 7)) - 1, 1)));

/** 月这一层按年分组；年这一层就一组。 */
const groups = computed(() => {
  if (props.level === 'year') return [{ year: '', periods: props.periods }];
  const out: { year: string; periods: (WorkoutPeriod | SleepPeriod)[] }[] = [];
  for (const period of props.periods) {
    const year = period.key.slice(0, 4);
    const last = out[out.length - 1];
    if (last?.year === year) last.periods.push(period);
    else out.push({ year, periods: [period] });
  }
  return out;
});

const isWorkout = (_period: WorkoutPeriod | SleepPeriod): _period is WorkoutPeriod => props.kind === 'workouts';
/** 分期占比环：四段弧，周长按 100 算。 */
const RING = [
  { key: 'deep', cls: 'deep' }, { key: 'light', cls: 'light' }, { key: 'rem', cls: 'rem' }, { key: 'awake', cls: 'awake' },
] as const;
const ring = (period: SleepPeriod) => {
  const total = RING.reduce((sum, part) => sum + period.stages[part.key], 0);
  if (total <= 0) return [];
  let start = 0;
  return RING.map((part) => {
    const length = (period.stages[part.key] / total) * 100;
    const arc = { cls: part.cls, dash: `${Math.max(0, length - 1.2)} ${100 - Math.max(0, length - 1.2)}`, offset: 25 - start };
    start += length;
    return arc;
  }).filter((arc) => Number.parseFloat(arc.dash) > 0);
};
const timelineOf = (key: string) => (key.length === 4 ? `${key}-12` : key);
const onOpen = (event: MouseEvent, key: string) => emit('open', key, event.currentTarget as HTMLElement);
</script>

<template>
  <div :class="['album-periods', `is-${level}`]">
    <section v-for="group in groups" :key="group.year || 'all'" class="period-group" :data-period-group="group.year || undefined">
      <h3 v-if="group.year" class="period-year">{{ yearName(group.year) }}</h3>
      <div class="period-grid">
        <button v-for="period in group.periods" :key="period.key" type="button" class="period-card" data-album-item
          :data-period="period.key" :data-timeline="timelineOf(period.key)" :aria-label="t.openPeriod(fullName(period.key))" @click="onOpen($event, period.key)">
          <span class="period-name">{{ level === 'year' ? yearName(period.key) : monthName(period.key) }}</span>
          <template v-if="isWorkout(period)">
            <strong class="period-lead">{{ t.workouts(period.count) }}</strong>
            <span class="period-facts">
              <span v-if="period.distance_m > 0">{{ t.distance }} <b>{{ formatDistance(period.distance_m) }}</b></span>
              <span>{{ t.duration }} <b>{{ formatDuration(period.duration_s / 60) }}</b></span>
            </span>
            <RouteGlyph v-if="period.cover" class="period-art route" :shape="period.cover" :stroke="2.4" />
          </template>
          <template v-else>
            <strong class="period-lead">{{ formatDuration((period as SleepPeriod).avg_duration_min) }}</strong>
            <span class="period-facts">
              <span>{{ t.avgOnset }} <b>{{ clockFromNoon((period as SleepPeriod).avg_onset_min) }}</b></span>
              <span><b>{{ t.nights((period as SleepPeriod).nights) }}</b></span>
            </span>
            <svg v-if="ring(period as SleepPeriod).length" class="period-art ring" viewBox="0 0 42 42" aria-hidden="true" focusable="false">
              <circle class="ring-base" cx="21" cy="21" r="15.915" />
              <circle v-for="arc in ring(period as SleepPeriod)" :key="arc.cls" :class="['ring-arc-part', arc.cls]" cx="21" cy="21" r="15.915" :stroke-dasharray="arc.dash" :stroke-dashoffset="arc.offset" />
            </svg>
          </template>
        </button>
      </div>
    </section>
  </div>
</template>

<style scoped>
.album-periods { display: grid; gap: 18px; }
.period-group { display: grid; gap: 10px; }
.period-year { margin: 4px 4px 0; color: var(--muted); font-size: var(--fs-sm); font-weight: 650; font-variant-numeric: tabular-nums; }
.period-grid { display: grid; gap: 12px; grid-template-columns: repeat(2, minmax(0, 1fr)); }
.is-year .period-grid { grid-template-columns: minmax(0, 1fr); }
@media (max-width: 560px) { .period-grid { grid-template-columns: minmax(0, 1fr); } }
.period-card {
  position: relative;
  display: grid;
  align-content: start;
  gap: 4px;
  min-width: 0;
  min-height: 132px;
  padding: 16px 18px;
  padding-inline-end: 112px;
  overflow: hidden;
  border: 0;
  border-radius: 22px;
  background: var(--mat-card);
  box-shadow: var(--mat-rim), var(--mat-shadow);
  color: inherit;
  font: inherit;
  text-align: start;
  cursor: pointer;
  transition: translate var(--dur-base) var(--ease-out), box-shadow var(--dur-base) ease;
}
.is-year .period-card { min-height: 168px; padding: 20px 24px; padding-inline-end: 200px; }
.period-card:hover { translate: 0 -2px; }
.period-card:focus-visible { outline: 2px solid var(--focus); outline-offset: 3px; }
.period-name { color: var(--muted); font-size: var(--fs-sm); font-weight: 600; }
.period-lead { color: var(--ink); font-size: var(--fs-xl, 1.4rem); font-weight: 700; font-variant-numeric: tabular-nums; overflow-wrap: anywhere; }
.is-year .period-lead { font-size: var(--fs-2xl, 1.8rem); }
.period-facts { display: flex; flex-wrap: wrap; gap: 2px 12px; color: var(--muted); font-size: var(--fs-xs); font-variant-numeric: tabular-nums; }
.period-facts b { color: var(--ink); font-weight: 600; }
.period-art { position: absolute; inset-block: 16px; inset-inline-end: 16px; width: 84px; height: calc(100% - 32px); }
.is-year .period-art { width: 160px; inset-inline-end: 24px; }
.period-art.route { color: var(--activity); opacity: .9; }
.ring { width: 76px; height: 76px; inset-block: auto; top: 50%; translate: 0 -50%; }
.is-year .ring { width: 112px; height: 112px; }
.ring circle { fill: none; stroke-width: 5; }
.ring-base { stroke: color-mix(in srgb, var(--ink) 6%, transparent); }
.ring-arc-part { stroke-linecap: butt; }
.ring-arc-part.deep { stroke: var(--sleep-deep); }
.ring-arc-part.light { stroke: var(--sleep-light); }
.ring-arc-part.rem { stroke: var(--sleep-rem); }
.ring-arc-part.awake { stroke: var(--sleep-awake); }
@media (max-width: 420px) {
  .period-card, .is-year .period-card { padding-inline-end: 96px; }
  .period-art, .is-year .period-art { width: 72px; inset-inline-end: 12px; }
}
@media (prefers-reduced-motion: reduce) { .period-card { transition: none; } }
</style>
