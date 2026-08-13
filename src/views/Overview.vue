<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue';
import { RouterLink } from 'vue-router';
import VChart from 'vue-echarts';
import Icon from '../components/Icon.vue';
import CircularProgress from '../components/CircularProgress.vue';
import EmptyState from '../components/EmptyState.vue';
import SkeletonBlock from '../components/SkeletonBlock.vue';
import { isTauri, tauriApi, toUserMessage } from '../composables/useTauriApi';
import { useSyncController } from '../composables/useSyncController';
import { useTheme } from '../composables/useTheme';
import { workoutLabel } from '../lib/labels';
import { formatDate, formatDuration, formatTime, formatMetric, isFiniteNumber } from '../lib/format';
import type { HealthOverview, HeartRatePoint, SleepSession, Workout } from '../types';

const STEP_GOAL = 10000;

const overview = ref<HealthOverview | null>(null);
const recentSleep = ref<SleepSession[]>([]);
const recentWorkouts = ref<Workout[]>([]);
const heartSeries = ref<HeartRatePoint[]>([]);
const loading = ref(true);
const error = ref<string | null>(null);
const partialWarning = ref<string | null>(null);
const now = ref(Date.now());
const { dataRevision } = useSyncController();
const { theme } = useTheme();

const chartTheme = computed(() => (theme.value === 'light' ? 'zeppbridge-light' : 'zeppbridge-dark'));

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
  return Math.max(0, Math.round((now.value - measuredAt) / 60000));
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

/* 近 24 小时心率：真实样本不足 2 个时不画曲线（数据真实性红线） */
const hrChart = computed(() => {
  const samples = heartSeries.value
    .map((point) => ({ t: new Date(point.timestamp).getTime(), v: point.value }))
    .filter((point) => Number.isFinite(point.t) && isFiniteNumber(point.v))
    .sort((a, b) => a.t - b.t);
  if (samples.length < 2) return null;
  const end = Math.max(samples[samples.length - 1].t, Date.now());
  const start = end - 24 * 60 * 60 * 1000;
  const used = samples.filter((point) => point.t >= start && point.t <= end);
  if (used.length < 2) return null;
  const values = used.map((point) => point.v);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const avg = values.reduce((sum, value) => sum + value, 0) / values.length;
  return { pts: used, min, max, avg };
});

const hrOption = computed<any>(() => {
  const chart = hrChart.value;
  if (!chart) return null;
  return {
    animation: false,
    grid: { left: 8, right: 8, top: 10, bottom: 6, containLabel: false },
    xAxis: {
      type: 'time',
      axisLine: { show: false },
      axisTick: { show: false },
      axisLabel: { show: false },
      splitLine: { show: false },
    },
    yAxis: {
      type: 'value',
      scale: true,
      axisLine: { show: false },
      axisTick: { show: false },
      axisLabel: { show: false },
      splitLine: { show: true, lineStyle: { color: 'rgba(255,255,255,0.05)', type: 'dashed' } },
    },
    tooltip: {
      trigger: 'axis',
      formatter: (params: Array<{ value: [number, number] }>) => {
        const point = Array.isArray(params) ? params[0] : params;
        if (!point) return '';
        const time = new Intl.DateTimeFormat('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(point.value[0]));
        return `${time}　<b>${point.value[1]}</b> BPM`;
      },
    },
    series: [
      {
        type: 'line',
        data: chart.pts.map((point) => [point.t, point.v]),
        smooth: 0.25,
        showSymbol: false,
        lineStyle: { width: 2.5, color: '#EF6E6E' },
        areaStyle: {
          color: {
            type: 'linear',
            x: 0, y: 0, x2: 0, y2: 1,
            colorStops: [
              { offset: 0, color: 'rgba(239,110,110,0.28)' },
              { offset: 1, color: 'rgba(239,110,110,0)' },
            ],
          },
        },
      },
    ],
  };
});

const loadOverview = async () => {
  loading.value = true;
  error.value = null;
  partialWarning.value = null;
  if (!isTauri()) {
    loading.value = false;
    overview.value = null;
    recentSleep.value = [];
    recentWorkouts.value = [];
    heartSeries.value = [];
    return;
  }
  const [health, sleep, workouts, heart] = await Promise.allSettled([
    tauriApi.getHealthOverview(),
    tauriApi.getRecentSleep(3),
    tauriApi.getRecentWorkouts(3),
    tauriApi.getHeartRateSeries(24),
  ]);
  overview.value = health.status === 'fulfilled' ? health.value : null;
  recentSleep.value = sleep.status === 'fulfilled' ? sleep.value : [];
  recentWorkouts.value = workouts.status === 'fulfilled' ? workouts.value : [];
  heartSeries.value = heart.status === 'fulfilled' ? heart.value : [];
  const rejected = [health, sleep, workouts, heart].filter((result) => result.status === 'rejected');
  if (rejected.length) {
    partialWarning.value = toUserMessage(rejected[0].reason, '部分数据暂时不可用');
  }
  if (health.status === 'rejected') {
    error.value = toUserMessage(health.reason, '概览数据暂时不可用');
  }
  loading.value = false;
};

const workoutFact = (workout: Workout): { fact: string; label: string } => {
  const distance = formatDistanceZh(workout.distance_meters);
  if (distance) return { fact: distance, label: '距离' };
  if (isFiniteNumber(workout.calories)) return { fact: `${Math.round(workout.calories)} kcal`, label: '消耗' };
  const minutes = durationMinutes(workout.start_time, workout.end_time);
  return { fact: formatDuration(minutes), label: '时长' };
};

let clockTimer = 0;
onMounted(() => {
  void loadOverview();
  clockTimer = window.setInterval(() => {
    now.value = Date.now();
  }, 60_000);
});
onUnmounted(() => {
  window.clearInterval(clockTimer);
});
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
  const nowDate = new Date();
  const startOfToday = new Date(nowDate.getFullYear(), nowDate.getMonth(), nowDate.getDate()).getTime();
  const startOfThat = new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
  const diff = Math.round((startOfToday - startOfThat) / 86400000);
  if (diff === 0) return '今天';
  if (diff === 1) return date.getHours() >= 18 ? '昨晚' : '昨天';
  return formatDate(value);
}
</script>

