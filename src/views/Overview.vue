<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { RouterLink } from 'vue-router';
import Icon from '../components/Icon.vue';
import PageHeader from '../components/PageHeader.vue';
import CircularProgress from '../components/CircularProgress.vue';
import RecordRow from '../components/RecordRow.vue';
import EmptyState from '../components/EmptyState.vue';
import SkeletonBlock from '../components/SkeletonBlock.vue';
import { isTauri, tauriApi, toUserMessage } from '../composables/useTauriApi';
import { useSyncController } from '../composables/useSyncController';
import { workoutLabel } from '../lib/labels';
import { formatDate, formatDateTime, formatDuration, formatTime, formatMetric, isFiniteNumber } from '../lib/format';
import type { HealthOverview, HeartRatePoint, SleepSession, Workout } from '../types';

const STEP_GOAL = 10000;
const SPARK = { w: 640, h: 156, l: 4, r: 42, t: 10, b: 26 };

const overview = ref<HealthOverview | null>(null);
const recentSleep = ref<SleepSession[]>([]);
const recentWorkouts = ref<Workout[]>([]);
const heartSeries = ref<HeartRatePoint[]>([]);
const loading = ref(true);
const error = ref<string | null>(null);
const { dataRevision, appStatus, isSyncing, syncState } = useSyncController();

const lastHeartSample = computed(() => {
  const samples = heartSeries.value
    .map((point) => ({ at: new Date(point.timestamp).getTime(), value: point.value }))
    .filter((point) => Number.isFinite(point.at) && isFiniteNumber(point.value))
    .sort((a, b) => a.at - b.at);
  return samples.length ? samples[samples.length - 1] : null;
});

const displayHr = computed(() => {
  if (isFiniteNumber(overview.value?.current_hr)) return overview.value.current_hr;
  return lastHeartSample.value?.value;
});

const heartMeasuredAt = computed(() => {
  const raw = overview.value?.latest_heart_rate_at;
  if (raw) {
    const measuredAt = new Date(raw).getTime();
    if (Number.isFinite(measuredAt)) return measuredAt;
  }
  return lastHeartSample.value?.at ?? null;
});

const heartRateAgeMinutes = computed(() => {
  const measuredAt = heartMeasuredAt.value;
  if (measuredAt === null) return null;
  return Math.max(0, Math.round((Date.now() - measuredAt) / 60000));
});

