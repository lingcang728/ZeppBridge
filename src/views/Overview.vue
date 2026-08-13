<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { RouterLink } from 'vue-router';
import Icon from '../components/Icon.vue';
import PageHeader from '../components/PageHeader.vue';
import MetricHero from '../components/MetricHero.vue';
import CircularProgress from '../components/CircularProgress.vue';
import RecordRow from '../components/RecordRow.vue';
import EmptyState from '../components/EmptyState.vue';
import SkeletonBlock from '../components/SkeletonBlock.vue';
import { isTauri, tauriApi, toUserMessage } from '../composables/useTauriApi';
import { useSyncController } from '../composables/useSyncController';
import { workoutLabel } from '../lib/labels';
import { formatDate, formatDateTime, formatDuration, formatDistance, formatMetric, isFiniteNumber } from '../lib/format';
import type { HealthOverview, HeartRatePoint, SleepSession, Workout } from '../types';

const overview = ref<HealthOverview | null>(null);
const recentSleep = ref<SleepSession[]>([]);
const recentWorkouts = ref<Workout[]>([]);
const heartSeries = ref<HeartRatePoint[]>([]);
const loading = ref(true);
const error = ref<string | null>(null);
const { dataRevision, appStatus, isSyncing } = useSyncController();

const hasHealthValue = computed(() => {
  const data = overview.value;
  if (!data) return false;
  return [data.current_hr, data.steps_today, data.last_sleep_score].some(isFiniteNumber);
});
const hasAnyData = computed(() =>
  hasHealthValue.value || recentSleep.value.length > 0 || recentWorkouts.value.length > 0 || heartSeries.value.length > 0,
);

const heartRateAgeMinutes = computed(() => {
  const value = overview.value?.latest_heart_rate_at;
  if (!value) return null;
  const measuredAt = new Date(value).getTime();
  if (!Number.isFinite(measuredAt)) return null;
  return Math.max(0, Math.round((Date.now() - measuredAt) / 60000));
});
const heartRateDetail = computed(() => {
  const value = overview.value?.latest_heart_rate_at;
  if (!value) return '尚无测量时间';
  const measuredAt = new Date(value);
  if (Number.isNaN(measuredAt.getTime())) return '测量时间未知';
  const time = new Intl.DateTimeFormat('zh-CN', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }).format(measuredAt);
  const age = heartRateAgeMinutes.value;
  if (age === null) return `测于 ${time}`;
  if (age <= 2) return `测于 ${time} · 刚刚`;
  if (age < 60) return `测于 ${time} · ${age} 分钟前`;
  return `测于 ${time} · 历史样本`;
});

const loadOverview = async () => {
  loading.value = true;
  error.value = null;
  if (!isTauri()) {
    loading.value = false;
    overview.value = null;
    recentSleep.value = [];
    recentWorkouts.value = [];
    heartSeries.value = [];
    return;
  }
  try {
    const [health, sleep, workouts, heart] = await Promise.all([
      tauriApi.getHealthOverview(),
      tauriApi.getRecentSleep(3),
      tauriApi.getRecentWorkouts(3),
      tauriApi.getHeartRateSeries(24),
    ]);
    overview.value = health;
    recentSleep.value = sleep;
    recentWorkouts.value = workouts;
    heartSeries.value = heart;
  } catch (cause) {
    error.value = toUserMessage(cause, '概览数据暂时不可用');
  } finally {
    loading.value = false;
  }
};

const workoutFact = (workout: Workout): { fact: string; label: string } => {
  const distance = formatDistance(workout.distance_meters, '');
  if (distance) return { fact: distance, label: '距离' };
  if (isFiniteNumber(workout.calories)) return { fact: `${Math.round(workout.calories)} kcal`, label: '消耗' };
  return { fact: formatDuration((new Date(workout.end_time).getTime() - new Date(workout.start_time).getTime()) / 60000), label: '时长' };
};

onMounted(() => void loadOverview());
watch(dataRevision, () => void loadOverview());
</script>

