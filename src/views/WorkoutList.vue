<script setup lang="ts">
defineOptions({ name: 'WorkoutList' });
import { computed, onMounted, ref } from 'vue';
import { useFirstLoad } from '../composables/useFirstLoad';
import WorkoutTools from '../components/WorkoutTools.vue';
import { workoutToolsMessages } from '../components/WorkoutTools.i18n';
import { afterMotion } from '../lib/motion/budget';
import PageHeader from '../components/PageHeader.vue';
import RecordRow from '../components/RecordRow.vue';
import EmptyState from '../components/EmptyState.vue';
import SkeletonBlock from '../components/SkeletonBlock.vue';
import { useRevisionReload } from '../composables/useRevisionReload';
import { tauriApi } from '../composables/useTauriApi';
import { usePagedRecords } from '../composables/usePagedRecords';
import { formatDate, formatDistance, formatDuration, formatTime, isFiniteNumber } from '../lib/format';
import { displayableWorkouts, workoutDisplayLabel, workoutDurationMinutes, workoutIcon } from '../lib/workouts';
import type { Workout } from '../types';
import { defineMessages, useMessages } from '../i18n';
import OfficialOnlyNote from '../components/OfficialOnlyNote.vue';

const messages = defineMessages(
  {
    title: '运动',
    intro: '本机已同步的运动记录。没有轨迹时不画地图。',
    loadFailedTitle: '无法读取运动记录',
    loadFailed: '运动列表暂不可用',
    retry: '重试',
    emptyTitle: '没有可展示的运动记录',
    emptyMessage: '同步后，含类型、时间和至少一项有效指标的记录才显示在这里。没有 GPS 或逐点样本时不画空图。',
    avgHr: (bpm: number) => `均心率 ${bpm}`,
    notProvided: '未提供',
    footnote: (count: number) => `${count} 条可展示记录`,
    shown: (loaded: number, total: number) => `已读取 ${loaded} / 共 ${total} 条`,
    loadMore: '加载更多',
    loadingMore: '正在加载…',
  },
  {
    title: 'Workouts',
    intro: 'Workouts synced to this machine. No track, no map.',
    loadFailedTitle: 'Could not load workouts',
    loadFailed: 'Workout list unavailable right now',
    retry: 'Retry',
    emptyTitle: 'Nothing to show yet',
    emptyMessage: 'After a sync, only records with a type, a time and at least one real metric appear here. No GPS or per-point samples, no empty chart.',
    avgHr: (bpm: number) => `Avg HR ${bpm}`,
    notProvided: 'Not provided',
    footnote: (count: number) => `${count} records shown`,
    shown: (loaded: number, total: number) => `Loaded ${loaded} of ${total}`,
    loadMore: 'Load more',
    loadingMore: 'Loading…',
  },
  {
    title: 'Entrenamientos',
    intro: 'Entrenamientos sincronizados en este equipo. Sin recorrido, no hay mapa.',
    loadFailedTitle: 'No se pudieron leer los entrenamientos',
    loadFailed: 'Lista de entrenamientos no disponible ahora',
    retry: 'Reintentar',
    emptyTitle: 'Todavía no hay nada que mostrar',
    emptyMessage: 'Tras sincronizar solo aparecen registros con tipo, hora y al menos una métrica válida. Sin GPS ni muestras por punto, no se dibuja un gráfico vacío.',
    avgHr: (bpm: number) => `FC media ${bpm}`,
    notProvided: 'Sin datos',
    footnote: (count: number) => `${count} registros mostrados`,
    shown: (loaded: number, total: number) => `Cargados ${loaded} de ${total}`,
    loadMore: 'Cargar más',
    loadingMore: 'Cargando…',
  },
  'views/WorkoutList',
);
const t = useMessages(messages);
const tools = useMessages(workoutToolsMessages);
const selecting = ref(false);
const hiddenView = ref(false);
const selected = ref(new Set<string>());
const selectedIds = computed(() => [...selected.value]);
const toggleSelected = (id: string) => { if (selected.value.has(id)) selected.value.delete(id); else selected.value.add(id); };
const switchVisibility = () => {
  hiddenView.value = !hiddenView.value;
  selected.value.clear();
  // Never leave visible records actionable in the hidden view (or vice versa),
  // including when the replacement query fails.
  workouts.value = []; total.value = 0;
  void loadList();
};

/* 分页、请求代次和去重见 composables/usePagedRecords.ts。
 *
 * 注意这里有两个数字，不能混：`total` 是库里的**全部**运动记录数，
 * `displayableList.length` 是过滤掉不可展示项之后**这一屏**的条数。所以
 * 「已读取 X / 共 N」用的是取回来的原始条数，「N 条可展示记录」保持原样。
 * 把两者混成一句会让人以为应用丢了记录。 */
const {
  items: workouts, loading, loadingMore, error, staleError, total, hasMore, load: loadList, loadMore, preloaded, sentinelRef,
} = usePagedRecords<Workout>({
  loadPage: (limit, offset) => hiddenView.value ? tauriApi.getHiddenWorkoutPage(limit, offset) : tauriApi.getWorkoutPage(limit, offset),
  idOf: (item) => item.workout_id,
  failedText: () => t.value.loadFailed,
});
const initialLoading = useFirstLoad(loading);
// Recovery must include hidden records with incomplete summaries too. Otherwise
// CLI-hidden or partially synced records can disappear from the restore surface.
const displayableList = computed(() => hiddenView.value ? workouts.value : displayableWorkouts(workouts.value));

