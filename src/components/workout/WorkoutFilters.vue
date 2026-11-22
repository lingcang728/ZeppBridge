<script setup lang="ts">
/**
 * 运动列表的筛选条：运动类型、起止日期、名称搜索、排序。只改筛选状态，真正的筛选在 lib/workoutFilters.ts。
 * 极简：一行细线描边的控件，没有额外的卡片和图标。
 */
import { computed } from 'vue';
import { EMPTY_FILTER, isFiltering, type WorkoutFilter, type WorkoutSort } from '../../lib/workoutFilters';
import { defineMessages, useMessages } from '../../i18n';

const model = defineModel<WorkoutFilter>({ required: true });
defineProps<{ sports: Array<{ value: string; label: string; count: number }>; shown: number; loaded: number }>();

const messages = defineMessages(
  {
    search: '搜索运动名称',
    allSports: '全部运动',
    from: '从',
    to: '到',
    sort: '排序',
    newest: '最新在前',
    oldest: '最旧在前',
    distance: '距离最长',
    duration: '时间最长',
    clear: '清除筛选',
    result: (shown: number, loaded: number) => `显示 ${shown} / ${loaded} 条已读取的记录`,
  },
  {
    search: 'Search workout name',
    allSports: 'All sports',
    from: 'From',
    to: 'To',
    sort: 'Sort',
    newest: 'Newest first',
    oldest: 'Oldest first',
    distance: 'Longest distance',
    duration: 'Longest time',
    clear: 'Clear filters',
    result: (shown: number, loaded: number) => `Showing ${shown} of ${loaded} loaded records`,
  },
  {
    search: 'Buscar por nombre',
    allSports: 'Todos los deportes',
    from: 'Desde',
    to: 'Hasta',
    sort: 'Orden',
    newest: 'Más recientes primero',
    oldest: 'Más antiguos primero',
    distance: 'Mayor distancia',
    duration: 'Mayor duración',
    clear: 'Quitar filtros',
    result: (shown: number, loaded: number) => `Mostrando ${shown} de ${loaded} registros cargados`,
  },
  'components/workout/WorkoutFilters',
);
const t = useMessages(messages);

const patch = (change: Partial<WorkoutFilter>) => { model.value = { ...model.value, ...change }; };
const active = computed(() => isFiltering(model.value));
const sorts = computed<Array<{ value: WorkoutSort; label: string }>>(() => [
  { value: 'newest', label: t.value.newest },
  { value: 'oldest', label: t.value.oldest },
  { value: 'distance', label: t.value.distance },
  { value: 'duration', label: t.value.duration },
]);
</script>

<template>
  <div class="wf" role="search">
    <input class="wf-text" type="search" :value="model.text" :placeholder="t.search" :aria-label="t.search" @input="patch({ text: ($event.target as HTMLInputElement).value })" />
    <select :value="model.sport" :aria-label="t.allSports" @change="patch({ sport: ($event.target as HTMLSelectElement).value })">
      <option value="">{{ t.allSports }}</option>
      <option v-for="sport in sports" :key="sport.value" :value="sport.value">{{ sport.label }} ({{ sport.count }})</option>
    </select>
    <label class="wf-date"><span>{{ t.from }}</span><input type="date" :value="model.from" :max="model.to || undefined" @input="patch({ from: ($event.target as HTMLInputElement).value })" /></label>
    <label class="wf-date"><span>{{ t.to }}</span><input type="date" :value="model.to" :min="model.from || undefined" @input="patch({ to: ($event.target as HTMLInputElement).value })" /></label>
    <select :value="model.sort" :aria-label="t.sort" @change="patch({ sort: ($event.target as HTMLSelectElement).value as WorkoutSort })">
      <option v-for="sort in sorts" :key="sort.value" :value="sort.value">{{ sort.label }}</option>
    </select>
    <button v-if="active" type="button" class="wf-clear" @click="model = { ...EMPTY_FILTER }">{{ t.clear }}</button>
    <p v-if="active" class="wf-result" role="status">{{ t.result(shown, loaded) }}</p>
  </div>
</template>

<style scoped>
.wf { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; margin-block: 12px; }
.wf input, .wf select { min-height: 32px; padding: 4px 10px; border: 0; border-radius: var(--radius-sm); background: transparent; box-shadow: inset 0 0 0 1px var(--mat-line); color: var(--ink); font: inherit; font-size: var(--fs-xs); }
.wf input:hover, .wf select:hover { box-shadow: inset 0 0 0 1px var(--mat-line-hover); }
.wf input:focus-visible, .wf select:focus-visible, .wf-clear:focus-visible { outline: 2px solid var(--focus); outline-offset: 2px; }
.wf select option { background: var(--surface); color: var(--ink); }
.wf-text { flex: 1 1 12rem; min-width: 10rem; }
.wf-date { display: inline-flex; align-items: center; gap: 6px; color: var(--subtle); font-size: var(--fs-xs); }
.wf-clear { padding: 4px 10px; border: 0; border-radius: var(--radius-sm); background: transparent; color: var(--accent); font: inherit; font-size: var(--fs-xs); cursor: pointer; }
.wf-result { flex-basis: 100%; margin: 0; color: var(--subtle); font-size: var(--fs-xs); }
</style>
