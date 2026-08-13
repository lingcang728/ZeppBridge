<script setup lang="ts">
import { onMounted, ref, watch } from 'vue';
import { RouterLink } from 'vue-router';
import Icon from '../components/Icon.vue';
import PageHeader from '../components/PageHeader.vue';
import RecordRow from '../components/RecordRow.vue';
import EmptyState from '../components/EmptyState.vue';
import SkeletonBlock from '../components/SkeletonBlock.vue';
import { useSyncController } from '../composables/useSyncController';
import { isTauri, tauriApi, toUserMessage } from '../composables/useTauriApi';
import { workoutLabel } from '../lib/labels';
import { formatDate, formatDuration, isFiniteNumber } from '../lib/format';
import type { Workout } from '../types';

const { dataRevision } = useSyncController();
const workouts = ref<Workout[]>([]);
const loading = ref(true);
const error = ref<string | null>(null);

const durationMinutes = (start: string, end: string): number | null => {
  const from = new Date(start).getTime();
  const to = new Date(end).getTime();
  if (!Number.isFinite(from) || !Number.isFinite(to) || to <= from) return null;
  return (to - from) / 60000;
};

const workoutFact = (workout: Workout): { fact: string; label: string } => {
  const meters = workout.distance_meters;
  if (isFiniteNumber(meters) && meters > 0) {
    return {
      fact: meters >= 1000 ? `${(meters / 1000).toFixed(2)} 公里` : `${Math.round(meters)} 米`,
      label: '距离',
    };
  }
  if (isFiniteNumber(workout.calories)) return { fact: `${Math.round(workout.calories)} kcal`, label: '消耗' };
  return { fact: formatDuration(durationMinutes(workout.start_time, workout.end_time)), label: '时长' };
};

const loadList = async () => {
  loading.value = true;
  error.value = null;
  if (!isTauri()) {
    loading.value = false;
    workouts.value = [];
    return;
  }
  try {
    workouts.value = await tauriApi.getRecentWorkouts(60);
  } catch (cause) {
    error.value = toUserMessage(cause, '运动列表暂时不可用');
  } finally {
    loading.value = false;
  }
};

onMounted(() => void loadList());
watch(dataRevision, () => void loadList());
</script>

<template>
  <section class="page list-page" aria-labelledby="workout-list-title">
    <RouterLink class="back-link" to="/recent"><Icon name="arrow-left" :size="14" />返回最近记录</RouterLink>
    <PageHeader title-id="workout-list-title" title="运动" intro="本机已同步的运动记录。没有轨迹时不画地图。" />

    <div v-if="loading" class="surface-card" aria-live="polite">
      <SkeletonBlock height="56px" />
      <SkeletonBlock height="56px" />
      <SkeletonBlock height="56px" />
    </div>
    <EmptyState v-else-if="error" tone="error" icon="warning" title="无法读取运动记录" :message="error">
      <button class="button button-secondary" type="button" @click="loadList">重试</button>
    </EmptyState>
    <EmptyState v-else-if="!workouts.length" icon="steps" title="还没有运动记录" message="同步后会显示在这里。没有 GPS 或逐点样本时不会画空图。" />
    <div v-else class="surface-card">
      <RecordRow
        v-for="workout in workouts"
        :key="workout.workout_id"
        :to="{ name: 'WorkoutDetail', params: { workoutId: workout.workout_id } }"
        category="activity"
        icon="steps"
        :kicker="formatDate(workout.start_time)"
        :title="workoutLabel(workout.workout_type)"
        :fact="workoutFact(workout).fact"
        :fact-label="workoutFact(workout).label"
      />
    </div>
    <p v-if="workouts.length" class="footnote">{{ workouts.length }} 条记录</p>
  </section>
</template>

<style scoped>
.list-page { width: 100%; }
.back-link {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 8px;
  color: var(--muted);
  font-size: 12px;
  text-decoration: none;
}
.back-link svg { transform: rotate(180deg); }
.footnote {
  margin: 12px 0 0;
  color: var(--muted);
  font-size: 12px;
}
</style>