<template>
  <section class="page overview-page" aria-labelledby="overview-title">
    <h1 id="overview-title" class="sr-only">概览</h1>

    <div v-if="partialWarning" class="partial-warning" role="status">
      <Icon name="info" :size="15" />
      <span>{{ partialWarning }}</span>
    </div>

    <div v-if="loading" class="overview-skeleton" aria-label="正在加载概览" aria-live="polite">
      <SkeletonBlock height="168px" />
      <div class="mid-grid">
        <div class="tiles">
          <SkeletonBlock height="76px" />
          <SkeletonBlock height="76px" />
          <SkeletonBlock height="76px" />
          <SkeletonBlock height="76px" />
          <SkeletonBlock height="76px" />
          <SkeletonBlock height="76px" />
        </div>
        <SkeletonBlock height="200px" />
      </div>
      <SkeletonBlock height="84px" />
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
      <article class="panel hr-wide" aria-labelledby="hr-heading">
        <div class="hr-left">
          <div class="panel-kicker">
            <Icon name="heart" :size="15" /><span id="hr-heading">心率</span>
            <span class="range-chip">24 小时</span>
          </div>
          <div class="hr-reading">
            <strong>{{ formatMetric(displayHr) }}</strong>
            <span>BPM</span>
          </div>
          <p class="hr-detail">{{ heartRateDetail }}</p>
        </div>
        <VChart
          v-if="hrOption"
          class="hr-chart"
          :option="hrOption"
          :theme="chartTheme"
          autoresize
          aria-label="近 24 小时心率折线"
          role="img"
        />
        <p v-else class="spark-empty">近 24 小时没有足够心率样本，因此不画曲线。</p>
        <div v-if="hrChart" class="hr-mini">
          <div><span>最高</span><b>{{ Math.round(hrChart.max) }}</b></div>
          <div><span>最低</span><b>{{ Math.round(hrChart.min) }}</b></div>
          <div><span>平均</span><b>{{ Math.round(hrChart.avg) }}</b></div>
        </div>
      </article>

      <div class="mid-grid">
        <div class="tiles">
          <article class="tile" aria-label="今日步数">
            <div class="lab"><Icon name="steps" :size="14" />今日步数</div>
            <div class="val">{{ formatMetric(stepsToday) }} <small>步</small></div>
            <div class="sub">目标 {{ STEP_GOAL.toLocaleString('zh-CN') }}</div>
          </article>
          <article class="tile" aria-label="静息心率">
            <div class="lab"><Icon name="heart-rest" :size="14" />静息心率</div>
            <div class="val">{{ formatMetric(overview?.resting_hr) }} <small>BPM</small></div>
            <div class="sub" :class="{ good: isFiniteNumber(overview?.resting_hr) && (overview?.resting_hr ?? 99) <= 55 }">
              {{ isFiniteNumber(overview?.resting_hr) ? ((overview?.resting_hr ?? 99) <= 55 ? '优' : '来自健康概览') : '暂无记录' }}
            </div>
          </article>
          <article class="tile" aria-label="最近睡眠">
            <div class="lab"><Icon name="moon" :size="14" />最近睡眠</div>
            <div class="val">{{ lastSleep ? formatDuration(lastSleep.duration_minutes) : '—' }}</div>
            <div class="sub">{{ sleepWindow }}</div>
          </article>
          <article class="tile" aria-label="最近运动">
            <div class="lab"><Icon name="run" :size="14" />最近运动</div>
            <div class="val">{{ lastWorkout ? workoutFact(lastWorkout).fact : '—' }}</div>
            <div class="sub">{{ lastWorkout ? `${dayHint(lastWorkout.start_time)} ${formatTime(lastWorkout.start_time)} · ${workoutLabel(lastWorkout.workout_type)}` : '暂无记录' }}</div>
          </article>
          <article class="tile" aria-label="训练负荷">
            <div class="lab"><Icon name="training-load" :size="14" />训练负荷</div>
            <div class="val">{{ formatMetric(overview?.training_load) }}</div>
            <div class="sub">近 7 天</div>
          </article>
          <article class="tile" aria-label="最大摄氧量">
            <div class="lab"><Icon name="vo2" :size="14" />VO₂max</div>
            <div class="val">{{ formatMetric(overview?.vo2max) }}</div>
            <div class="sub">来自最近运动</div>
          </article>
        </div>

        <article class="panel steps-panel" aria-labelledby="steps-heading">
          <div class="panel-kicker">
            <Icon name="steps" :size="15" /><span id="steps-heading">今日步数</span>
          </div>
          <CircularProgress
            :value="stepsPercent"
            :size="130"
            :stroke-width="10"
            color="var(--activity)"
            track-color="var(--line)"
            :show-label="false"
          >
            <div class="steps-center">
              <strong>{{ formatMetric(stepsToday) }}</strong>
              <span>步</span>
            </div>
          </CircularProgress>
          <div class="steps-bar"><i :style="{ width: `${Math.min(100, stepsPercent)}%` }" /></div>
          <p class="steps-hint">目标 {{ STEP_GOAL.toLocaleString('zh-CN') }} · {{ Math.round(stepsPercent) }}%</p>
        </article>
      </div>

      <RouterLink class="ai-entry" to="/ai">
        <span class="ai-mark" aria-hidden="true"><Icon name="spark" :size="20" /></span>
        <span class="ai-body">
          <strong>交给 AI，发现更多可能</strong>
          <span>复制或导出 JSON，把分析带到你自己的 AI</span>
        </span>
        <span class="ai-go">前往「交给 AI」<Icon name="arrow-right" :size="14" /></span>
      </RouterLink>
    </template>
  </section>
