<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { RouterLink } from 'vue-router';
import Icon from '../components/Icon.vue';
import { isTauri, tauriApi, toUserMessage } from '../composables/useTauriApi';
import { useSyncController } from '../composables/useSyncController';
import { sourceLabel, workoutLabel } from '../lib/labels';
import type { DailyPoint, HealthOverview, HeartRatePoint, SleepSession, Workout } from '../types';

const overview = ref<HealthOverview | null>(null);
const recentSleep = ref<SleepSession[]>([]);
const recentWorkouts = ref<Workout[]>([]);
const loading = ref(true);
const error = ref<string | null>(null);
const { dataRevision, appStatus, isSyncing } = useSyncController();
const heartSeries = ref<HeartRatePoint[]>([]);
const loadSeries = ref<DailyPoint[]>([]);

const isFiniteNumber = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);
const hasHealthValue = computed(() => {
  const data = overview.value;
  if (!data) return false;
  return [data.current_hr, data.resting_hr, data.hrv, data.last_sleep_score, data.readiness, data.bio_charge, data.hybrid_charge, data.training_load, data.vo2max, data.steps_today, data.active_calories_today].some(isFiniteNumber);
});
const hasAnyData = computed(() => hasHealthValue.value || recentSleep.value.length > 0 || recentWorkouts.value.length > 0);

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

const activityMetrics = computed(() => [
  { label: '今日步数', value: overview.value?.steps_today, unit: '步' },
  { label: '活动热量', value: overview.value?.active_calories_today, unit: 'kcal' },
].filter((metric) => isFiniteNumber(metric.value)));
const recoveryMetrics = computed(() => [
  { label: '静息心率', value: overview.value?.resting_hr, unit: 'BPM' },
  { label: '心率变异性', value: overview.value?.hrv, unit: 'MS' },
  { label: '睡眠评分', value: overview.value?.last_sleep_score, unit: '/ 100' },
].filter((metric) => isFiniteNumber(metric.value)));
const extraMetrics = computed(() => [
  { label: '恢复度', value: overview.value?.readiness, unit: '分' },
  { label: '生理电量', value: overview.value?.bio_charge, unit: '分' },
  { label: 'HybridCharge', value: overview.value?.hybrid_charge, unit: '分' },
  { label: 'VO₂max', value: overview.value?.vo2max, unit: 'ml/kg/min' },
].filter((metric) => isFiniteNumber(metric.value)));
const trainingMetrics = computed(() => [
  { label: '训练负荷', value: overview.value?.training_load, unit: '分' },
].filter((metric) => isFiniteNumber(metric.value)));
const heartChart = computed(() => heartSeries.value.length ? {
  animation: false,
  grid: { top: 16, right: 12, bottom: 24, left: 36 },
  tooltip: { trigger: 'axis' },
  xAxis: { type: 'category', data: heartSeries.value.map((point) => new Date(point.timestamp).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })), axisLabel: { color: '#949b98', fontSize: 10 } },
  yAxis: { type: 'value', axisLabel: { color: '#949b98', fontSize: 10 }, splitLine: { lineStyle: { color: 'rgba(148,155,152,.2)' } } },
  series: [{ type: 'line', data: heartSeries.value.map((point) => point.value), showSymbol: false, lineStyle: { color: '#63ad84', width: 1.5 } }],
} : null);
const loadChart = computed(() => loadSeries.value.length ? {
  animation: false,
  grid: { top: 16, right: 12, bottom: 24, left: 36 },
  tooltip: { trigger: 'axis' },
  xAxis: { type: 'category', data: loadSeries.value.map((point) => point.date.slice(5)), axisLabel: { color: '#949b98', fontSize: 10 } },
  yAxis: { type: 'value', axisLabel: { color: '#949b98', fontSize: 10 }, splitLine: { lineStyle: { color: 'rgba(148,155,152,.2)' } } },
  series: [{ type: 'bar', data: loadSeries.value.map((point) => point.value), itemStyle: { color: '#63ad84' } }],
} : null);

