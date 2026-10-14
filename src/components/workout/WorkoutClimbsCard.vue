<script setup lang="ts">
/* 运动详情的爬升卡：段落由后端（core/workout_climbs）从逐点海拔识别，这里只排版。
   climbs 为 null 时不渲染（没有海拔采样或距离不可信）；有海拔但没有够格的段写一行「没有明显爬升」，不编段。 */
import { computed } from 'vue';
import GlyphTile from '../GlyphTile.vue';
import Icon from '../Icon.vue';
import type { WorkoutClimbs } from '../../types';
import { formatNumber } from '../../lib/format';
import { distanceUnitLabel, elevationUnitLabel, paceMinutesPerBigUnit, paceUnitLabel, toBigDistance, toElevation } from '../../lib/units';
import { useMessages } from '../../i18n';
import { workoutClimbsMessages } from './WorkoutClimbsCard.i18n';

const props = defineProps<{ climbs: WorkoutClimbs; cycling: boolean }>();
const t = useMessages(workoutClimbsMessages);

const num = (value: number, digits = 0) => formatNumber(value, { minimumFractionDigits: digits, maximumFractionDigits: digits });
const clock = (minutes: number) => {
  const total = Math.round(paceMinutesPerBigUnit(minutes) * 60);
  return `${Math.floor(total / 60)}'${String(total % 60).padStart(2, '0')}"`;
};

const rows = computed(() => props.climbs.segments.map((segment) => {
  const up = segment.kind === 'climb';
  const elevation = elevationUnitLabel();
  const km = (meters: number) => num(toBigDistance(meters), 1);
  const pace = segment.average_pace_min_per_km;
  let paceText = '—';
  if (pace !== null && pace > 0) {
    paceText = props.cycling
      ? `${num(toBigDistance(1000) / (pace / 60), 1)} ${t.value.perHour(distanceUnitLabel())}`
      : `${clock(pace)} ${paceUnitLabel()}`;
  }
  return {
    key: segment.start_time,
    up,
    label: up ? t.value.climb : t.value.descent,
    range: `${t.value.range(km(segment.start_distance_m), km(segment.end_distance_m))} ${distanceUnitLabel()}`,
    change: `${up ? '+' : '−'}${num(Math.abs(toElevation(segment.elevation_change_m)))} ${elevation}`,
    grade: `${up ? '' : '−'}${num(Math.abs(segment.average_grade_pct), 1)}%`,
    vertical: segment.vertical_speed_m_per_h === null ? '—' : `${num(toElevation(segment.vertical_speed_m_per_h))} ${t.value.perHour(elevation)}`,
    hr: segment.average_hr === null ? '—' : `${num(segment.average_hr)} bpm`,
    pace: paceText,
  };
}));

const how = computed(() => {
  const m = props.climbs.method;
  return t.value.how(m.smoothing_window_s, m.reversal_m, m.min_change_m, m.min_grade_pct, m.moving_speed_m_s);
});
</script>

<template>
  <section class="surface-card climbs-card" :aria-label="t.aria">
    <div class="section-head">
      <GlyphTile name="health-watch" tone="altitude" :size="42" />
      <div><p class="section-eyebrow">{{ t.eyebrow }}</p><h2>{{ t.title }}</h2></div>
    </div>
    <p v-if="!rows.length" class="flat" role="status">{{ t.flat }}</p>
    <ol v-else class="climb-list">
      <li v-for="row in rows" :key="row.key" :class="{ up: row.up }">
        <div class="lead">
          <span class="kind"><Icon class="slope" name="arrow-right" :size="13" />{{ row.label }}</span>
          <span class="range">{{ row.range }}</span>
        </div>
        <strong class="change">{{ row.change }}</strong>
        <dl class="facts">
          <div><dt>{{ t.grade }}</dt><dd>{{ row.grade }}</dd></div>
          <div><dt>{{ t.vertical }}</dt><dd>{{ row.vertical }}</dd></div>
          <div><dt>{{ t.heartRate }}</dt><dd>{{ row.hr }}</dd></div>
          <div><dt>{{ cycling ? t.speed : t.pace }}</dt><dd>{{ row.pace }}</dd></div>
        </dl>
      </li>
    </ol>
    <details class="how">
      <summary>{{ t.howTitle }}</summary>
      <p>{{ how }}</p>
    </details>
  </section>
</template>

<style scoped>
.climbs-card { padding: 16px 18px 14px; border-radius: var(--radius-lg); }
.section-head { display: flex; align-items: center; gap: 10px; margin-bottom: 10px; }
.section-head h2 { margin: 1px 0 0; font-size: var(--fs-2xl); letter-spacing: -.02em; }
.section-eyebrow { margin: 0; color: var(--subtle); font-family: var(--font-mono); font-size: var(--fs-2xs); font-weight: 700; letter-spacing: .16em; }
.flat { margin: 0 2px 6px; color: var(--muted); font-size: var(--fs-sm); }
.climb-list { display: grid; margin: 0; padding: 0; list-style: none; }
.climb-list li { display: grid; grid-template-columns: minmax(130px, .9fr) minmax(84px, auto) minmax(0, 2.6fr); align-items: center; gap: 6px 16px; padding: 10px 2px; }
.climb-list li + li { border-top: 1px solid var(--mat-line); }
.lead { display: grid; gap: 3px; min-width: 0; }
.kind { display: inline-flex; align-items: center; gap: 5px; color: var(--muted); font-size: var(--fs-xs); font-weight: 600; }
.up .kind { color: var(--altitude); }
.slope { transform: rotate(40deg); }
.up .slope { transform: rotate(-40deg); }
.range { color: var(--subtle); font-family: var(--font-mono); font-size: var(--fs-2xs); font-variant-numeric: tabular-nums; }
.change { color: var(--ink); font-family: var(--font-mono); font-size: var(--fs-lg); font-variant-numeric: tabular-nums; white-space: nowrap; }
.facts { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 4px 12px; margin: 0; }
.facts div { min-width: 0; }
.facts dt { color: var(--subtle); font-size: var(--fs-2xs); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.facts dd { margin: 1px 0 0; color: var(--ink); font-family: var(--font-mono); font-size: var(--fs-xs); font-variant-numeric: tabular-nums; white-space: nowrap; }
.how { margin-top: 8px; color: var(--muted); font-size: var(--fs-2xs); }
.how summary { width: max-content; min-height: 24px; padding: 4px 2px; cursor: pointer; color: var(--subtle); }
.how p { margin: 4px 2px 2px; line-height: 1.6; }
@media (max-width: 760px) {
  .climb-list li { grid-template-columns: minmax(0, 1fr) auto; }
  .facts { grid-column: 1 / -1; grid-template-columns: repeat(2, minmax(0, 1fr)); }
}
</style>
