<script setup lang="ts">
/* 运动详情的力量训练卡：四格概览（总组数 / 总次数 / 总容量 / 组间总休息）+ 肌群组数占比条 + 逐组明细表。
 * 尚未拉到 detail 逐组报文时，退化显示汇总流里的按动作汇总，绝不补零编造重量或单组时长。 */
import { computed } from 'vue';
import GlyphTile from '../GlyphTile.vue';
import type { StrengthWorkoutDetail } from '../../types';
import { formatNumber } from '../../lib/format';
import { bodyMassUnitLabel, toBodyMass } from '../../lib/units';
import { useMessages } from '../../i18n';
import {
  resolveStrengthExerciseLabel,
  resolveStrengthMuscleLabel,
  strengthCatalogMessages,
} from '../../lib/strengthCatalog.i18n';
import { workoutStrengthMessages } from './WorkoutStrengthCard.i18n';

const props = defineProps<{
  strength: StrengthWorkoutDetail;
}>();

const t = useMessages(workoutStrengthMessages);
const catalog = useMessages(strengthCatalogMessages);

const num = (value: number, maxDigits = 0, minDigits = 0) =>
  formatNumber(value, { minimumFractionDigits: minDigits, maximumFractionDigits: maxDigits });

const formatDurationMs = (ms: number | null | undefined): string => {
  if (ms == null || ms <= 0) return '—';
  const totalSec = Math.round(ms / 1000);
  if (totalSec < 60) return t.value.durationSec(num(totalSec));
  const mins = Math.floor(totalSec / 60);
  const secs = String(totalSec % 60).padStart(2, '0');
  return t.value.durationMinSec(mins, secs);
};

const formatRestSeconds = (sec: number | null | undefined): string => {
  if (sec == null || sec < 0) return '—';
  if (sec < 60) return t.value.durationSec(num(sec));
  const mins = Math.floor(sec / 60);
  const secs = String(sec % 60).padStart(2, '0');
  return t.value.durationMinSec(mins, secs);
};

const volumeLabel = computed(() => {
  const kg = props.strength.total_volume_kg;
  if (kg == null || kg <= 0) return '—';
  const converted = toBodyMass(kg);
  const digits = converted >= 100 ? 0 : 1;
  return `${num(converted, digits)} ${bodyMassUnitLabel()}`;
});

const MUSCLE_COLORS: Record<string, string> = {
  chest: 'var(--heart)',
  back: 'var(--accent)',
  shoulders: 'var(--training)',
  biceps: 'var(--pace)',
  triceps: 'var(--activity)',
  forearms: 'var(--altitude)',
  core: 'var(--calories)',
  glutes: 'var(--sleep)',
  legs: 'color-mix(in srgb, var(--training) 65%, var(--accent))',
};

const muscleShares = computed(() => {
  const counts = new Map<string, number>();
  if (props.strength.sets.length > 0) {
    for (const set of props.strength.sets) {
      if (set.muscle_group) counts.set(set.muscle_group, (counts.get(set.muscle_group) ?? 0) + 1);
    }
  } else {
    for (const grp of props.strength.exercise_groups) {
      if (grp.muscle_group && grp.sets > 0) {
        counts.set(grp.muscle_group, (counts.get(grp.muscle_group) ?? 0) + grp.sets);
      }
    }
  }
  const total = Array.from(counts.values()).reduce((sum, n) => sum + n, 0);
  if (total <= 0) return [];
  return Array.from(counts.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([key, sets]) => ({
      key,
      label: resolveStrengthMuscleLabel(key, catalog.value) ?? key,
      sets,
      pct: (sets / total) * 100,
      color: MUSCLE_COLORS[key] ?? 'var(--accent)',
    }));
});

