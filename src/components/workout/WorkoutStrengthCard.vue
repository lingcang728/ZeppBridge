<script setup lang="ts">
/* 运动详情的力量训练卡：四格概览（总组数 / 总次数 / 总训练量 / 组间总休息）+ 肌群胶囊 + 逐组明细表。
 * 台前调度（2026-11-13）起肌肉人形是另一张卡（WorkoutStrengthMapCard），两张共用页面建的那份
 * useStrengthDetail（联动状态）；单独渲染这张（测试）时自己建一份。
 * 尚未拉到 detail 逐组报文时，退化显示汇总流里的按动作汇总，绝不补零编造重量或单组时长。
 * 每组用时和 Zepp App 一样精确到百分之一秒（截断，不四舍五入），整数秒不带小数，并给出累计用时。 */
import { computed, toRef } from 'vue';
import GlyphTile from '../GlyphTile.vue';
import StrengthMuscleChips from './strength/StrengthMuscleChips.vue';
import type { StrengthWorkoutDetail } from '../../types';
import { formatNumber } from '../../lib/format';
import { bodyMassUnitLabel } from '../../lib/units';
import { kgIn, splitSetDuration, volumeUnitFor } from '../../lib/strengthFormat';
import { useMessages } from '../../i18n';
import { workoutStrengthMessages } from './WorkoutStrengthCard.i18n';
import { useStrengthDetail, type StrengthDetail } from '../../composables/useStrengthDetail';

const props = defineProps<{
  strength: StrengthWorkoutDetail;
  /** 页面建的共享联动状态（和肌肉人形卡共用）；不给就自己建一份。 */
  detail?: StrengthDetail;
}>();

const t = useMessages(workoutStrengthMessages);
const d = props.detail ?? useStrengthDetail(toRef(props, 'strength'));
const { focus, litGroups, muscleShares, secondaryShares } = d;

const num = (value: number, maxDigits = 0, minDigits = 0) =>
  formatNumber(value, { minimumFractionDigits: minDigits, maximumFractionDigits: maxDigits });

/** 和 Zepp App 一样到百分之一秒、截断不进位（22467 ms → 22.46）；整数秒不带小数（60000 → 1分00秒）。 */
const formatDurationMs = (ms: number | null | undefined): string => {
  const dur = splitSetDuration(ms);
  if (!dur) return '—';
  const secText = num(dur.seconds, dur.digits, dur.digits);
  if (dur.minutes === 0) return t.value.durationSec(secText);
  return t.value.durationMinSec(dur.minutes, dur.seconds < 10 ? `0${secText}` : secText);
};

const formatRestSeconds = (sec: number | null | undefined): string => {
  if (sec == null || sec < 0) return '—';
  if (sec < 60) return t.value.durationSec(num(sec));
  const mins = Math.floor(sec / 60);
  const secs = String(sec % 60).padStart(2, '0');
  return t.value.durationMinSec(mins, secs);
};

/** 总训练量的单位跟逐组记录走（各组都记 kg 就是 kg），混着记才按设置（用户：组里 kg、总数 lb，看不懂）。 */
const volumeLabel = computed(() => {
  const kg = props.strength.total_volume_kg;
  if (kg == null || kg <= 0) return '—';
  const units = props.strength.sets.filter((set) => set.weight_value != null && set.weight_value > 0).map((set) => set.weight_unit);
  const unit = volumeUnitFor(units, bodyMassUnitLabel() === 'lb' ? 'lb' : 'kg');
  const converted = kgIn(kg, unit);
  return `${num(converted, converted >= 100 ? 0 : 1)} ${unit}`;
});

const setRows = computed(() => {
  // 累计用时 = 前面各组用时之和（和 Zepp App 明细里的「运动时长」列一致）；中间哪组
  // 没有用时，从那组起就不再累计，不拿 0 顶上。
  let elapsed: number | null = 0;
  return props.strength.sets.map((set) => {
    const hasWeight = set.weight_value != null && set.weight_value > 0;
    const weightStr = hasWeight ? num(set.weight_value!, Number.isInteger(set.weight_value) ? 0 : 1) : '';
    elapsed = elapsed != null && set.duration_ms != null && set.duration_ms > 0 ? elapsed + set.duration_ms : null;
    return {
      id: `s${set.set_index}`,
      index: set.set_index,
      exercise: d.exerciseOf(set),
      muscle: d.muscleOf(set),
      muscleTitle: d.muscleTitle(set),
      load: hasWeight ? t.value.weightedLoad(weightStr, set.weight_unit, set.reps) : t.value.bodyweightLoad(set.reps),
      duration: formatDurationMs(set.duration_ms),
      elapsed: formatDurationMs(elapsed),
      hr: set.avg_hr != null && set.avg_hr > 0 ? `${num(set.avg_hr)} bpm` : '—',
      kcal: set.calories_kcal != null && set.calories_kcal >= 0 ? t.value.caloriesValue(num(set.calories_kcal, 1)) : '—',
    };
  });
});

