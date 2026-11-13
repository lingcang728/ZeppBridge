<script setup lang="ts">
/* 运动详情的力量训练卡：四格概览（总组数 / 总次数 / 总容量 / 组间总休息）+ 肌群组数占比条 + 逐组明细表。
 * 尚未拉到 detail 逐组报文时，退化显示汇总流里的按动作汇总，绝不补零编造重量或单组时长。
 * 1001 起的新动作名与主 / 辅肌群来自 Zepp 动作目录（useStrengthCatalog，#163）；
 * 每组用时和 Zepp App 一样精确到百分之一秒（截断，不四舍五入），并给出累计用时。 */
import { computed, shallowRef } from 'vue';
import GlyphTile from '../GlyphTile.vue';
import WorkoutMuscleMap from './WorkoutMuscleMap.vue';
import { muscleLoad, type MuscleRowInput } from '../../lib/anatomy/zeppMuscles';
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
import { useStrengthCatalog } from '../../composables/useStrengthCatalog';
import type { StrengthExerciseGroup, StrengthSetRow } from '../../types';

const props = defineProps<{
  strength: StrengthWorkoutDetail;
}>();

const t = useMessages(workoutStrengthMessages);
const catalog = useMessages(strengthCatalogMessages);
const zepp = useStrengthCatalog();

const num = (value: number, maxDigits = 0, minDigits = 0) =>
  formatNumber(value, { minimumFractionDigits: minDigits, maximumFractionDigits: maxDigits });

/** 和 Zepp App 一样到百分之一秒，截断不进位（22467 ms → 22.46）。 */
const formatDurationMs = (ms: number | null | undefined): string => {
  if (ms == null || ms <= 0) return '—';
  const totalCs = Math.floor(ms / 10);
  const mins = Math.floor(totalCs / 6000);
  const secs = (totalCs % 6000) / 100;
  const secText = num(secs, 2, 2);
  if (mins === 0) return t.value.durationSec(secText);
  return t.value.durationMinSec(mins, secs < 10 ? `0${secText}` : secText);
};

type RowKeys = 'action_code' | 'muscle_group' | 'exercise_key' | 'exercise_name' | 'secondary_muscle_groups';
type StrengthRowLike = Pick<StrengthSetRow, RowKeys> | Pick<StrengthExerciseGroup, RowKeys>;

/** 主肌群：后端已补就用后端的；否则看当前语言的 Zepp 目录。 */
const primaryOf = (row: StrengthRowLike): string | null =>
  row.muscle_group ?? zepp.value.get(row.action_code)?.primary_groups[0] ?? null;

const secondaryOf = (row: StrengthRowLike): string[] => {
  const primary = primaryOf(row);
  const list = row.secondary_muscle_groups?.length
    ? row.secondary_muscle_groups
    : (zepp.value.get(row.action_code)?.secondary_groups ?? []);
  return list.filter((group) => group !== primary);
};

const exerciseOf = (row: StrengthRowLike): string =>
  resolveStrengthExerciseLabel(
    row.exercise_key,
    row.action_code,
    catalog.value,
    zepp.value.get(row.action_code)?.name,
    row.exercise_name,
  );

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

/** 每行算几组：逐组明细一行一组，汇总流按动作的组数。id 和表格行的 key 一致，联动靠它。 */
const weightedRows = computed<Array<{ id: string; row: StrengthRowLike; sets: number }>>(() =>
  props.strength.sets.length > 0
    ? props.strength.sets.map((row) => ({ id: `s${row.set_index}`, row, sets: 1 }))
    : props.strength.exercise_groups
      .map((row, idx) => ({ id: `g${idx}`, row, sets: row.sets }))
      .filter(({ sets }) => sets > 0),
);

/** 人形图的负荷：有目录位置号用位置号（分左右、更细），否则退回九大肌群。 */
const load = computed(() =>
  muscleLoad(weightedRows.value.map(({ id, row, sets }): MuscleRowInput => {
    const entry = zepp.value.get(row.action_code);
    return {
      id,
      sets,
      mainPositions: entry?.main_positions ?? [],
      subPositions: entry?.sub_positions ?? [],
      primaryGroup: primaryOf(row),
      secondaryGroups: secondaryOf(row),
    };
  })),
);

