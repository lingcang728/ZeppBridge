<script setup lang="ts">
import { onMounted, ref, watch } from 'vue';
import { RouterLink } from 'vue-router';
import Icon from '../components/Icon.vue';
import PageHeader from '../components/PageHeader.vue';
import RecordRow from '../components/RecordRow.vue';
import EmptyState from '../components/EmptyState.vue';
import SkeletonBlock from '../components/SkeletonBlock.vue';
import { isTauri, tauriApi, toUserMessage } from '../composables/useTauriApi';
import { useSyncController } from '../composables/useSyncController';
import { workoutLabel } from '../lib/labels';
import { formatDate, formatDuration, isFiniteNumber } from '../lib/format';
import type { SleepSession, Workout } from '../types';

const loading = ref(true);
const error = ref<string | null>(null);
const partialWarning = ref<string | null>(null);
const recentSleep = ref<SleepSession[]>([]);
const recentWorkouts = ref<Workout[]>([]);
const { dataRevision } = useSyncController();

const loadRecent = async () => {
  loading.value = true;
  error.value = null;
  partialWarning.value = null;
  if (!isTauri()) {
    loading.value = false;
    recentSleep.value = [];
    recentWorkouts.value = [];
    return;
  }
  const [sleep, workouts] = await Promise.allSettled([
    tauriApi.getRecentSleep(10),
    tauriApi.getRecentWorkouts(10),
  ]);
  recentSleep.value = sleep.status === 'fulfilled' ? sleep.value : [];
  recentWorkouts.value = workouts.status === 'fulfilled' ? workouts.value : [];
  const rejected = [sleep, workouts].filter((result) => result.status === 'rejected');
  if (rejected.length) {
    partialWarning.value = toUserMessage(rejected[0].reason, '部分数据暂时不可用');
  }
  loading.value = false;
};

onMounted(() => void loadRecent());
watch(dataRevision, () => void loadRecent());

const workoutFact = (workout: Workout): string => {
  const distance = formatDistanceZh(workout.distance_meters);
  if (distance) return distance;
  if (isFiniteNumber(workout.calories)) return `${Math.round(workout.calories)} kcal`;
  const minutes = durationMinutes(workout.start_time, workout.end_time);
  return formatDuration(minutes);
};

function listDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '日期未知';
  const month = date.getMonth() + 1;
  const day = date.getDate();
  const weekday = new Intl.DateTimeFormat('zh-CN', { weekday: 'short' }).format(date);
  return `${month}月${day}日（${weekday}）`;
}

function formatDistanceZh(meters?: number): string {
  if (!isFiniteNumber(meters) || meters <= 0) return '';
  return meters >= 1000 ? `${(meters / 1000).toFixed(2)} 公里` : `${Math.round(meters)} 米`;
}

function durationMinutes(start: string, end: string): number | null {
  const from = new Date(start).getTime();
  const to = new Date(end).getTime();
  if (!Number.isFinite(from) || !Number.isFinite(to) || to <= from) return null;
  return (to - from) / 60000;
}

function formatDateHint(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return formatDate(value);
  const nowDate = new Date();
  const startOfToday = new Date(nowDate.getFullYear(), nowDate.getMonth(), nowDate.getDate()).getTime();
  const startOfThat = new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
  const diff = Math.round((startOfToday - startOfThat) / 86400000);
  if (diff === 0) return '今天';
  if (diff === 1) return '昨天';
  return listDate(value);
}
</script>

