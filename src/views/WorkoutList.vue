<script setup lang="ts">
defineOptions({ name: 'WorkoutList' });
import { computed, onMounted, watch } from 'vue';
import { useFirstLoad } from '../composables/useFirstLoad';
import PageHeader from '../components/PageHeader.vue';
import RecordRow from '../components/RecordRow.vue';
import EmptyState from '../components/EmptyState.vue';
import SkeletonBlock from '../components/SkeletonBlock.vue';
import { useSyncController } from '../composables/useSyncController';
import { tauriApi } from '../composables/useTauriApi';
import { usePagedRecords } from '../composables/usePagedRecords';
import { formatDate, formatDistance, formatDuration, formatTime, isFiniteNumber } from '../lib/format';
import { displayableWorkouts, workoutDisplayLabel, workoutDurationMinutes, workoutIcon } from '../lib/workouts';
import type { Workout } from '../types';
import { defineMessages, useMessages } from '../i18n';

const messages = defineMessages(
  {
    backToRecent: '返回最近记录',
    backToOverview: '返回概览',
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
    backToRecent: 'Back to recent records',
    backToOverview: 'Back to overview',
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
    backToRecent: 'Volver a registros recientes',
    backToOverview: 'Volver al resumen',
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

const { dataRevision } = useSyncController();
/* 分页、请求代次和去重见 composables/usePagedRecords.ts。
 *
 * 注意这里有两个数字，不能混：`total` 是库里的**全部**运动记录数，
 * `displayableList.length` 是过滤掉不可展示项之后**这一屏**的条数。所以
 * 「已读取 X / 共 N」用的是取回来的原始条数，「N 条可展示记录」保持原样。
 * 把两者混成一句会让人以为应用丢了记录。 */
const {
  items: workouts, loading, loadingMore, error, total, hasMore, load: loadList, loadMore,
} = usePagedRecords<Workout>({
  loadPage: (limit, offset) => tauriApi.getWorkoutPage(limit, offset),
  idOf: (item) => item.workout_id,
  failedText: () => t.value.loadFailed,
});
const initialLoading = useFirstLoad(loading);
const displayableList = computed(() => displayableWorkouts(workouts.value));

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

onMounted(() => void loadList());
watch(dataRevision, () => void loadList());
</script>

<template>
  <section class="page list-page" aria-labelledby="workout-list-title">
    <PageHeader back="/recent" :back-label="t.backToRecent" title-id="workout-list-title" :title="t.title" :intro="t.intro" />

    <div v-if="initialLoading" class="surface-card" aria-live="polite">
      <SkeletonBlock height="56px" />
      <SkeletonBlock height="56px" />
      <SkeletonBlock height="56px" />
    </div>
    <EmptyState v-else-if="error" tone="error" icon="warning" :title="t.loadFailedTitle" :message="error">
      <button class="button button-secondary" type="button" @click="loadList">{{ t.retry }}</button>
    </EmptyState>
    <EmptyState v-else-if="!displayableList.length" icon="steps" :title="t.emptyTitle" :message="t.emptyMessage" />
    <div v-else class="record-list">
      <RecordRow
        v-for="workout in displayableList"
        :key="workout.workout_id"
        :to="{ name: 'WorkoutDetail', params: { workoutId: workout.workout_id } }"
        category="activity"
        :design-icon="workoutIcon(workout)"
        :kicker="formatDate(workout.start_time)"
        :time="formatTime(workout.start_time)"
        :title="workoutDisplayLabel(workout)"
        :fact="workoutFact(workout)"
      />
    </div>
    <div v-if="hasMore" class="load-more">
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
.load-more { display: flex; justify-content: center; margin-top: 12px; }
.footnote {
  margin: 12px 0 0;
  color: var(--muted);
  font-size: var(--fs-sm);
}
</style>