/* 联动：悬停优先，点击（触屏）钉住；再点一次取消。 */
const hoverRow = shallowRef<string | null>(null);
const pinnedRow = shallowRef<string | null>(null);
const hoverShape = shallowRef<string | null>(null);
const pinnedShape = shallowRef<string | null>(null);
const activeRow = computed(() => hoverRow.value ?? (hoverShape.value ? null : pinnedRow.value));
const activeShape = computed(() => (hoverRow.value ? null : hoverShape.value ?? pinnedShape.value));
const togglePinRow = (id: string) => { pinnedShape.value = null; pinnedRow.value = pinnedRow.value === id ? null : id; };
const togglePinShape = (key: string) => { pinnedRow.value = null; pinnedShape.value = pinnedShape.value === key ? null : key; };
/** 表格行在联动里的样子：亮（练到正停着的那块肌肉）/ 淡（没练到）。 */
const rowClass = (id: string) => {
  const shape = activeShape.value;
  if (shape) return load.value.byShape.get(shape)?.rows.has(id) ? 'lit' : 'dim';
  return activeRow.value === id ? 'lit' : undefined;
};

const muscleShares = computed(() => {
  const counts = new Map<string, number>();
  for (const { row, sets } of weightedRows.value) {
    const group = primaryOf(row);
    if (group) counts.set(group, (counts.get(group) ?? 0) + sets);
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

/** 辅助肌群：哪些肌群在几组里是「辅助」（Zepp App 里的黄色）。不进占比条，单列一行。 */
const secondaryShares = computed(() => {
  const counts = new Map<string, number>();
  for (const { row, sets } of weightedRows.value) {
    for (const group of secondaryOf(row)) counts.set(group, (counts.get(group) ?? 0) + sets);
  }
  return Array.from(counts.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([key, sets]) => ({
      key,
      label: resolveStrengthMuscleLabel(key, catalog.value) ?? key,
      sets,
      color: MUSCLE_COLORS[key] ?? 'var(--accent)',
    }));
});

const muscleTitle = (row: StrengthRowLike): string | undefined => {
  const names = secondaryOf(row)
    .map((group) => resolveStrengthMuscleLabel(group, catalog.value))
    .filter((name): name is string => !!name);
  return names.length ? `${t.value.secondaryMuscles}: ${names.join(' · ')}` : undefined;
};

const setRows = computed(() => {
  // 累计用时 = 前面各组用时之和（和 Zepp App 明细里的「运动时长」列一致）；中间哪组
  // 没有用时，从那组起就不再累计，不拿 0 顶上。
  let elapsed: number | null = 0;
  return props.strength.sets.map((set) => {
    const hasWeight = set.weight_value != null && set.weight_value > 0;
    const weightStr = hasWeight
      ? num(set.weight_value!, Number.isInteger(set.weight_value) ? 0 : 1)
      : '';
    elapsed = elapsed != null && set.duration_ms != null && set.duration_ms > 0 ? elapsed + set.duration_ms : null;
    return {
      id: `s${set.set_index}`,
      index: set.set_index,
      exercise: exerciseOf(set),
      muscle: resolveStrengthMuscleLabel(primaryOf(set), catalog.value),
      muscleTitle: muscleTitle(set),
      load: hasWeight
        ? t.value.weightedLoad(weightStr, set.weight_unit, set.reps)
        : t.value.bodyweightLoad(set.reps),
      duration: formatDurationMs(set.duration_ms),
      elapsed: formatDurationMs(elapsed),
      hr: set.avg_hr != null && set.avg_hr > 0 ? `${num(set.avg_hr)} bpm` : '—',
      kcal: set.calories_kcal != null && set.calories_kcal >= 0
        ? t.value.caloriesValue(num(set.calories_kcal, 1))
        : '—',
    };
  });
});

const groupRows = computed(() =>
  props.strength.exercise_groups.map((grp, idx) => ({
    key: `g${idx}`,
    exercise: exerciseOf(grp),
    muscle: resolveStrengthMuscleLabel(primaryOf(grp), catalog.value),
    muscleTitle: muscleTitle(grp),
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

    <div v-if="muscleShares.length" class="muscle-block" :class="{ 'has-map': load.byShape.size > 0 }" :aria-label="t.muscleShareAria">
      <WorkoutMuscleMap
        v-if="load.byShape.size"
        class="muscle-figure"
        :load="load"
        :active-row="activeRow"
        :active-shape="activeShape"
        @hover-shape="hoverShape = $event"
        @pin-shape="togglePinShape"
      />
      <div class="muscle-lists">
      <ul class="muscle-legend">
        <li v-for="item in muscleShares" :key="item.key">
          <span class="dot" :style="{ background: item.color }" aria-hidden="true" />
          <span class="m-name">{{ item.label }}</span>
          <span class="m-sets">{{ t.muscleSetsCount(item.sets) }}</span>
        </li>
      </ul>
      <ul v-if="secondaryShares.length" class="muscle-legend secondary" :aria-label="t.secondaryMuscles">
        <li class="sec-label">{{ t.secondaryMuscles }}</li>
        <li v-for="item in secondaryShares" :key="item.key">
          <span class="dot hollow" :style="{ borderColor: item.color }" aria-hidden="true" />
          <span class="m-name">{{ item.label }}</span>
          <span class="m-sets">{{ t.muscleSetsCount(item.sets) }}</span>
        </li>
      </ul>
      </div>
    </div>

    <div v-if="setRows.length" class="table-wrap">
      <table class="set-table">
        <thead>
          <tr>
            <th scope="col" class="col-idx">{{ t.colSet }}</th>
            <th scope="col">{{ t.colExercise }}</th>
            <th scope="col" class="num">{{ t.colLoad }}</th>
            <th scope="col" class="num">{{ t.colDuration }}</th>
            <th scope="col" class="num">{{ t.colElapsed }}</th>
            <th scope="col" class="num">{{ t.colHr }}</th>
            <th scope="col" class="num">{{ t.colCalories }}</th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="row in setRows"
            :key="row.id"
            :class="rowClass(row.id)"
            tabindex="0"
            @pointerenter="hoverRow = row.id"
            @pointerleave="hoverRow = null"
            @focus="hoverRow = row.id"
            @blur="hoverRow = null"
            @click="togglePinRow(row.id)"
          >
            <td class="col-idx mono">#{{ row.index }}</td>
            <td class="col-ex">
              <span class="ex-name">{{ row.exercise }}</span>
              <span v-if="row.muscle" class="ex-muscle" :title="row.muscleTitle">{{ row.muscle }}</span>
            </td>
            <td class="num mono">{{ row.load }}</td>
            <td class="num mono muted">{{ row.duration }}</td>
            <td class="num mono muted">{{ row.elapsed }}</td>
            <td class="num mono muted">{{ row.hr }}</td>
            <td class="num mono muted">{{ row.kcal }}</td>
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
            <tr
              v-for="row in groupRows"
              :key="row.key"
              :class="rowClass(row.key)"
              tabindex="0"
              @pointerenter="hoverRow = row.key"
              @pointerleave="hoverRow = null"
              @focus="hoverRow = row.key"
              @blur="hoverRow = null"
              @click="togglePinRow(row.key)"
            >
              <td class="col-ex">
                <span class="ex-name">{{ row.exercise }}</span>
                <span v-if="row.muscle" class="ex-muscle" :title="row.muscleTitle">{{ row.muscle }}</span>
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

.muscle-block { display: grid; align-items: center; gap: 12px 20px; }
.muscle-block.has-map { grid-template-columns: minmax(200px, 280px) minmax(0, 1fr); }
.muscle-figure { padding: 10px 8px 8px; border-radius: var(--radius-md); background: var(--mat-inset); }
.muscle-lists { display: grid; gap: 10px; align-content: center; min-width: 0; }
/* 有人形时图例竖排在右边，一行一个肌群。 */
.has-map .muscle-legend { flex-direction: column; flex-wrap: nowrap; gap: 6px; }
.has-map .muscle-legend li { font-size: var(--fs-sm); }
.has-map .muscle-legend.secondary .sec-label { margin-top: 4px; }
.muscle-legend { display: flex; flex-wrap: wrap; gap: 6px 14px; margin: 0; padding: 0; list-style: none; }
.muscle-legend li { display: inline-flex; align-items: center; gap: 6px; font-size: var(--fs-xs); color: var(--muted); }
.dot { width: 8px; height: 8px; border-radius: 50%; flex: 0 0 auto; }
.dot.hollow { box-sizing: border-box; border: 2px solid; background: transparent; }
.muscle-legend.secondary .sec-label { color: var(--subtle); font-size: var(--fs-2xs); font-weight: 600; }
.m-name { color: var(--ink); font-weight: 500; }
.m-sets { font-family: var(--font-mono); font-variant-numeric: tabular-nums; color: var(--subtle); }

.table-wrap { overflow-x: auto; border-top: 1px solid var(--mat-line); }
.set-table { width: 100%; border-collapse: collapse; font-size: var(--fs-sm); }
.set-table th { padding: 8px 6px; text-align: left; color: var(--subtle); font-size: var(--fs-2xs); font-weight: 600; border-bottom: 1px solid var(--mat-line); white-space: nowrap; }
.set-table td { padding: 9px 6px; border-bottom: 1px solid color-mix(in srgb, var(--mat-line) 65%, transparent); vertical-align: middle; }
.set-table tbody tr:last-child td { border-bottom: none; }
.set-table tbody tr { cursor: default; outline: none; transition: opacity .18s ease, background-color .18s ease; }
.set-table tbody tr.lit td { background: color-mix(in srgb, var(--training) 10%, transparent); }
.set-table tbody tr.dim { opacity: .4; }
.set-table tbody tr:focus-visible td { box-shadow: inset 0 0 0 1px var(--focus); }
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
  .muscle-block.has-map { grid-template-columns: minmax(0, 1fr); }
}
@media (prefers-reduced-motion: reduce) { .set-table tbody tr { transition: none; } }
</style>