const formatMetric = (value: number | undefined, label: string): string => {
  if (!isFiniteNumber(value)) return '—';
  if (label === '今日步数') return Math.round(value).toLocaleString('zh-CN');
  if (label === 'VO₂max' && !Number.isInteger(value)) return value.toFixed(1);
  return Math.round(value).toLocaleString('zh-CN');
};
const formatDateTime = (value?: string): string => {
  if (!value) return '暂无更新';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '暂无更新';
  return new Intl.DateTimeFormat('zh-CN', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }).format(date);
};
const formatDate = (value: string): string => {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '日期未知' : new Intl.DateTimeFormat('zh-CN', { month: 'short', day: 'numeric' }).format(date);
};
const formatDuration = (minutes: number): string => {
  if (!isFiniteNumber(minutes) || minutes < 0) return '时长未知';
  const hours = Math.floor(minutes / 60);
  const remainder = Math.round(minutes % 60);
  return hours > 0 ? `${hours} 小时 ${remainder} 分` : `${remainder} 分钟`;
};
const formatDistance = (meters?: number): string | null => {
  if (!isFiniteNumber(meters) || meters <= 0) return null;
  return meters >= 1000 ? `${(meters / 1000).toFixed(2)} km` : `${Math.round(meters)} m`;
};


const loadOverview = async () => {
  loading.value = true;
  error.value = null;
  if (!isTauri()) {
    loading.value = false;
    overview.value = null;
    recentSleep.value = [];
    recentWorkouts.value = [];
    return;
  }
  try {
    const [health, sleep, workouts, heart, load] = await Promise.all([
      tauriApi.getHealthOverview(),
      tauriApi.getRecentSleep(1),
      tauriApi.getRecentWorkouts(1),
      tauriApi.getHeartRateSeries(24),
      tauriApi.getTrainingLoadSeries(7),
    ]);
    overview.value = health;
    recentSleep.value = sleep;
    recentWorkouts.value = workouts;
    heartSeries.value = heart;
    loadSeries.value = load;
  } catch (cause) {
    error.value = toUserMessage(cause, '概览数据暂时不可用');
  } finally {
    loading.value = false;
  }
};

onMounted(() => void loadOverview());
watch(dataRevision, () => void loadOverview());
</script>