const setRows = computed(() =>
  props.strength.sets.map((set) => {
    const hasWeight = set.weight_value != null && set.weight_value > 0;
    const weightStr = hasWeight
      ? num(set.weight_value!, Number.isInteger(set.weight_value) ? 0 : 1)
      : '';
    return {
      index: set.set_index,
      exercise: resolveStrengthExerciseLabel(set.exercise_key, set.action_code, catalog.value),
      muscle: resolveStrengthMuscleLabel(set.muscle_group, catalog.value),
      load: hasWeight
        ? t.value.weightedLoad(weightStr, set.weight_unit, set.reps)
        : t.value.bodyweightLoad(set.reps),
      duration: formatDurationMs(set.duration_ms),
      hr: set.avg_hr != null && set.avg_hr > 0 ? `${num(set.avg_hr)} bpm` : '—',
    };
  }),
);

const groupRows = computed(() =>
  props.strength.exercise_groups.map((grp, idx) => ({
    key: `${grp.action_code}-${idx}`,
    exercise: resolveStrengthExerciseLabel(grp.exercise_key, grp.action_code, catalog.value),
    muscle: resolveStrengthMuscleLabel(grp.muscle_group, catalog.value),
    sets: num(grp.sets),
    totalReps: num(grp.total_reps),
  })),
);
</script>