<template>
  <section class="page recent-page" aria-labelledby="recent-title">
    <PageHeader
      title-id="recent-title"
      title="最近记录"
      intro="最近同步的睡眠与运动记录，合并查看。"
    />

    <div v-if="partialWarning" class="partial-warning" role="status">
      <Icon name="info" :size="15" />
      <span>{{ partialWarning }}</span>
    </div>

    <div v-if="loading" class="recent-skeleton" aria-label="正在加载最近记录" aria-live="polite">
      <div class="recent-grid">
        <SkeletonBlock height="100%" />
        <SkeletonBlock height="100%" />
      </div>
    </div>

    <EmptyState
      v-else-if="error"
      tone="error"
      icon="warning"
      title="最近记录加载失败"
      :message="error"
    >
      <button class="button button-secondary" type="button" @click="loadRecent"><Icon name="refresh" :size="15" />重试</button>
    </EmptyState>

    <div v-else class="recent-grid">
      <section class="recent-col" aria-labelledby="recent-sleep-title">
        <div class="group-head">
          <h2 id="recent-sleep-title" class="col-label">
            <Icon name="moon" :size="15" /><span>最近睡眠</span>
            <em v-if="recentSleep.length">{{ recentSleep.length }} 条</em>
          </h2>
          <RouterLink class="see-all" to="/sleep">查看全部<Icon name="arrow-right" :size="13" /></RouterLink>
        </div>
        <div class="surface-card list-card">
          <RecordRow
            v-for="session in recentSleep"
            :key="session.sleep_id"
            compact
            :to="{ name: 'SleepDetail', params: { sleepId: session.sleep_id } }"
            category="sleep"
            icon="moon"
            :kicker="formatDateHint(session.start_time)"
            :title="formatDuration(session.duration_minutes)"
            :fact="isFiniteNumber(session.score) ? String(Math.round(session.score)) : '—'"
          />
          <div v-if="!recentSleep.length" class="empty-row">暂无睡眠记录</div>
        </div>
      </section>

      <section class="recent-col" aria-labelledby="recent-workout-title">
        <div class="group-head">
          <h2 id="recent-workout-title" class="col-label">
            <Icon name="run" :size="15" /><span>最近运动</span>
            <em v-if="recentWorkouts.length">{{ recentWorkouts.length }} 条</em>
          </h2>
          <RouterLink class="see-all" to="/workouts">查看全部<Icon name="arrow-right" :size="13" /></RouterLink>
        </div>
        <div class="surface-card list-card">
          <RecordRow
            v-for="workout in recentWorkouts"
            :key="workout.workout_id"
            compact
            :to="{ name: 'WorkoutDetail', params: { workoutId: workout.workout_id } }"
            category="activity"
            icon="run"
            :kicker="formatDateHint(workout.start_time)"
            :title="workoutLabel(workout.workout_type)"
            :fact="workoutFact(workout)"
          />
          <div v-if="!recentWorkouts.length" class="empty-row">暂无运动记录</div>
        </div>
      </section>
    </div>
  </section>
</template>

<style scoped>
.recent-page.page {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  min-height: 0;
}
.recent-skeleton { flex: 1; min-height: 0; }
.recent-grid {
  flex: 1;
  min-height: 0;
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 16px;
}
.recent-col {
  display: flex;
  flex-direction: column;
  min-width: 0;
  min-height: 0;
}
.group-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  margin-bottom: 8px;
  flex: 0 0 auto;
}
.col-label {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  margin: 0;
  font-size: 13px;
  font-weight: 700;
}
.col-label svg { color: var(--sleep); }
.recent-col:last-child .col-label svg { color: var(--activity); }
.col-label em {
  padding: 1px 8px;
  border-radius: 999px;
  background: var(--surface);
  border: 1px solid var(--line);
  color: var(--muted);
  font-size: 11px;
  font-style: normal;
  font-weight: 400;
}
.see-all {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  color: var(--muted);
  font-size: 12px;
  text-decoration: none;
}
.see-all:hover { color: var(--accent); }
.list-card {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 4px;
}
.empty-row {
  padding: 18px 16px;
  color: var(--muted);
  font-size: 13px;
}
.partial-warning {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 12px;
  padding: 9px 12px;
  border: 1px solid var(--line);
  border-radius: var(--radius-md);
  background: var(--surface);
  color: var(--warning);
  font-size: 12px;
}
.partial-warning svg { color: var(--warning); }
@media (max-width: 860px) {
  .recent-grid { grid-template-columns: minmax(0, 1fr); }
}
</style>