/* 一行要能和同一天的其他几条区分开：时长、均心率，再加距离或消耗。
   只列有值的项，一项都没有才写「未提供」。 */
const workoutFact = (workout: Workout): string => {
  const parts: string[] = [];
  const minutes = workoutDurationMinutes(workout);
  if (minutes) parts.push(formatDuration(minutes));
  if (isFiniteNumber(workout.avg_hr)) parts.push(t.value.avgHr(Math.round(workout.avg_hr)));
  const meters = workout.distance_meters;
  if (isFiniteNumber(meters) && meters > 0) parts.push(formatDistance(meters));
  else if (isFiniteNumber(workout.calories)) parts.push(`${Math.round(workout.calories)} kcal`);
  return parts.length ? parts.join(' · ') : t.value.notProvided;
};

// 第一帧用的是先前读好的首页：重读等形变放完再做（lib/motion/budget.ts）。
onMounted(() => { if (preloaded) afterMotion(() => { void loadList(); }); else void loadList(); });
useRevisionReload(() => void loadList());
</script>

<template>
  <section class="page list-page" aria-labelledby="workout-list-title">
    <PageHeader title-id="workout-list-title" :title="t.title" :intro="t.intro" />
    <OfficialOnlyNote topic="workouts" />
    <div class="selection-actions">
      <button class="button secondary" type="button" :aria-pressed="selecting" @click="selecting = !selecting; selected.clear()">{{ selecting ? tools.done : tools.select }}</button>
      <button class="button secondary" type="button" :aria-pressed="hiddenView" @click="switchVisibility">{{ hiddenView ? tools.visible : tools.hidden }}</button>
      <template v-if="selecting">
        <button class="button secondary" type="button" @click="displayableList.forEach(w => selected.add(w.workout_id))">{{ tools.selectLoaded }}</button>
        <button class="button secondary" type="button" @click="selected.clear()">{{ tools.clearSelection }}</button>
      </template>
    </div>
    <p class="footnote">{{ tools.localHint }}</p>
    <WorkoutTools :ids="selectedIds" :hidden="hiddenView" @changed="selected.clear(); loadList()" />

    <div v-if="initialLoading" class="surface-card" aria-live="polite">
      <SkeletonBlock height="56px" />
      <SkeletonBlock height="56px" />
      <SkeletonBlock height="56px" />
    </div>
    <EmptyState v-else-if="error" tone="error" icon="warning" :title="t.loadFailedTitle" :message="error">
      <button class="button button-secondary" type="button" @click="loadList">{{ t.retry }}</button>
    </EmptyState>
    <EmptyState v-else-if="!displayableList.length" icon="steps" :title="t.emptyTitle" :message="t.emptyMessage" />
    <div v-else :class="['record-list', { selecting }]">
      <div v-for="workout in displayableList" :key="workout.workout_id" :class="['selectable-record', { selected: selecting && selected.has(workout.workout_id) }]">
      <input v-if="selecting" type="checkbox" :checked="selected.has(workout.workout_id)" :aria-label="`${workoutDisplayLabel(workout)} ${formatDate(workout.start_time)} ${formatTime(workout.start_time)}`" @change="toggleSelected(workout.workout_id)" />
      <RecordRow
        class="workout-record"
        :to="hiddenView ? undefined : { name: 'WorkoutDetail', params: { workoutId: workout.workout_id } }"
        category="activity"
        :design-icon="workoutIcon(workout)"
        :kicker="formatDate(workout.start_time)"
        :time="formatTime(workout.start_time)"
        :title="workoutDisplayLabel(workout)"
        :fact="workoutFact(workout)"
      />
      </div>
    </div>
    <p v-if="staleError" class="stale-note" role="status">{{ staleError }}</p>
    <div v-if="hasMore" :ref="sentinelRef" class="load-more">
      <button class="button button-secondary" type="button" :disabled="loadingMore" @click="loadMore">
        {{ loadingMore ? t.loadingMore : t.loadMore }}
      </button>
    </div>
    <p v-if="displayableList.length" class="footnote">
      {{ t.shown(workouts.length, total) }} · {{ t.footnote(displayableList.length) }}
    </p>
  </section>
</template>

<style scoped>
.list-page { width: 100%; }
.selection-actions { display: flex; flex-wrap: wrap; gap: 8px; margin-block: 12px; }
.selectable-record { display: flex; align-items: center; gap: 12px; }
.selectable-record > :last-child { flex: 1; min-width: 0; }
.selectable-record input { width: 22px; height: 22px; accent-color: var(--accent); flex-shrink: 0; }
.selectable-record.selected { outline: 2px solid var(--focus); outline-offset: 2px; border-radius: var(--radius-md); }
.selectable-record input:focus-visible, .selection-actions .button:focus-visible { outline: 2px solid var(--focus); outline-offset: 3px; }
.record-list.selecting::before { display: none; }
.selection-actions .button { max-width: 100%; overflow-wrap: anywhere; }
.stale-note { margin: 10px 0 0; color: var(--warning, var(--muted)); font-size: var(--fs-sm); }
.load-more { display: flex; justify-content: center; margin-top: 12px; }
.footnote {
  margin: 12px 0 0;
  color: var(--muted);
  font-size: var(--fs-sm);
}
@media (max-width: 420px) {
  .record-list::before { display: none; }
  .record-list { padding-inline: 10px; }
}
</style>