<template>
  <section class="page overview-page" aria-labelledby="overview-title">
    <PageHeader
      title-id="overview-title"
      eyebrow="今日"
      title="概览"
      :intro="`云端同步 ${formatDateTime(overview?.last_updated)}`"
    />

    <div v-if="loading" class="overview-skeleton" aria-label="正在加载概览" aria-live="polite">
      <SkeletonBlock height="240px" />
      <SkeletonBlock height="88px" />
      <SkeletonBlock height="160px" />
      <SkeletonBlock height="160px" />
    </div>

    <EmptyState
      v-else-if="error"
      tone="error"
      icon="warning"
      title="概览加载失败"
      :message="error"
    >
      <button class="button button-secondary" type="button" @click="loadOverview"><Icon name="refresh" :size="15" />重试</button>
    </EmptyState>

    <EmptyState
      v-else-if="!hasAnyData"
      icon="link"
      eyebrow="还没有数据"
      :title="isSyncing ? '正在从云端拉取…' : (appStatus?.connection_state === 'connected' || appStatus?.connection_state === 'configured' ? '这段时间没有记录' : '先连接 Zepp')"
      :message="isSyncing ? '同步完成后，概览会自动出现。' : (appStatus?.connection_state === 'connected' || appStatus?.connection_state === 'configured' ? '已连接，但本机还没有可展示的健康样本。' : '连接后，ZeppBridge 会把数据保存在本机。')"
    >
      <RouterLink
        v-if="appStatus?.connection_state !== 'connected' && appStatus?.connection_state !== 'configured'"
        class="button button-primary"
        to="/settings"
      ><Icon name="arrow-right" :size="15" />连接 Zepp</RouterLink>
    </EmptyState>

    <template v-else>
      <MetricHero
        v-if="isFiniteNumber(overview?.steps_today)"
        category="activity"
        icon="steps"
        kicker="今日步数"
        :value="formatMetric(overview.steps_today)"
        detail="目标 10,000 步"
      >
        <template #progress>
          <CircularProgress
            :value="((overview.steps_today ?? 0) / 10000) * 100"
            :size="100"
            :stroke-width="8"
          />
        </template>
      </MetricHero>

      <div class="metric-grid">
        <div class="metric-card tone-heart">
          <div class="card-heading">
            <Icon name="heart" :size="18" />
            <span>最近心率</span>
          </div>
          <div class="card-value">{{ formatMetric(overview?.current_hr) }} <small>BPM</small></div>
          <div class="card-detail">{{ heartRateDetail }}</div>
        </div>

        <div class="metric-card tone-sleep">
          <div class="card-heading">
            <Icon name="moon" :size="18" />
            <span>最近睡眠</span>
          </div>
          <div class="card-value">
            {{ recentSleep[0] ? formatDuration(recentSleep[0].duration_minutes) : '—' }}
          </div>
          <div class="card-detail">
            {{ recentSleep[0] && isFiniteNumber(recentSleep[0].score) ? `评分 ${Math.round(recentSleep[0].score)}` : (recentSleep[0] ? '未评分' : '暂无记录') }}
          </div>
        </div>

        <div class="metric-card tone-activity">
          <div class="card-heading">
            <Icon name="steps" :size="18" />
            <span>最近运动</span>
          </div>
          <div class="card-value">
            {{ recentWorkouts[0] ? workoutLabel(recentWorkouts[0].workout_type) : '—' }}
          </div>
          <div class="card-detail">
            {{ recentWorkouts[0] ? workoutFact(recentWorkouts[0]).fact : '暂无记录' }}
          </div>
        </div>
      </div>

      <RouterLink class="ai-entry" to="/ai">
        <span class="ai-copy">
          <strong>交给 AI</strong>
          <span>复制或导出 JSON，分析请带到你自己的 AI</span>
        </span>
        <Icon name="arrow-right" :size="16" />
      </RouterLink>

      <section class="record-group" aria-labelledby="sleep-group-title">
        <h2 id="sleep-group-title" class="section-label">最近睡眠</h2>
        <div class="surface-card">
          <RecordRow
            v-for="session in recentSleep"
            :key="session.sleep_id"
            :to="{ name: 'SleepDetail', params: { sleepId: session.sleep_id } }"
            category="sleep"
            icon="moon"
            :kicker="formatDate(session.start_time)"
            :title="formatDuration(session.duration_minutes)"
            :fact="isFiniteNumber(session.score) ? String(Math.round(session.score)) : '—'"
            :fact-label="isFiniteNumber(session.score) ? '评分' : '未评分'"
          />
          <div v-if="!recentSleep.length" class="empty-row">暂无睡眠记录</div>
        </div>
      </section>

      <section class="record-group" aria-labelledby="workout-group-title">
        <h2 id="workout-group-title" class="section-label">最近运动</h2>
        <div class="surface-card">
          <RecordRow
            v-for="workout in recentWorkouts"
            :key="workout.workout_id"
            :to="{ name: 'WorkoutDetail', params: { workoutId: workout.workout_id } }"
            category="activity"
            icon="steps"
            :kicker="formatDate(workout.start_time)"
            :title="workoutLabel(workout.workout_type)"
            :fact="workoutFact(workout).fact"
            :fact-label="workoutFact(workout).label"
          />
          <div v-if="!recentWorkouts.length" class="empty-row">暂无运动记录</div>
        </div>
      </section>
    </template>
  </section>
</template>

<style scoped>
.overview-skeleton { display: grid; gap: 12px; }
.metric-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 12px;
  margin: 16px 0 22px;
  align-items: start;
}
.metric-card {
  min-width: 0;
  min-height: 140px;
  padding: 18px;
  border-radius: var(--radius-md);
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.metric-card.tone-heart {
  background: color-mix(in srgb, var(--heart) 12%, var(--surface));
  border: 1px solid color-mix(in srgb, var(--heart) 20%, var(--line));
}
.metric-card.tone-sleep {
  background: color-mix(in srgb, var(--sleep) 12%, var(--surface));
  border: 1px solid color-mix(in srgb, var(--sleep) 20%, var(--line));
}
.metric-card.tone-activity {
  background: color-mix(in srgb, var(--activity) 12%, var(--surface));
  border: 1px solid color-mix(in srgb, var(--activity) 20%, var(--line));
}
.card-heading {
  display: flex;
  align-items: center;
  gap: 8px;
  color: var(--muted);
  font-size: 12px;
}
.card-value {
  font-family: var(--font-mono);
  font-size: 28px;
  font-weight: 500;
  color: var(--ink);
}
.card-value small {
  font-size: 14px;
  color: var(--muted);
  margin-left: 6px;
}
.card-detail {
  margin-top: auto;
  color: var(--muted);
  font-size: 11px;
}
@media (max-width: 760px) {
  .metric-grid {
    grid-template-columns: 1fr;
  }
}
.ai-entry {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 22px;
  padding: 16px 18px;
  border: 1px solid var(--line);
  border-radius: var(--radius-md);
  background: var(--surface);
  color: inherit;
  text-decoration: none;
}
.ai-entry:hover { border-color: var(--line-strong); }
.ai-copy { display: flex; min-width: 0; flex-direction: column; gap: 3px; }
.ai-copy strong { font-size: 15px; }
.ai-copy span { color: var(--muted); font-size: 12px; }
.ai-entry > svg { color: var(--activity); }
.record-group { margin-bottom: 18px; }
.empty-row { padding: 18px 16px; color: var(--muted); font-size: 13px; }
</style>