const groupRows = computed(() =>
  props.strength.exercise_groups.map((grp, idx) => ({
    key: `g${idx}`,
    exercise: d.exerciseOf(grp),
    muscle: d.muscleOf(grp),
    muscleTitle: d.muscleTitle(grp),
    sets: num(grp.sets),
    totalReps: num(grp.total_reps),
  })),
);

const rowEvents = (id: string) => ({
  pointerenter: () => d.hoverOn('row', id),
  pointerleave: () => d.hoverOn('row', null),
  focus: () => d.hoverOn('row', id),
  blur: () => d.hoverOn('row', null),
  click: () => d.pin('row', id),
});
const setTable = (el: unknown) => { d.tableWrap.value = (el as HTMLElement | null) ?? null; };
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
      <div class="stat-cell" :title="t.statVolumeHint">
        <dt class="has-hint">{{ t.statVolume }}</dt>
        <dd>{{ volumeLabel }}</dd>
      </div>
      <div class="stat-cell">
        <dt>{{ t.statRest }}</dt>
        <dd>{{ formatRestSeconds(strength.rest_seconds) }}</dd>
      </div>
    </dl>

    <div class="detail-col">
      <StrengthMuscleChips
        v-if="muscleShares.length"
        :primary="muscleShares"
        :secondary="secondaryShares"
        :lit="litGroups"
        :focused="!!focus && focus.kind !== 'row'"
        :sets-count="t.muscleSetsCount"
        :secondary-label="t.secondaryMuscles"
        :label="t.muscleChipsAria"
        @hover="d.hoverOn('group', $event)"
        @pin="d.pin('group', $event)"
      />

      <div v-if="setRows.length" :ref="setTable" class="table-wrap">
        <table class="set-table">
          <thead>
            <tr>
              <th scope="col" class="col-idx">{{ t.colSet }}</th>
              <th scope="col">{{ t.colExercise }}</th>
              <th scope="col" class="num">{{ t.colLoad }}</th>
              <th scope="col" class="num col-dur">{{ t.colDuration }}</th>
              <th scope="col" class="num col-elapsed">{{ t.colElapsed }}</th>
              <th scope="col" class="num col-hr">{{ t.colHr }}</th>
              <th scope="col" class="num col-kcal">{{ t.colCalories }}</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="row in setRows" :key="row.id" :class="d.rowClass(row.id)" tabindex="0" v-on="rowEvents(row.id)">
              <td class="col-idx mono">#{{ row.index }}</td>
              <td class="col-ex">
                <span class="ex-name" :class="{ unknown: row.exercise.unknownCode != null }">{{ row.exercise.name }}</span>
                <span v-if="row.exercise.unknownCode != null" class="ex-code mono" :title="t.unknownExerciseHint(row.exercise.unknownCode)">#{{ row.exercise.unknownCode }}</span>
                <span v-if="row.muscle" class="ex-muscle" :title="row.muscleTitle">{{ row.muscle }}</span>
              </td>
              <td class="num mono">{{ row.load }}</td>
              <td class="num mono muted col-dur">{{ row.duration }}</td>
              <td class="num mono muted col-elapsed">{{ row.elapsed }}</td>
              <td class="num mono muted col-hr">{{ row.hr }}</td>
              <td class="num mono muted col-kcal">{{ row.kcal }}</td>
            </tr>
          </tbody>
        </table>
      </div>

      <template v-else>
        <p class="fallback-note" role="status">{{ t.summaryOnlyNote }}</p>
        <div v-if="groupRows.length" :ref="setTable" class="table-wrap">
          <table class="set-table">
            <thead>
              <tr>
                <th scope="col">{{ t.colExercise }}</th>
                <th scope="col" class="num">{{ t.colSets }}</th>
                <th scope="col" class="num">{{ t.colTotalReps }}</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="row in groupRows" :key="row.key" :class="d.rowClass(row.key)" tabindex="0" v-on="rowEvents(row.key)">
                <td class="col-ex">
                  <span class="ex-name" :class="{ unknown: row.exercise.unknownCode != null }">{{ row.exercise.name }}</span>
                  <span v-if="row.exercise.unknownCode != null" class="ex-code mono" :title="t.unknownExerciseHint(row.exercise.unknownCode)">#{{ row.exercise.unknownCode }}</span>
                  <span v-if="row.muscle" class="ex-muscle" :title="row.muscleTitle">{{ row.muscle }}</span>
                </td>
                <td class="num mono">{{ row.sets }}</td>
                <td class="num mono">{{ row.totalReps }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </template>
    </div>
  </section>
</template>

<style scoped>
.strength-card { display: grid; gap: 14px; padding: 16px 18px 16px; border-radius: var(--radius-lg); overflow: clip; container-type: inline-size; }
.section-head { display: flex; align-items: center; gap: 10px; }
.section-head h2 { margin: 1px 0 0; font-size: var(--fs-2xl); letter-spacing: -.02em; }
.section-eyebrow { margin: 0; color: var(--subtle); font-family: var(--font-mono); font-size: var(--fs-2xs); font-weight: 700; letter-spacing: .16em; text-transform: uppercase; }

.summary-grid { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 10px; margin: 0; }
.stat-cell { padding: 10px 12px; border: 1px solid var(--mat-line); border-radius: var(--radius-md); background: var(--mat-inset); min-width: 0; }
.stat-cell dt { color: var(--subtle); font-size: var(--fs-2xs); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.stat-cell dt.has-hint { width: fit-content; max-width: 100%; text-decoration: underline dotted color-mix(in srgb, var(--subtle) 70%, transparent); text-underline-offset: 3px; cursor: help; }
.stat-cell dd { margin: 4px 0 0; color: var(--ink); font-family: var(--font-mono); font-size: var(--fs-lg); font-weight: 600; font-variant-numeric: tabular-nums; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }

.detail-col { display: grid; gap: 12px; align-content: start; min-width: 0; }

/* 表格按窗口宽收列（下面的容器查询），不出横向滚动：滚动条藏起来之后，横着滑只能靠拖到底那条（2026-11-13 用户）。 */
.table-wrap { overflow-x: auto; border-top: 1px solid var(--mat-line); }
.set-table { width: 100%; border-collapse: collapse; font-size: var(--fs-sm); }
.set-table th { padding: 8px 6px; text-align: left; color: var(--subtle); font-size: var(--fs-2xs); font-weight: 600; border-bottom: 1px solid var(--mat-line); white-space: nowrap; }
.set-table td { padding: 9px 6px; border-bottom: 1px solid color-mix(in srgb, var(--mat-line) 65%, transparent); vertical-align: middle; }
.set-table tbody tr:last-child td { border-bottom: none; }
.set-table tbody tr { cursor: default; outline: none; transition: opacity .18s ease, background-color .18s ease; }
.set-table tbody tr.lit td { background: color-mix(in srgb, var(--training) 10%, transparent); }
.set-table tbody tr.dim { opacity: .4; }
.set-table tbody tr:focus-visible td { box-shadow: inset 0 0 0 1px var(--focus); }
.col-idx { width: 44px; color: var(--subtle); }
.col-ex { display: flex; align-items: center; flex-wrap: wrap; gap: 6px; min-width: 0; }
.ex-name { color: var(--ink); font-weight: 500; }
.ex-name.unknown { color: var(--muted); }
.ex-code { padding: 0 6px; border-radius: 5px; background: var(--mat-inset); color: var(--subtle); font-size: var(--fs-2xs); cursor: help; }
.ex-muscle { padding: 1px 7px; border-radius: 999px; border: 1px solid var(--mat-line); background: var(--mat-inset); color: var(--muted); font-size: var(--fs-2xs); white-space: nowrap; }
.num { text-align: right !important; white-space: nowrap; }
.mono { font-family: var(--font-mono); font-variant-numeric: tabular-nums; }
.muted { color: var(--muted); }
.fallback-note { margin: 0; color: var(--muted); font-size: var(--fs-xs); line-height: 1.55; }

/* 窗口（台前调度）窄了，四格排成两行。 */
@container (max-width: 520px) {
  .summary-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
}
@container (max-width: 640px) {
  .col-elapsed, .col-kcal { display: none; }
}
@container (max-width: 440px) {
  .col-dur, .col-hr { display: none; }
}
@media (prefers-reduced-motion: reduce) { .set-table tbody tr { transition: none; } }
</style>
