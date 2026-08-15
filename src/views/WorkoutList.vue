<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
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
import { displayableWorkouts, workoutDurationMinutes } from '../lib/workouts';
import type { Workout } from '../types';

const { dataRevision } = useSyncController();
const workouts = ref<Workout[]>([]);
const loading = ref(true);
const error = ref<string | null>(null);
const displayableList = computed(() => displayableWorkouts(workouts.value));

function workoutTypeBg(type: string): string {
  const map: Record<string, string> = {
    run: 'var(--route-mint)',
    running: 'var(--route-mint)',
    trail: 'var(--route-mint)',
    walk: 'var(--route-cyan)',
    walking: 'var(--route-cyan)',
    hiking: 'var(--route-cyan)',
    treadmill: 'var(--route-amber)',
    indoor_run: 'var(--route-amber)',
    ride: 'var(--route-cyan)',
    cycling: 'var(--route-cyan)',
    swimming: 'var(--route-cyan)',
  };
  return map[type?.trim().toLowerCase()] ?? 'var(--route-mint)';
}

const workoutFact = (workout: Workout): { fact: string; label: string } => {
  const meters = workout.distance_meters;
  if (isFiniteNumber(meters) && meters > 0) {
    return {
      fact: meters >= 1000 ? `${(meters / 1000).toFixed(2)} 公里` : `${Math.round(meters)} 米`,
      label: '距离',
    };
  }
  if (isFiniteNumber(workout.calories)) return { fact: `${Math.round(workout.calories)} kcal`, label: '消耗' };
  return { fact: formatDuration(workoutDurationMinutes(workout), '未提供'), label: '时长' };
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
    workouts.value = displayableWorkouts(await tauriApi.getRecentWorkouts());
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
    <EmptyState v-else-if="!displayableList.length" icon="steps" title="没有可展示的运动记录" message="同步后，只有包含类型、时间和至少一项有效指标的记录会显示在这里。没有 GPS 或逐点样本时不会画空图。" />
    <div v-else class="surface-card">
      <RecordRow
        v-for="workout in displayableList"
        :key="workout.workout_id"
        :to="{ name: 'WorkoutDetail', params: { workoutId: workout.workout_id } }"
        category="activity"
        icon="run"
        :icon-bg="workoutTypeBg(workout.workout_type)"
        :kicker="formatDate(workout.start_time)"
        :title="workoutLabel(workout.workout_type)"
        :fact="workoutFact(workout).fact"
        :fact-label="workoutFact(workout).label"
      />
    </div>
    <p v-if="displayableList.length" class="footnote">{{ displayableList.length }} 条可展示记录</p>
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
.back-link:hover { color: var(--accent); }
.footnote {
  margin: 12px 0 0;
  color: var(--muted);
  font-size: 12px;
}
</style>
