<script setup lang="ts">
/**
 * 第 ① 步：分析哪次运动。可以不选——不选时分析截至今天的最近 N 天。
 *
 * 同名的运动很多（「AI 识别活动」能有几十条），所以按天排成一条时间线，每一条是一枚
 * 胶囊：左边是运动图标，中间是名字和时间、时长、距离、均心率，右边一枚圆勾——
 * 选中时整枚胶囊点亮。以前是一列带圆圈的文字加「上一页 1/12 下一页」，和页面上
 * 其余的玻璃、胶囊不是一种东西；现在往下拉「再看 6 条」，不用翻页。
 */
import { computed, ref, watch } from 'vue';
import Icon from '../Icon.vue';
import type { Workout } from '../../types';
import { formatDate, formatDistance, formatDuration, formatTime } from '../../lib/format';
import { workoutDisplayLabel, workoutDurationMinutes } from '../../lib/workouts';
import { defineMessages, useMessages } from '../../i18n';

const props = defineProps<{ workouts: Workout[]; selectedIds: string[]; recentDays: number }>();
const emit = defineEmits<{ (event: 'toggle', id: string): void }>();

const t = useMessages(defineMessages(
  {
    title: '分析哪次运动',
    hint: '可多选，也可以不选',
    noneSelected: (days: number) => `没选运动：分析最近 ${days} 天（截至今天）。`,
    selectedCount: (count: number) => `已选 ${count} 次`,
    empty: '本机还没有运动记录',
    remove: '取消选择',
    avgHr: (bpm: number) => `均心率 ${bpm}`,
    showMore: (count: number) => `再看 ${count} 条`,
    showLess: '收起',
  },
  {
    title: 'Which workout',
    hint: 'Pick one or more, or none',
    noneSelected: (days: number) => `None selected: the last ${days} days up to today are analysed.`,
    selectedCount: (count: number) => `${count} selected`,
    empty: 'No workouts on this machine yet',
    remove: 'Deselect',
    avgHr: (bpm: number) => `avg HR ${bpm}`,
    showMore: (count: number) => `Show ${count} more`,
    showLess: 'Show fewer',
  },
  {
    title: 'Qué entrenamiento',
    hint: 'Elige uno o varios, o ninguno',
    noneSelected: (days: number) => `Sin entrenamientos elegidos: se analizan los últimos ${days} días, hasta hoy.`,
    selectedCount: (count: number) => `${count} seleccionados`,
    empty: 'Aún no hay entrenamientos en este equipo',
    remove: 'Quitar',
    avgHr: (bpm: number) => `FC media ${bpm}`,
    showMore: (count: number) => `Ver ${count} más`,
    showLess: 'Ver menos',
  },
  'components/ai/WorkoutPicker',
));

const selected = computed(() => props.workouts.filter((workout) => props.selectedIds.includes(workout.workout_id)));

const STEP = 6;
const visible = ref(STEP);
watch(() => props.workouts.length, (length) => { visible.value = Math.min(Math.max(STEP, visible.value), Math.max(STEP, length)); });
const remaining = computed(() => Math.max(0, props.workouts.length - visible.value));
const groups = computed(() => {
  const byDay = new Map<string, Workout[]>();
  for (const workout of props.workouts.slice(0, visible.value)) {
    const day = formatDate(workout.start_time, 'long');
    byDay.set(day, [...(byDay.get(day) ?? []), workout]);
  }
  return [...byDay.entries()].map(([day, items]) => ({ day, items }));
});

const facts = (workout: Workout): string => {
  const minutes = workoutDurationMinutes(workout);
  return [
    formatTime(workout.start_time),
    minutes ? formatDuration(minutes) : null,
    workout.distance_meters ? formatDistance(workout.distance_meters) : null,
    workout.avg_hr ? t.value.avgHr(workout.avg_hr) : null,
  ].filter(Boolean).join(' · ');
};
</script>

<template>
  <section class="ai-card picker" aria-labelledby="ai-step-workouts">
    <div class="ai-step-head">
      <span class="ai-step-no">1</span>
      <h2 id="ai-step-workouts" class="ai-step-title">{{ t.title }}</h2>
      <p class="ai-step-hint">{{ t.hint }}</p>
    </div>

    <div v-if="selected.length" class="chosen">
      <span class="chosen-count">{{ t.selectedCount(selected.length) }}</span>
      <button v-for="workout in selected" :key="workout.workout_id" type="button" class="chosen-chip"
        :aria-label="`${t.remove} ${workoutDisplayLabel(workout)}`" @click="emit('toggle', workout.workout_id)">
        {{ workoutDisplayLabel(workout) }} · {{ formatDate(workout.start_time) }}
        <Icon name="x" :size="12" />
      </button>
    </div>
    <p v-else class="none-note"><Icon name="clock" :size="14" />{{ t.noneSelected(recentDays) }}</p>

    <div v-if="workouts.length" class="timeline" role="listbox" aria-multiselectable="true" :aria-label="t.title">
      <div v-for="group in groups" :key="group.day" class="day">
        <p class="day-label">{{ group.day }}</p>
        <button v-for="workout in group.items" :key="workout.workout_id" type="button" role="option"
          :aria-selected="selectedIds.includes(workout.workout_id)"
          :class="['row', { 'is-on': selectedIds.includes(workout.workout_id) }]"
          @click="emit('toggle', workout.workout_id)">
          <span class="row-glyph"><Icon name="run" :size="15" /></span>
          <span class="row-copy">
            <span class="row-name">{{ workoutDisplayLabel(workout) }}</span>
            <span class="row-facts">{{ facts(workout) }}</span>
          </span>
          <span class="row-check" aria-hidden="true"><Icon name="check" :size="13" /></span>
        </button>
      </div>
    </div>
    <p v-else class="none-note">{{ t.empty }}</p>
    <div v-if="workouts.length > STEP" class="more">
      <button v-if="remaining > 0" type="button" class="more-btn" @click="visible += STEP">
        <Icon name="chevron-down" :size="14" />{{ t.showMore(Math.min(STEP, remaining)) }}
      </button>
      <button v-if="visible > STEP" type="button" class="more-btn quiet" @click="visible = STEP">{{ t.showLess }}</button>
    </div>
  </section>