<template>
  <section class="surface-card strength-card" :aria-label="t.aria">
    <div class="section-head">
      <GlyphTile name="power" tone="training" :size="42" />
      <div>
        <p class="section-eyebrow">{{ t.eyebrow }}</p>
        <h2>{{ t.title }}</h2>
      </div>
    </div>

    <dl class="summary-grid">
      <div class="stat-cell">
        <dt>{{ t.statSets }}</dt>
        <dd>{{ strength.total_sets > 0 ? `${num(strength.total_sets)} ${t.unitSets}` : '—' }}</dd>
      </div>
      <div class="stat-cell">
        <dt>{{ t.statReps }}</dt>
        <dd>{{ strength.total_reps > 0 ? `${num(strength.total_reps)} ${t.unitReps}` : '—' }}</dd>
      </div>
      <div class="stat-cell">
        <dt>{{ t.statVolume }}</dt>
        <dd>{{ volumeLabel }}</dd>
      </div>
      <div class="stat-cell">
        <dt>{{ t.statRest }}</dt>
        <dd>{{ formatRestSeconds(strength.rest_seconds) }}</dd>
      </div>
    </dl>

    <div v-if="muscleShares.length" class="muscle-block" :aria-label="t.muscleShareAria">
      <div class="muscle-bar" aria-hidden="true">
        <span
          v-for="item in muscleShares"
          :key="item.key"
          class="muscle-seg"
          :style="{ width: `${item.pct}%`, background: item.color }"
        />
      </div>
      <ul class="muscle-legend">
        <li v-for="item in muscleShares" :key="item.key">
          <span class="dot" :style="{ background: item.color }" aria-hidden="true" />
          <span class="m-name">{{ item.label }}</span>
          <span class="m-sets">{{ t.muscleSetsCount(item.sets) }}</span>
        </li>
      </ul>
    </div>

    <div v-if="setRows.length" class="table-wrap">
      <table class="set-table">
        <thead>
          <tr>
            <th scope="col" class="col-idx">{{ t.colSet }}</th>
            <th scope="col">{{ t.colExercise }}</th>
            <th scope="col" class="num">{{ t.colLoad }}</th>
            <th scope="col" class="num">{{ t.colDuration }}</th>
            <th scope="col" class="num">{{ t.colHr }}</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="row in setRows" :key="row.index">
            <td class="col-idx mono">#{{ row.index }}</td>
            <td class="col-ex">
              <span class="ex-name">{{ row.exercise }}</span>
              <span v-if="row.muscle" class="ex-muscle">{{ row.muscle }}</span>
            </td>
            <td class="num mono">{{ row.load }}</td>
            <td class="num mono muted">{{ row.duration }}</td>
            <td class="num mono muted">{{ row.hr }}</td>
          </tr>
        </tbody>
      </table>
    </div>

    <template v-else>
      <p class="fallback-note" role="status">{{ t.summaryOnlyNote }}</p>
      <div v-if="groupRows.length" class="table-wrap">
        <table class="set-table">
          <thead>
            <tr>
              <th scope="col">{{ t.colExercise }}</th>
              <th scope="col" class="num">{{ t.colSets }}</th>
              <th scope="col" class="num">{{ t.colTotalReps }}</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="row in groupRows" :key="row.key">
              <td class="col-ex">
                <span class="ex-name">{{ row.exercise }}</span>
                <span v-if="row.muscle" class="ex-muscle">{{ row.muscle }}</span>
              </td>
              <td class="num mono">{{ row.sets }}</td>
              <td class="num mono">{{ row.totalReps }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </template>
  </section>
</template>

<style scoped>
.strength-card { display: grid; gap: 14px; padding: 16px 18px 16px; border-radius: var(--radius-lg); }
.section-head { display: flex; align-items: center; gap: 10px; }
.section-head h2 { margin: 1px 0 0; font-size: var(--fs-2xl); letter-spacing: -.02em; }
.section-eyebrow { margin: 0; color: var(--subtle); font-family: var(--font-mono); font-size: var(--fs-2xs); font-weight: 700; letter-spacing: .16em; text-transform: uppercase; }

.summary-grid { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 10px; margin: 0; }
.stat-cell { padding: 10px 12px; border: 1px solid var(--mat-line); border-radius: var(--radius-md); background: var(--mat-inset); min-width: 0; }
.stat-cell dt { color: var(--subtle); font-size: var(--fs-2xs); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.stat-cell dd { margin: 4px 0 0; color: var(--ink); font-family: var(--font-mono); font-size: var(--fs-lg); font-weight: 600; font-variant-numeric: tabular-nums; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }

.muscle-block { display: grid; gap: 8px; }
.muscle-bar { display: flex; height: 8px; border-radius: 999px; overflow: hidden; background: var(--mat-inset); gap: 2px; }
.muscle-seg { height: 100%; min-width: 4px; border-radius: 999px; }
.muscle-legend { display: flex; flex-wrap: wrap; gap: 6px 14px; margin: 0; padding: 0; list-style: none; }
.muscle-legend li { display: inline-flex; align-items: center; gap: 6px; font-size: var(--fs-xs); color: var(--muted); }
.dot { width: 8px; height: 8px; border-radius: 50%; flex: 0 0 auto; }
.m-name { color: var(--ink); font-weight: 500; }
.m-sets { font-family: var(--font-mono); font-variant-numeric: tabular-nums; color: var(--subtle); }

.table-wrap { overflow-x: auto; border-top: 1px solid var(--mat-line); }
.set-table { width: 100%; border-collapse: collapse; font-size: var(--fs-sm); }
.set-table th { padding: 8px 6px; text-align: left; color: var(--subtle); font-size: var(--fs-2xs); font-weight: 600; border-bottom: 1px solid var(--mat-line); white-space: nowrap; }
.set-table td { padding: 9px 6px; border-bottom: 1px solid color-mix(in srgb, var(--mat-line) 65%, transparent); vertical-align: middle; }
.set-table tbody tr:last-child td { border-bottom: none; }
.col-idx { width: 48px; color: var(--subtle); }
.col-ex { display: flex; align-items: center; flex-wrap: wrap; gap: 6px; min-width: 150px; }
.ex-name { color: var(--ink); font-weight: 500; }
.ex-muscle { padding: 1px 7px; border-radius: 999px; border: 1px solid var(--mat-line); background: var(--mat-inset); color: var(--muted); font-size: var(--fs-2xs); white-space: nowrap; }
.num { text-align: right !important; white-space: nowrap; }
.mono { font-family: var(--font-mono); font-variant-numeric: tabular-nums; }
.muted { color: var(--muted); }
.fallback-note { margin: 0; color: var(--muted); font-size: var(--fs-xs); line-height: 1.55; }

@media (max-width: 720px) {
  .summary-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
}
</style>
