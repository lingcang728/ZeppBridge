<script setup lang="ts">
/**
 * 第 ① 步：分析哪次运动。可以不选——不选时分析截至今天的最近 N 天。
 *
 * 同名的运动很多（「AI 识别活动」能有几十条），所以每行都带上时间、
 * 时长、距离和平均心率，按日期分组，一眼能分清。
 */
import { computed } from 'vue';
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
    noneSelected: (days: number) => `没选运动：分析截至今天的最近 ${days} 天。`,
    selectedCount: (count: number) => `已选 ${count} 次`,
    empty: '本机还没有运动记录',
    remove: '取消选择',
    avgHr: (bpm: number) => `均心率 ${bpm}`,
  },
  {
    title: 'Which workout',
    hint: 'Pick one or more, or none',
    noneSelected: (days: number) => `No workout selected: the last ${days} days up to today are analysed.`,
    selectedCount: (count: number) => `${count} selected`,
    empty: 'No workouts on this machine yet',
    remove: 'Deselect',
    avgHr: (bpm: number) => `avg HR ${bpm}`,
  },
  {
    title: 'Qué entrenamiento',
    hint: 'Elige uno o varios, o ninguno',
    noneSelected: (days: number) => `Sin entrenamiento: se analizan los últimos ${days} días hasta hoy.`,
    selectedCount: (count: number) => `${count} seleccionados`,
    empty: 'Aún no hay entrenamientos en este equipo',
    remove: 'Quitar',
    avgHr: (bpm: number) => `FC media ${bpm}`,
  },
  'components/ai/WorkoutPicker',
));

const selected = computed(() => props.workouts.filter((workout) => props.selectedIds.includes(workout.workout_id)));

const groups = computed(() => {
  const byDay = new Map<string, Workout[]>();
  for (const workout of props.workouts) {
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
      <button v-for="workout in selected" :key="workout.workout_id" type="button" class="ai-chip is-on"
        :aria-label="`${t.remove} ${workoutDisplayLabel(workout)}`" @click="emit('toggle', workout.workout_id)">
        {{ workoutDisplayLabel(workout) }} · {{ formatDate(workout.start_time) }}
        <Icon name="x" :size="12" />
      </button>
    </div>
    <p v-else class="ai-note"><Icon name="info" :size="13" />{{ t.noneSelected(recentDays) }}</p>

    <div v-if="workouts.length" class="list" role="listbox" aria-multiselectable="true" :aria-label="t.title">
      <template v-for="group in groups" :key="group.day">
        <p class="day">{{ group.day }}</p>
        <button v-for="workout in group.items" :key="workout.workout_id" type="button" role="option"
          :aria-selected="selectedIds.includes(workout.workout_id)"
          :class="['row', { 'is-on': selectedIds.includes(workout.workout_id) }]"
          @click="emit('toggle', workout.workout_id)">
          <Icon :name="selectedIds.includes(workout.workout_id) ? 'circle-check' : 'ring'" :size="16" />
          <span class="row-copy">
            <span class="row-name">{{ workoutDisplayLabel(workout) }}</span>
            <span class="row-facts">{{ facts(workout) }}</span>
          </span>
        </button>
      </template>
    </div>
    <p v-else class="ai-note">{{ t.empty }}</p>
  </section>
</template>

<style scoped>
.chosen { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; margin-bottom: 10px; }
.chosen-count { color: var(--subtle); font-size: var(--fs-xs); margin-right: 4px; }
.list { display: grid; gap: 2px; max-height: 260px; margin-top: 10px; overflow-y: auto; padding-right: 4px; }
.day { position: sticky; top: 0; margin: 6px 0 2px; padding: 2px 0; background: var(--surface); color: var(--subtle); font-size: var(--fs-xs); font-weight: 600; }
.row { display: flex; align-items: center; gap: 10px; width: 100%; padding: 7px 8px; border: 1px solid transparent; border-radius: 8px; background: transparent; color: var(--muted); text-align: left; cursor: pointer; }
.row:hover { background: var(--surface-hover); }
.row.is-on { border-color: color-mix(in srgb, var(--accent) 40%, transparent); background: var(--accent-soft); color: var(--accent); }
.row:focus-visible { outline: 2px solid var(--focus); outline-offset: 1px; }
.row-copy { display: grid; min-width: 0; }
.row-name { color: var(--ink); font-size: var(--fs-sm); }
.row-facts { color: var(--subtle); font-size: var(--fs-xs); font-variant-numeric: tabular-nums; }
</style>