</template>

<style scoped>
.chosen { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; margin-bottom: 10px; }
.chosen-count { margin-right: 4px; color: var(--subtle); font-size: var(--fs-xs); }
.chosen-chip { display: inline-flex; align-items: center; gap: 6px; min-height: 30px; padding: 3px 12px; border: 0; border-radius: 999px;
  background: color-mix(in srgb, var(--accent) 16%, transparent); color: var(--ink); font-size: var(--fs-xs); cursor: pointer; }
.chosen-chip:hover { background: color-mix(in srgb, var(--accent) 24%, transparent); }
.none-note { display: flex; align-items: center; gap: 8px; margin: 0 0 4px; padding: 9px 14px; border-radius: 999px;
  background: var(--cap-track); box-shadow: var(--cap-track-shadow); color: var(--muted); font-size: var(--fs-xs); }

/* 按天的时间线：左边一条细竖线把同一天的运动串起来，日期是线上的一个小标签。 */
.timeline { display: grid; gap: 6px; margin-top: 10px; }
.day { position: relative; display: grid; gap: 4px; padding-left: 14px; }
.day::before { content: ''; position: absolute; top: 24px; bottom: 6px; left: 4px; width: 1.5px; border-radius: 2px;
  background: linear-gradient(180deg, color-mix(in srgb, var(--ink) 16%, transparent), transparent); }
.day-label { position: relative; margin: 0 0 2px -14px; padding-left: 14px; color: var(--subtle); font-size: var(--fs-2xs); font-weight: 600; letter-spacing: .02em; }
.day-label::before { content: ''; position: absolute; top: 50%; left: 1px; width: 8px; height: 8px; border-radius: 50%;
  background: var(--subtle); translate: 0 -50%; }

.row {
  display: flex;
  width: 100%;
  align-items: center;
  gap: 10px;
  padding: 5px 10px 5px 5px;
  border: 0;
  border-radius: 16px;
  background: color-mix(in srgb, var(--ink) 4%, transparent);
  box-shadow: inset 0 1px 0 color-mix(in srgb, #fff 5%, transparent);
  color: var(--muted);
  text-align: left;
  cursor: pointer;
  transition: background var(--dur-fast) ease, box-shadow var(--dur-base) ease, translate var(--dur-base) var(--ease-out);
}
.row:hover { background: color-mix(in srgb, var(--ink) 8%, transparent); translate: 0 -1px; }
.row:focus-visible { outline: 2px solid var(--focus); outline-offset: 2px; }
.row.is-on { background: color-mix(in srgb, var(--accent) 15%, transparent);
  box-shadow: 0 6px 18px -10px color-mix(in srgb, var(--accent) 60%, transparent); }
.row-glyph { display: grid; width: 28px; height: 28px; flex: 0 0 28px; place-items: center; border-radius: 50%;
  background: var(--cap-thumb); box-shadow: var(--cap-thumb-rim); color: var(--activity); }
.row-copy { display: grid; flex: 1; min-width: 0; gap: 0; overflow-wrap: anywhere; line-height: 1.35; }
.row-name { color: var(--ink); font-size: var(--fs-xs); font-weight: 650; }
.row-facts { color: var(--subtle); font-size: var(--fs-2xs); font-variant-numeric: tabular-nums; word-break: keep-all; overflow-wrap: normal; }
.row-check { display: grid; width: 22px; height: 22px; flex: 0 0 22px; place-items: center; border-radius: 50%;
  box-shadow: inset 0 0 0 1.5px color-mix(in srgb, var(--ink) 22%, transparent); color: transparent;
  transition: background var(--dur-fast) ease, color var(--dur-fast) ease, scale var(--dur-base) var(--ease-spring); }
.row.is-on .row-check { background: var(--accent); box-shadow: none; color: var(--accent-ink); scale: 1.05; }

.more { display: flex; justify-content: center; gap: 8px; margin-top: 12px; }
.more-btn { display: inline-flex; min-height: 34px; align-items: center; gap: 6px; padding: 0 16px; border: 0; border-radius: 999px;
  background: var(--cap-thumb); box-shadow: var(--cap-thumb-rim); color: var(--ink); font-size: var(--fs-xs); cursor: pointer; }
.more-btn.quiet { background: transparent; box-shadow: none; color: var(--muted); }
.more-btn:active { scale: .97; }
</style>