</template>

<style scoped>
.overview-page.page {
  width: 100%;
  display: grid;
  gap: 16px;
}
.overview-skeleton {
  display: grid;
  gap: 16px;
}
.panel {
  min-width: 0;
  padding: 16px;
  border: 1px solid var(--line);
  border-radius: var(--radius-md);
  background: var(--surface);
}
.partial-warning {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 9px 12px;
  border: 1px solid var(--line);
  border-radius: var(--radius-md);
  background: var(--surface);
  color: var(--warning);
  font-size: 12px;
}
.partial-warning svg { color: var(--warning); }

/* 心率全宽卡 */
.hr-wide {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  align-items: center;
  gap: 20px;
  min-height: 168px;
}
.hr-left { min-width: 0; }
.panel-kicker {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  color: var(--heart);
  font-size: 13px;
}
.range-chip {
  margin-left: 4px;
  padding: 2px 9px;
  border: 1px solid var(--line);
  border-radius: 999px;
  color: var(--muted);
  font-size: 12px;
}
.hr-reading {
  display: flex;
  align-items: baseline;
  gap: 8px;
  margin-top: 10px;
}
.hr-reading strong {
  font-family: 'Inter', var(--font-sans);
  font-size: 44px;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
  letter-spacing: -.03em;
  line-height: 1;
}
.hr-reading span {
  color: var(--heart);
  font-size: 13px;
  font-weight: 600;
}
.hr-detail {
  margin: 8px 0 0;
  color: var(--muted);
  font-size: 12px;
}
.hr-chart {
  width: 100%;
  height: 96px;
  min-width: 0;
}
.spark-empty {
  margin: 0;
  color: var(--muted);
  font-size: 12px;
  text-align: center;
}
.hr-mini {
  display: grid;
  gap: 6px;
  border-left: 1px solid var(--line);
  padding-left: 20px;
  min-width: 96px;
}
.hr-mini div {
  display: flex;
  justify-content: space-between;
  gap: 18px;
  font-size: 12px;
  color: var(--muted);
}
.hr-mini b {
  font-family: 'Inter', var(--font-sans);
  font-variant-numeric: tabular-nums;
  font-weight: 600;
  color: var(--ink);
  font-size: 13px;
}