const heartRateDetail = computed(() => {
  const measuredAt = heartMeasuredAt.value;
  if (measuredAt === null) return '尚无测量时间';
  const date = new Date(measuredAt);
  const time = new Intl.DateTimeFormat('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false }).format(date);
  const age = heartRateAgeMinutes.value;
  if (age === null) return `测于 ${time}`;
  if (age <= 2) return `测于 ${time} · 刚刚`;
  if (age < 60) return `测于 ${time} · ${age} 分钟前`;
  if (age < 24 * 60) return `测于 ${time} · ${Math.round(age / 60)} 小时前`;
  return `测于 ${new Intl.DateTimeFormat('zh-CN', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }).format(date)}`;
});

const cloudSyncLabel = computed(() => {
  const raw = appStatus.value?.last_cloud_sync_at || overview.value?.last_updated;
  if (!raw) return '暂无云端同步时间';
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return '云端同步时间未知';
  const today = new Date();
  const sameDay = date.getFullYear() === today.getFullYear()
    && date.getMonth() === today.getMonth()
    && date.getDate() === today.getDate();
  const time = new Intl.DateTimeFormat('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false }).format(date);
  return sameDay ? `云端同步时间 ${time}` : `云端同步时间 ${formatDateTime(raw)}`;
});

const freshness = computed(() => {
  if (isSyncing.value) return { title: '正在同步', detail: '完成后会刷新本页' };
  if (syncState.value === 'updated') return { title: '数据已更新', detail: '本机数据已更新' };
  if (syncState.value === 'no_new_data') return { title: '本机已是最新', detail: '云端暂无新数据' };
  if (overview.value?.last_updated) return { title: '本机数据已更新', detail: formatDateTime(overview.value.last_updated) };
  return null;
});

const stepsToday = computed(() => overview.value?.steps_today);
const stepsPercent = computed(() => {
  if (!isFiniteNumber(stepsToday.value)) return 0;
  return (stepsToday.value / STEP_GOAL) * 100;
});

const lastSleep = computed(() => recentSleep.value[0] ?? null);
const lastWorkout = computed(() => recentWorkouts.value[0] ?? null);

const sleepWindow = computed(() => {
  const session = lastSleep.value;
  if (!session) return '暂无记录';
  return `${dayHint(session.start_time)} ${formatTime(session.start_time)} – ${formatTime(session.end_time)}`;
});

const sparkView = computed(() => {
  const samples = heartSeries.value
    .map((point) => ({ t: new Date(point.timestamp).getTime(), v: point.value }))
    .filter((point) => Number.isFinite(point.t) && isFiniteNumber(point.v))
    .sort((a, b) => a.t - b.t);
  if (samples.length < 2) return null;

  const end = Math.max(samples[samples.length - 1].t, Date.now());
  const start = end - 24 * 60 * 60 * 1000;
  const used = samples.filter((point) => point.t >= start && point.t <= end);
  const series = used.length >= 2 ? used : samples;
  if (series.length < 2) return null;

  const rawMin = Math.min(...series.map((point) => point.v));
  const rawMax = Math.max(...series.map((point) => point.v));
  let yMin = Math.max(0, Math.floor((rawMin - 8) / 20) * 20);
  let yMax = Math.ceil((rawMax + 8) / 20) * 20;
  if (yMax <= yMin) yMax = yMin + 40;

  const innerW = SPARK.w - SPARK.l - SPARK.r;
  const innerH = SPARK.h - SPARK.t - SPARK.b;
  const span = Math.max(1, end - start);
  const xOf = (t: number) => SPARK.l + ((t - start) / span) * innerW;
  const yOf = (v: number) => SPARK.t + (1 - (v - yMin) / (yMax - yMin)) * innerH;

  const pts = series.map((point) => ({ x: xOf(point.t), y: yOf(point.v) }));
  const line = pts.map((point, index) => `${index === 0 ? 'M' : 'L'}${point.x.toFixed(1)} ${point.y.toFixed(1)}`).join(' ');
  const last = pts[pts.length - 1];
  const baseline = SPARK.h - SPARK.b;
  const area = `${line} L${last.x.toFixed(1)} ${baseline.toFixed(1)} L${pts[0].x.toFixed(1)} ${baseline.toFixed(1)} Z`;
  const ticks = [yMin, Math.round((yMin + yMax) / 2), yMax].map((value) => ({ value, y: yOf(value) }));
  const hours = [0, 6, 12, 18, 24].map((hour) => {
    const t = start + (hour / 24) * span;
    return {
      x: xOf(t),
      label: new Intl.DateTimeFormat('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(t)),
    };
  });

  return { line, area, last, ticks, hours };
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
  const distance = formatDistanceZh(workout.distance_meters);
  if (distance) return { fact: distance, label: '距离' };
  if (isFiniteNumber(workout.calories)) return { fact: `${Math.round(workout.calories)} kcal`, label: '消耗' };
  const minutes = durationMinutes(workout.start_time, workout.end_time);
  return { fact: formatDuration(minutes), label: '时长' };
};

onMounted(() => void loadOverview());
watch(dataRevision, () => void loadOverview());

function durationMinutes(start: string, end: string): number | null {
  const from = new Date(start).getTime();
  const to = new Date(end).getTime();
  if (!Number.isFinite(from) || !Number.isFinite(to) || to <= from) return null;
  return (to - from) / 60000;
}

function formatDistanceZh(meters?: number): string {
  if (!isFiniteNumber(meters) || meters <= 0) return '';
  return meters >= 1000 ? `${(meters / 1000).toFixed(2)} 公里` : `${Math.round(meters)} 米`;
}

function dayHint(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return formatDate(value);
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const startOfThat = new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
  const diff = Math.round((startOfToday - startOfThat) / 86400000);
  if (diff === 0) return '今天';
  if (diff === 1) return date.getHours() >= 18 ? '昨晚' : '昨天';
  return formatDate(value);
}

function listDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '日期未知';
  const month = date.getMonth() + 1;
  const day = date.getDate();
  const weekday = new Intl.DateTimeFormat('zh-CN', { weekday: 'short' }).format(date);
  return `${month}月${day}日（${weekday}）`;
}
</script>

<template>
  <section class="page overview-page" aria-labelledby="overview-title">
    <PageHeader
      title-id="overview-title"
      title="概览"
      :intro="cloudSyncLabel"
    >
      <div v-if="freshness" class="freshness" role="status">
        <Icon name="circle-check" :size="15" />
        <span>
          <strong>{{ freshness.title }}</strong>
          <small>{{ freshness.detail }}</small>
        </span>
      </div>
    </PageHeader>

    <div v-if="loading" class="overview-skeleton" aria-label="正在加载概览" aria-live="polite">
      <div class="hero-grid">
        <SkeletonBlock height="280px" />
        <SkeletonBlock height="280px" />
      </div>
      <div class="metric-grid">
        <SkeletonBlock height="120px" />
        <SkeletonBlock height="120px" />
        <SkeletonBlock height="120px" />
      </div>
      <SkeletonBlock height="88px" />
      <div class="list-grid">
        <SkeletonBlock height="180px" />
        <SkeletonBlock height="180px" />
      </div>
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

    <template v-else>
      <div class="hero-grid">
        <article class="panel hr-panel" aria-labelledby="hr-heading">
          <div class="panel-head">
            <span id="hr-heading" class="panel-kicker tone-heart">
              <Icon name="heart" :size="15" />心率
            </span>
            <span class="range-chip">24 小时</span>
          </div>
          <div class="hr-reading">
            <strong>{{ formatMetric(displayHr) }}</strong>
            <span>BPM</span>
          </div>
          <p class="panel-detail">{{ heartRateDetail }}</p>
          <div class="spark-wrap">
            <svg
              v-if="sparkView"
              class="spark"
              :viewBox="`0 0 ${SPARK.w} ${SPARK.h}`"
              role="img"
              aria-label="近 24 小时心率折线"
            >
              <defs>
                <linearGradient id="hr-fill" x1="0" x2="0" y1="0" y2="1">
                  <stop offset="0%" stop-color="var(--heart)" stop-opacity="0.38" />
                  <stop offset="100%" stop-color="var(--heart)" stop-opacity="0" />
                </linearGradient>
              </defs>
              <line
                v-for="tick in sparkView.ticks"
                :key="tick.value"
                :x1="SPARK.l"
                :x2="SPARK.w - SPARK.r"
                :y1="tick.y"
                :y2="tick.y"
                stroke="var(--line)"
                stroke-dasharray="3 5"
              />
              <path :d="sparkView.area" fill="url(#hr-fill)" />
              <path :d="sparkView.line" fill="none" stroke="var(--heart)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
              <circle :cx="sparkView.last.x" :cy="sparkView.last.y" r="4" fill="var(--heart)" stroke="var(--heart-wash)" stroke-width="2" />
              <text
                v-for="tick in sparkView.ticks"
                :key="`y-${tick.value}`"
                :x="SPARK.w - 6"
                :y="tick.y + 4"
                text-anchor="end"
                class="spark-axis"
              >{{ tick.value }}</text>
              <text
                v-for="hour in sparkView.hours"
                :key="hour.label + hour.x"
                :x="hour.x"
                :y="SPARK.h - 4"
                text-anchor="middle"
                class="spark-axis"
              >{{ hour.label }}</text>
            </svg>
            <p v-else class="spark-empty">近 24 小时没有足够心率样本，因此不画曲线。</p>
          </div>
        </article>

        <article class="panel steps-panel" aria-labelledby="steps-heading">
          <div class="panel-head">
            <span id="steps-heading" class="panel-kicker tone-activity">
              <Icon name="steps" :size="15" />今日步数
            </span>
          </div>
          <div class="steps-ring">
            <CircularProgress
              :value="stepsPercent"
              :size="196"
              :stroke-width="12"
              color="var(--icon-mint)"
              track-color="var(--line)"
              :show-label="false"
            >
              <div class="steps-center">
                <strong>{{ formatMetric(stepsToday) }}</strong>
                <span>步</span>
                <small>目标 {{ STEP_GOAL.toLocaleString('zh-CN') }}</small>
                <em v-if="isFiniteNumber(stepsToday)">{{ Math.round(stepsPercent) }}%</em>
              </div>
            </CircularProgress>
          </div>
        </article>
      </div>

      <div class="metric-grid">
        <article class="metric-card tone-sleep">
          <div class="metric-copy">
            <div class="card-heading">
              <Icon name="moon" :size="16" />
              <span>最近睡眠</span>
            </div>
            <div class="card-value">
              {{ lastSleep ? formatDuration(lastSleep.duration_minutes) : '—' }}
            </div>
            <div class="card-detail">{{ sleepWindow }}</div>
          </div>
          <div v-if="lastSleep && isFiniteNumber(lastSleep.score)" class="score-ring">
            <CircularProgress
              :value="lastSleep.score"
              :size="72"
              :stroke-width="6"
              color="var(--sleep)"
              track-color="var(--line)"
              :show-label="false"
            >
              <strong>{{ Math.round(lastSleep.score) }}</strong>
            </CircularProgress>
            <span>睡眠评分</span>
          </div>
        </article>

        <article class="metric-card tone-heart">
          <div class="metric-copy">
            <div class="card-heading">
              <Icon name="heart-rest" :size="16" />
              <span>静息心率</span>
            </div>
            <div class="card-value">
              {{ formatMetric(overview?.resting_hr) }} <small>BPM</small>
            </div>
            <div class="card-detail">
              {{ isFiniteNumber(overview?.resting_hr) ? '来自健康概览' : '暂无记录' }}
            </div>
          </div>
          <span v-if="isFiniteNumber(overview?.resting_hr) && (overview?.resting_hr ?? 99) <= 55" class="badge tone-ok">优</span>
        </article>

        <article class="metric-card tone-activity">
          <div class="metric-copy">
            <div class="card-heading">
              <Icon name="run" :size="16" />
              <span>最近运动</span>
            </div>
            <div class="card-value">
              {{ lastWorkout ? workoutFact(lastWorkout).fact : '—' }}
            </div>
            <div class="card-detail">
              {{ lastWorkout ? `${dayHint(lastWorkout.start_time)} ${formatTime(lastWorkout.start_time)} · ${workoutLabel(lastWorkout.workout_type)}` : '暂无记录' }}
            </div>
          </div>
          <span v-if="lastWorkout" class="badge tone-good">良好</span>
        </article>
      </div>

      <RouterLink class="ai-entry" to="/ai">
        <span class="ai-mark" aria-hidden="true"><Icon name="spark" :size="18" /></span>
        <span class="ai-copy">
          <strong>交给 AI，发现更多可能</strong>
          <span>复制或导出 JSON，分析请带到你自己的 AI</span>
          <small>你的数据只在本机处理，你可以自由选择信任的 AI 工具。</small>
        </span>
        <span class="ai-go">前往「交给 AI」<Icon name="arrow-right" :size="14" /></span>
      </RouterLink>

      <div class="list-grid">
        <section class="record-group" aria-labelledby="sleep-group-title">
          <div class="group-head">
            <h2 id="sleep-group-title" class="section-label">
              <Icon name="moon" :size="14" />最近睡眠
            </h2>
            <RouterLink class="see-all" to="/sleep">查看全部<Icon name="arrow-right" :size="13" /></RouterLink>
          </div>
          <div class="surface-card">
            <RecordRow
              v-for="session in recentSleep"
              :key="session.sleep_id"
              compact
              :to="{ name: 'SleepDetail', params: { sleepId: session.sleep_id } }"
              category="sleep"
              icon="moon"
              :kicker="listDate(session.start_time)"
              :title="formatDuration(session.duration_minutes)"
              :fact="isFiniteNumber(session.score) ? String(Math.round(session.score)) : '—'"
            />
            <div v-if="!recentSleep.length" class="empty-row">暂无睡眠记录</div>
          </div>
        </section>

        <section class="record-group" aria-labelledby="workout-group-title">
          <div class="group-head">
            <h2 id="workout-group-title" class="section-label">
              <Icon name="run" :size="14" />最近运动
            </h2>
            <RouterLink class="see-all" to="/workouts">查看全部<Icon name="arrow-right" :size="13" /></RouterLink>
          </div>
          <div class="surface-card">
            <RecordRow
              v-for="workout in recentWorkouts"
              :key="workout.workout_id"
              compact
              :to="{ name: 'WorkoutDetail', params: { workoutId: workout.workout_id } }"
              category="activity"
              icon="run"
              :kicker="listDate(workout.start_time)"
              :title="workoutLabel(workout.workout_type)"
              :fact="workoutFact(workout).fact"
            />
            <div v-if="!recentWorkouts.length" class="empty-row">暂无运动记录</div>
          </div>
        </section>
      </div>

    </template>
  </section>
</template>

<style scoped>
.overview-page.page {
  width: 100%;
}
.overview-skeleton,
.hero-grid,
.metric-grid,
.list-grid {
  display: grid;
  min-width: 0;
  align-items: start;
  gap: 12px;
}
.hero-grid {
  grid-template-columns: minmax(0, 1.45fr) minmax(280px, 0.85fr);
  margin-bottom: 12px;
}
.metric-grid {
  grid-template-columns: repeat(3, minmax(0, 1fr));
  margin-bottom: 14px;
}
.list-grid {
  grid-template-columns: repeat(2, minmax(0, 1fr));
}
.freshness {
  display: flex;
  align-items: center;
  gap: 8px;
  color: var(--icon-mint);
  font-size: 12px;
}
.freshness span {
  display: flex;
  flex-direction: column;
  gap: 1px;
}
.freshness strong { font-weight: 650; }
.freshness small { color: var(--muted); font-size: 11px; }
.panel {
  min-width: 0;
  min-height: 248px;
  padding: 14px 16px 12px;
  border-radius: var(--radius-md);
  display: flex;
  flex-direction: column;
}
.hr-panel {
  background: var(--heart-wash);
  border: 1px solid var(--line);
}
.steps-panel {
  background: var(--activity-wash);
  border: 1px solid var(--line);
}
.panel-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}
.panel-kicker {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  color: var(--muted);
  font-size: 13px;
  font-weight: 650;
}
.panel-kicker.tone-heart { color: var(--heart); }
.panel-kicker.tone-activity { color: var(--icon-mint); }
.range-chip {
  padding: 4px 10px;
  border: 1px solid var(--line);
  border-radius: 999px;
  color: var(--muted);
  font-size: 11px;
}
.hr-reading {
  display: flex;
  align-items: baseline;
  gap: 8px;
  margin-top: 12px;
}
.hr-reading strong {
  font-family: var(--font-mono);
  font-size: clamp(36px, 4vw, 48px);
  font-variant-numeric: tabular-nums;
  font-weight: 500;
  letter-spacing: -0.05em;
  line-height: 0.95;
}
.hr-reading span {
  color: var(--heart);
  font-size: 13px;
  font-weight: 650;
}
.panel-detail {
  margin: 6px 0 10px;
  color: var(--muted);
  font-size: 12px;
}
.spark-wrap { min-width: 0; margin-top: auto; }
.spark { display: block; width: 100%; height: 132px; }
.spark-axis {
  fill: var(--subtle);
  font-family: var(--font-mono);
  font-size: 11px;
}
.spark-empty {
  margin: 18px 0 8px;
  color: var(--muted);
  font-size: 12px;
}
.steps-ring {
  display: grid;
  flex: 1;
  place-items: center;
  padding: 8px 0 4px;
}
.steps-center {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
}
.steps-center strong {
  font-family: var(--font-mono);
  font-size: 32px;
  font-variant-numeric: tabular-nums;
  font-weight: 500;
  letter-spacing: -0.04em;
  line-height: 1;
}
.steps-center span { color: var(--muted); font-size: 12px; }
.steps-center small { color: var(--muted); font-size: 11px; }
.steps-center em {
  color: var(--icon-mint);
  font-style: normal;
  font-size: 12px;
  font-weight: 650;
}
.metric-card {
  min-width: 0;
  min-height: 112px;
  padding: 12px 14px;
  border-radius: var(--radius-md);
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}
.metric-copy { min-width: 0; display: flex; flex-direction: column; gap: 8px; }
.badge {
  align-self: flex-start;
  padding: 3px 8px;
  border-radius: 999px;
  font-size: 11px;
  font-weight: 650;
}
.badge.tone-ok { background: var(--heart-wash); color: var(--heart); }
.badge.tone-good { background: var(--activity-wash); color: var(--icon-mint); }
.metric-card.tone-heart {
  background: var(--heart-wash);
  border: 1px solid var(--line);
}
.metric-card.tone-sleep {
  background: var(--sleep-wash);
  border: 1px solid var(--line);
}
.metric-card.tone-activity {
  background: var(--activity-wash);
  border: 1px solid var(--line);
}
.card-heading {
  display: flex;
  align-items: center;
  gap: 7px;
  color: var(--muted);
  font-size: 12px;
}
.tone-heart .card-heading { color: var(--heart); }
.tone-sleep .card-heading { color: var(--sleep); }
.tone-activity .card-heading { color: var(--icon-mint); }
.card-value {
  font-family: var(--font-mono);
  font-size: 24px;
  font-variant-numeric: tabular-nums;
  font-weight: 500;
  letter-spacing: -0.03em;
}
.card-value small {
  font-size: 12px;
  color: var(--muted);
  margin-left: 4px;
}
.card-detail {
  color: var(--muted);
  font-size: 11px;
}
.score-ring {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  color: var(--muted);
  font-size: 10px;
}
.score-ring strong {
  font-family: var(--font-mono);
  font-size: 18px;
  font-variant-numeric: tabular-nums;
  font-weight: 500;
  color: var(--sleep);
}
.ai-entry {
  display: flex;
  align-items: center;
  gap: 14px;
  margin: 2px 0 14px;
  padding: 12px 16px;
  border: 1px solid var(--line);
  border-radius: var(--radius-md);
  background: var(--activity-wash);
  color: inherit;
  text-decoration: none;
}
.ai-entry:hover { border-color: var(--icon-mint); }
.ai-mark {
  display: grid;
  width: 36px;
  height: 36px;
  flex: 0 0 36px;
  place-items: center;
  border-radius: 10px;
  color: var(--icon-mint);
  background: var(--accent-soft);
}
.ai-copy { display: flex; min-width: 0; flex: 1; flex-direction: column; gap: 2px; }
.ai-copy strong { font-size: 15px; }
.ai-copy span, .ai-copy small { color: var(--muted); font-size: 12px; }
.ai-go {
  display: inline-flex;
  min-height: 36px;
  align-items: center;
  gap: 6px;
  padding: 6px 12px;
  border-radius: 999px;
  background: var(--icon-mint);
  color: var(--accent-ink);
  font-size: 12px;
  font-weight: 650;
  white-space: nowrap;
}
.group-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  margin-bottom: 8px;
}
.section-label {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  margin: 0;
}
.see-all {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  color: var(--muted);
  font-size: 12px;
  text-decoration: none;
}
.see-all:hover { color: var(--icon-mint); }
.empty-row { padding: 18px 16px; color: var(--muted); font-size: 13px; }
.footnote {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 16px 0 0;
  color: var(--muted);
  font-size: 11px;
}
.footnote svg { color: var(--icon-mint); }
@media (max-width: 860px) {
  .hero-grid,
  .list-grid {
    grid-template-columns: minmax(0, 1fr);
  }
}
@media (max-width: 760px) {
  .metric-grid {
    grid-template-columns: minmax(0, 1fr);
  }
  .ai-entry { flex-wrap: wrap; }
  .ai-go { margin-left: auto; }
}
</style>