<template>
  <section class="page overview-page" aria-labelledby="overview-title">
    <header class="page-header">
      <div>
        <p class="eyebrow">今日状态</p>
        <h1 id="overview-title">概览</h1>
        <p class="page-intro">同步完成后自动更新本页；云端拉取时间与健康样本时间分别显示。</p>
      </div>
    </header>

    <div v-if="loading" class="overview-skeleton" aria-label="正在加载概览" aria-live="polite">
      <div class="skeleton-block skeleton-lead"></div>
      <div class="skeleton-block skeleton-context"></div>
      <div class="skeleton-block skeleton-wide"></div>
      <div class="skeleton-block"></div>
      <div class="skeleton-block"></div>
    </div>

    <div v-else-if="error" class="state-panel error-panel" role="alert">
      <div class="state-icon"><Icon name="warning" :size="20" /></div>
      <div>
        <h2>概览加载失败</h2>
        <p>{{ error }}</p>
        <button class="button button-secondary" type="button" @click="loadOverview"><Icon name="refresh" :size="15" />重试</button>
      </div>
    </div>

    <div v-else-if="!hasAnyData" class="state-panel empty-panel">
      <div class="empty-mark"><Icon name="link" :size="22" /></div>
      <div>
        <p class="eyebrow">还没有数据</p>
        <h2 v-if="isSyncing">正在从云端拉取…</h2>
        <h2 v-else-if="appStatus?.connection_state === 'connected' || appStatus?.connection_state === 'configured'">这段时间没有记录</h2>
        <h2 v-else>先连接 Zepp</h2>
        <p v-if="isSyncing">同步完成后，概览会自动出现。</p>
        <p v-else-if="appStatus?.connection_state === 'connected' || appStatus?.connection_state === 'configured'">已连接，但本机还没有可展示的健康样本。</p>
        <p v-else>连接后，ZeppBridge 会把数据保存在本机。</p>
        <RouterLink v-if="appStatus?.connection_state !== 'connected' && appStatus?.connection_state !== 'configured'" class="button button-primary" to="/settings"><Icon name="arrow-right" :size="15" />连接 Zepp</RouterLink>
      </div>
    </div>

    <template v-else>
      <section class="overview-lead" aria-label="最新健康状态">
        <article class="heart-spotlight">
          <div class="spotlight-heading"><span class="signal-icon"><Icon name="heart" :size="18" /></span><span>最近心率</span></div>
          <div class="spotlight-reading">
            <strong>{{ formatMetric(overview?.current_hr, '最近心率') }}</strong>
            <span>BPM</span>
          </div>
          <p>{{ heartRateDetail }}</p>
        </article>

        <aside class="data-context" aria-labelledby="freshness-title">
          <div class="context-heading"><p class="eyebrow">时间与来源</p><h2 id="freshness-title">数据新鲜度</h2></div>
          <dl>
            <div><dt><Icon name="cloud" :size="14" />云端同步</dt><dd>{{ formatDateTime(overview?.last_updated) }}</dd></div>
            <div><dt><Icon name="heart" :size="14" />心率样本</dt><dd>{{ formatDateTime(overview?.latest_heart_rate_at) }}</dd></div>
            <div><dt><Icon name="database" :size="14" />本地覆盖</dt><dd>{{ overview?.coverage?.days ? `${overview.coverage.days} 天` : '等待同步' }}</dd></div>
            <div><dt><Icon name="shield" :size="14" />数据来源</dt><dd>{{ sourceLabel(overview?.source_scope) }}</dd></div>
          </dl>
        </aside>
      </section>

      <section v-if="heartChart || loadChart" class="insight-grid">
        <article v-if="heartChart" class="metric-section">
          <header><p class="eyebrow">最近 24 小时</p><h2>心率</h2></header>
          <VChart class="mini-chart" :option="heartChart" autoresize />
        </article>
        <article v-if="loadChart" class="metric-section">
          <header><p class="eyebrow">最近 7 天</p><h2>训练负荷</h2></header>
          <VChart class="mini-chart" :option="loadChart" autoresize />
        </article>
      </section>

      <div class="insight-grid">
        <section class="metric-section" aria-labelledby="activity-title">
          <header><p class="eyebrow">今天</p><h2 id="activity-title">活动</h2></header>
          <div class="metric-list compact-list">
            <div v-for="metric in activityMetrics" :key="metric.label" class="metric-row">
              <span>{{ metric.label }}</span>
              <strong>{{ formatMetric(metric.value, metric.label) }} <small>{{ metric.unit }}</small></strong>
            </div>
          </div>
        </section>

        <section class="metric-section" aria-labelledby="training-title">
          <header><p class="eyebrow">近期</p><h2 id="training-title">训练状态</h2></header>
          <div class="metric-list compact-list">
            <div v-for="metric in trainingMetrics" :key="metric.label" class="metric-row">
              <span>{{ metric.label }}</span>
              <strong>{{ formatMetric(metric.value, metric.label) }} <small>{{ metric.unit }}</small></strong>
            </div>
          </div>
        </section>

        <section v-if="recoveryMetrics.length || extraMetrics.length" class="metric-section metric-section-wide" aria-labelledby="recovery-title">
          <header><p class="eyebrow">身体状态</p><h2 id="recovery-title">恢复与健康</h2></header>
          <div class="metric-list recovery-list">
            <div v-for="metric in recoveryMetrics" :key="metric.label" class="metric-row">
              <span>{{ metric.label }}</span>
              <strong>{{ formatMetric(metric.value, metric.label) }} <small>{{ metric.unit }}</small></strong>
            </div>
            <div v-for="metric in extraMetrics" :key="metric.label" class="metric-row">
              <span>{{ metric.label }}</span>
              <strong>{{ formatMetric(metric.value, metric.label) }} <small>{{ metric.unit }}</small></strong>
            </div>
          </div>
        </section>
      </div>

      <section class="records-section" aria-labelledby="records-title">
        <header class="records-heading"><div><p class="eyebrow">可以继续查看</p><h2 id="records-title">最近记录</h2></div></header>
        <div class="record-list">
          <RouterLink v-if="recentSleep[0]" class="record-row" :to="{ name: 'SleepDetail', params: { sleepId: recentSleep[0].sleep_id } }">
            <span class="record-icon"><Icon name="moon" :size="18" /></span>
            <span class="record-copy"><small>{{ formatDate(recentSleep[0].start_time) }}</small><strong>睡眠 · {{ formatDuration(recentSleep[0].duration_minutes) }}</strong><span>{{ sourceLabel(recentSleep[0].source_scope) }}</span></span>
            <span class="record-fact"><strong v-if="isFiniteNumber(recentSleep[0].score)">{{ recentSleep[0].score }}</strong><small>{{ isFiniteNumber(recentSleep[0].score) ? '睡眠评分' : '查看详情' }}</small></span>
            <Icon name="arrow-right" :size="16" />
          </RouterLink>
          <div v-else class="record-row record-empty"><span class="record-icon"><Icon name="moon" :size="18" /></span><span class="record-copy"><strong>暂无睡眠记录</strong><span>同步后会显示在这里</span></span></div>

          <RouterLink v-if="recentWorkouts[0]" class="record-row" :to="{ name: 'WorkoutDetail', params: { workoutId: recentWorkouts[0].workout_id } }">
            <span class="record-icon"><Icon name="steps" :size="18" /></span>
            <span class="record-copy"><small>{{ formatDate(recentWorkouts[0].start_time) }}</small><strong>{{ workoutLabel(recentWorkouts[0].workout_type) }}</strong><span>{{ sourceLabel(recentWorkouts[0].source_scope) }}</span></span>
            <span class="record-fact"><strong>{{ formatDistance(recentWorkouts[0].distance_meters) || (isFiniteNumber(recentWorkouts[0].calories) ? `${Math.round(recentWorkouts[0].calories)} kcal` : '—') }}</strong><small>运动摘要</small></span>
            <Icon name="arrow-right" :size="16" />
          </RouterLink>
          <div v-else class="record-row record-empty"><span class="record-icon"><Icon name="steps" :size="18" /></span><span class="record-copy"><strong>暂无运动记录</strong><span>同步后会显示在这里</span></span></div>
        </div>
        <div class="records-footer"><RouterLink to="/sleep">全部睡眠 <Icon name="arrow-right" :size="13" /></RouterLink><RouterLink to="/workouts">全部运动 <Icon name="arrow-right" :size="13" /></RouterLink></div>
      </section>

      <aside class="data-status-note" aria-label="数据状态说明">
        <Icon name="info" :size="16" />
        <span>部分高级指标可能因区域、设备或同步范围而不可用；缺失值显示为“—”，不会被当作零。</span>
      </aside>
    </template>
  </section>