/* 中段：瓷砖 + 步数环 */
.mid-grid {
  display: grid;
  grid-template-columns: minmax(0, 2fr) minmax(260px, 1fr);
  gap: 16px;
  align-items: stretch;
}
.tiles {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 12px;
  min-width: 0;
}
.tile {
  min-width: 0;
  padding: 12px 14px;
  border: 1px solid var(--line);
  border-radius: var(--radius-md);
  background: var(--surface);
}
.tile .lab {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  color: var(--muted);
  font-size: 12px;
}
.tile .lab svg { color: var(--subtle); }
.tile .val {
  margin-top: 8px;
  font-family: 'Inter', var(--font-sans);
  font-size: 20px;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
  letter-spacing: -.02em;
  line-height: 1.1;
}
.tile .val small {
  font-size: 12px;
  color: var(--muted);
  font-weight: 400;
}
.tile .sub {
  margin-top: 4px;
  color: var(--subtle);
  font-size: 12px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.tile .sub.good { color: var(--activity); }
.steps-panel {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
}
.steps-panel .panel-kicker {
  align-self: flex-start;
  color: var(--activity);
}
.steps-center {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 1px;
}
.steps-center strong {
  font-family: 'Inter', var(--font-sans);
  font-size: 24px;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
  letter-spacing: -.02em;
  line-height: 1;
}
.steps-center span {
  color: var(--muted);
  font-size: 12px;
}
.steps-bar {
  width: 70%;
  height: 4px;
  border-radius: 999px;
  background: var(--line);
  overflow: hidden;
}
.steps-bar i {
  display: block;
  height: 100%;
  background: var(--activity);
  border-radius: 999px;
}
.steps-hint {
  margin: 0;
  color: var(--muted);
  font-size: 12px;
}

/* AI 入口（放大版横条） */
.ai-entry {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 18px 20px;
  border: 1px solid var(--line);
  border-radius: var(--radius-md);
  background: var(--surface);
  color: inherit;
  text-decoration: none;
}
.ai-entry:hover { border-color: var(--accent-soft); background: var(--surface-raised); }
.ai-mark {
  display: grid;
  place-items: center;
  width: 44px;
  height: 44px;
  flex: 0 0 44px;
  border-radius: 12px;
  color: var(--accent);
  background: var(--accent-soft);
}
.ai-body {
  display: flex;
  flex-direction: column;
  gap: 3px;
  min-width: 0;
}
.ai-body strong { font-size: 15px; }
.ai-body span {
  color: var(--muted);
  font-size: 12px;
}
.ai-go {
  margin-left: auto;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  min-height: 34px;
  padding: 6px 16px;
  border-radius: 999px;
  background: var(--accent);
  color: var(--accent-ink);
  font-size: 13px;
  white-space: nowrap;
}

@media (max-width: 980px) {
  .hr-wide {
    grid-template-columns: auto minmax(0, 1fr);
  }
  .hr-mini { grid-column: 1 / -1; flex-direction: row; gap: 24px; border-left: 0; border-top: 1px solid var(--line); padding: 12px 0 0; }
  .mid-grid { grid-template-columns: minmax(0, 1fr); }
}
@media (max-width: 760px) {
  .tiles { grid-template-columns: minmax(0, 1fr); }
  .ai-entry { flex-wrap: wrap; }
  .ai-go { margin-left: auto; }
}
</style>