</template>

<style scoped>
.page { width: min(100%, 1120px); margin: 0 auto; padding: 36px 32px 64px; }
.page-header { margin-bottom: 26px; }
.page-header > div { max-width: 680px; }
.eyebrow { margin: 0 0 7px; color: var(--muted); font-size: 10px; font-weight: 700; letter-spacing: .12em; text-transform: uppercase; }
h1, h2, p { margin-top: 0; }
h1 { margin-bottom: 8px; font-size: clamp(32px, 4vw, 46px); font-weight: 650; letter-spacing: -.045em; line-height: 1.08; }
h2 { margin-bottom: 0; font-size: 18px; font-weight: 650; letter-spacing: -.02em; }
.page-intro { max-width: 58ch; margin-bottom: 0; color: var(--muted); font-size: 14px; }
.button { display: inline-flex; min-height: 42px; align-items: center; justify-content: center; gap: 7px; padding: 8px 13px; border: 1px solid transparent; border-radius: var(--radius-sm); font-size: 12px; font-weight: 650; text-decoration: none; cursor: pointer; }
.button-primary { background: var(--accent); color: var(--accent-ink); }
.button-secondary { border-color: var(--line-strong); background: transparent; color: var(--ink); }
.overview-skeleton { display: grid; grid-template-columns: 1.25fr .75fr; gap: 10px; }
.skeleton-block { min-height: 168px; border: 1px solid var(--line); border-radius: var(--radius-md); background: linear-gradient(100deg, var(--surface) 30%, var(--surface-raised) 45%, var(--surface) 60%); background-size: 240% 100%; animation: shimmer 1.6s ease-in-out infinite; }
.skeleton-lead, .skeleton-context { min-height: 260px; }
.skeleton-wide { grid-column: 1 / -1; min-height: 220px; }
@keyframes shimmer { to { background-position: -120% 0; } }
.state-panel { display: flex; max-width: 640px; align-items: flex-start; gap: 16px; padding: 24px; border: 1px solid var(--line); border-radius: var(--radius-md); background: var(--surface); }
.state-panel h2 { margin: 0 0 6px; }.state-panel p { margin-bottom: 16px; color: var(--muted); }
.state-icon, .empty-mark { display: grid; width: 40px; height: 40px; flex: 0 0 40px; place-items: center; border-radius: var(--radius-sm); color: var(--warning); background: color-mix(in srgb, var(--warning) 12%, transparent); }
.empty-mark { color: var(--accent); background: color-mix(in srgb, var(--accent) 12%, transparent); }
.overview-lead { display: grid; grid-template-columns: 1.25fr .75fr; gap: 10px; }
.heart-spotlight { display: flex; min-height: 260px; flex-direction: column; padding: 25px; border: 1px solid color-mix(in srgb, var(--accent) 42%, var(--line)); border-radius: var(--radius-md); background: linear-gradient(145deg, color-mix(in srgb, var(--accent) 12%, var(--surface)) 0%, var(--surface) 72%); }
.spotlight-heading { display: flex; align-items: center; gap: 9px; color: var(--muted); font-size: 12px; font-weight: 650; }
.signal-icon { display: grid; width: 34px; height: 34px; place-items: center; border-radius: 50%; color: var(--accent); background: color-mix(in srgb, var(--accent) 13%, transparent); }
.spotlight-reading { display: flex; align-items: flex-end; gap: 11px; margin-top: auto; }
.spotlight-reading strong { font-family: var(--font-mono); font-size: clamp(66px, 9vw, 92px); font-weight: 500; letter-spacing: -.09em; line-height: .84; }
.spotlight-reading span { margin-bottom: 7px; color: var(--accent); font-family: var(--font-mono); font-size: 11px; }
.heart-spotlight > p { margin: 16px 0 0; color: var(--muted); font-family: var(--font-mono); font-size: 10px; }
.data-context { padding: 23px; border: 1px solid var(--line); border-radius: var(--radius-md); background: var(--surface); }
.context-heading { padding-bottom: 15px; border-bottom: 1px solid var(--line); }
.data-context dl { margin: 3px 0 0; }
.data-context dl div { display: flex; align-items: center; justify-content: space-between; gap: 14px; padding: 12px 0; border-bottom: 1px solid var(--line); }
.data-context dl div:last-child { border-bottom: 0; }
.data-context dt { display: flex; align-items: center; gap: 7px; color: var(--muted); font-size: 11px; }
.data-context dt svg { color: var(--accent); }
.data-context dd { margin: 0; font-family: var(--font-mono); font-size: 10px; text-align: right; }
.insight-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 10px; margin-top: 10px; }
.metric-section, .records-section { border: 1px solid var(--line); border-radius: var(--radius-md); background: var(--surface); }
.metric-section > header { padding: 19px 20px 15px; }
.mini-chart { height: 180px; padding: 0 12px 12px; }
.metric-section-wide { grid-column: 1 / -1; }
.metric-list { display: grid; border-top: 1px solid var(--line); }
.compact-list { grid-template-columns: repeat(2, 1fr); }
.recovery-list { grid-template-columns: repeat(3, 1fr); }
.metric-row { min-width: 0; padding: 16px 20px; border-right: 1px solid var(--line); border-bottom: 1px solid var(--line); }
.metric-row:nth-last-child(-n + 3) { border-bottom: 0; }
.compact-list .metric-row { border-bottom: 0; }
.compact-list .metric-row:last-child, .recovery-list .metric-row:nth-child(3n) { border-right: 0; }
.metric-row > span { display: block; margin-bottom: 12px; color: var(--muted); font-size: 11px; }
.metric-row strong { display: block; overflow-wrap: anywhere; font-family: var(--font-mono); font-size: clamp(23px, 3vw, 32px); font-weight: 500; letter-spacing: -.055em; line-height: 1; }
.metric-row small { color: var(--muted); font-size: 9px; font-weight: 500; letter-spacing: 0; }
.records-section { margin-top: 10px; overflow: hidden; }
.records-heading { padding: 19px 20px 15px; }
.record-list { border-top: 1px solid var(--line); }
.record-row { display: grid; min-height: 82px; grid-template-columns: auto minmax(0, 1fr) auto auto; align-items: center; gap: 13px; padding: 13px 18px; border-bottom: 1px solid var(--line); color: inherit; text-decoration: none; transition: background-color 140ms ease; }
a.record-row:hover { background: color-mix(in srgb, var(--accent) 6%, transparent); }
a.record-row:focus-visible { outline: 2px solid var(--focus); outline-offset: -2px; }
.record-icon { display: grid; width: 38px; height: 38px; place-items: center; border-radius: 50%; color: var(--accent); background: color-mix(in srgb, var(--accent) 11%, transparent); }
.record-copy { display: flex; min-width: 0; flex-direction: column; gap: 3px; }
.record-copy small, .record-copy span, .record-fact small { color: var(--muted); font-size: 10px; }
.record-copy strong { overflow: hidden; font-size: 14px; font-weight: 600; text-overflow: ellipsis; white-space: nowrap; }
.record-fact { display: flex; min-width: 92px; flex-direction: column; align-items: flex-end; gap: 3px; }
.record-fact strong { font-family: var(--font-mono); font-size: 14px; font-weight: 500; }
.record-row > svg { color: var(--subtle); }
.record-empty { grid-template-columns: auto 1fr; color: var(--muted); }
.records-footer { display: flex; justify-content: flex-end; gap: 18px; padding: 12px 18px; }
.records-footer a { display: inline-flex; align-items: center; gap: 5px; color: var(--muted); font-size: 10px; text-decoration: none; }
.records-footer a:hover { color: var(--accent); }
.data-status-note { display: flex; align-items: flex-start; gap: 8px; margin-top: 12px; padding: 12px 2px; color: var(--muted); font-size: 10px; }
.data-status-note svg { flex: 0 0 auto; color: var(--accent); }
@media (max-width: 760px) {
  .page { padding: 24px 16px 38px; }
  .page-header { margin-bottom: 22px; }
  .overview-skeleton, .overview-lead, .insight-grid { grid-template-columns: 1fr; }
  .skeleton-wide, .metric-section-wide { grid-column: auto; }
  .heart-spotlight { min-height: 220px; }
  .data-context { padding: 19px; }
  .recovery-list { grid-template-columns: repeat(2, 1fr); }
  .recovery-list .metric-row:nth-child(3n) { border-right: 1px solid var(--line); }
  .recovery-list .metric-row:nth-child(2n) { border-right: 0; }
  .recovery-list .metric-row:nth-last-child(-n + 3) { border-bottom: 1px solid var(--line); }
  .recovery-list .metric-row:nth-last-child(-n + 2) { border-bottom: 0; }
}
@media (max-width: 480px) {
  .compact-list, .recovery-list { grid-template-columns: 1fr; }
  .compact-list .metric-row, .recovery-list .metric-row { border-right: 0; border-bottom: 1px solid var(--line); }
  .compact-list .metric-row:last-child, .recovery-list .metric-row:last-child { border-bottom: 0; }
  .record-row { grid-template-columns: auto minmax(0, 1fr) auto; }
  .record-fact { display: none; }
  .records-footer { justify-content: space-between; }
}
@media (prefers-reduced-motion: reduce) { .skeleton-block { animation: none; }.record-row { transition: none; } }
</style>
