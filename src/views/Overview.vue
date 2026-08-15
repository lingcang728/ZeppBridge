<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { RouterLink } from 'vue-router';
import DeviceCard from '../components/DeviceCard.vue';
import Icon from '../components/Icon.vue';
import SkeletonBlock from '../components/SkeletonBlock.vue';
import { useDevices } from '../composables/useDevices';
import { useSyncController } from '../composables/useSyncController';
import { backend, isDesktop, toUserMessage } from '../lib/bridge';
import { formatDate, formatDateTime, formatDistance, formatDuration, formatMetric, formatTime, isFiniteNumber } from '../lib/format';
import { displayableWorkouts, workoutDurationMinutes } from '../lib/workouts';
import type { DailyPoint, HealthOverview, SleepSession, Workout } from '../types';

const { appStatus, dataRevision } = useSyncController();
const { models: deviceModels, cache: deviceCache, loading: devicesLoading, error: deviceError, load: loadDevices } = useDevices();

const overview = ref<HealthOverview | null>(null);
const trainingLoad = ref<DailyPoint[]>([]);
const recentSleep = ref<SleepSession[]>([]);
const recentWorkouts = ref<Workout[]>([]);
const loading = ref(true);
const error = ref<string | null>(null);
const partialWarning = ref<string | null>(null);

const missing = '未提供';
const dateTime = (value?: string | null) => value ? formatDateTime(value, '时间未知') : '尚未获取';
const numberLabel = (value: unknown, suffix = '') => isFiniteNumber(value) ? `${formatMetric(value)}${suffix}` : missing;

const bodyReadiness = computed(() => {
  const health = overview.value;
  if (!health) return { value: null as number | null, label: missing, source: missing };
  if (isFiniteNumber(health.readiness)) return { value: health.readiness, label: '恢复准备度', source: 'HealthOverview.readiness' };
  if (isFiniteNumber(health.bio_charge)) return { value: health.bio_charge, label: 'Bio Charge', source: 'HealthOverview.bio_charge' };
  if (isFiniteNumber(health.hybrid_charge)) return { value: health.hybrid_charge, label: 'Hybrid Charge', source: 'HealthOverview.hybrid_charge' };
  return { value: null as number | null, label: missing, source: missing };
});

const readinessStyle = computed(() => ({ width: `${Math.max(0, Math.min(100, bodyReadiness.value.value ?? 0))}%` }));
const latestSleep = computed(() => recentSleep.value[0] ?? null);
const displayableRecentWorkouts = computed(() => displayableWorkouts(recentWorkouts.value));
const latestWorkout = computed(() => displayableRecentWorkouts.value[0] ?? null);
const latestTrainingLoad = computed(() => {
  const values = trainingLoad.value.map((point) => point.value).filter((value) => isFiniteNumber(value));
  return values.length ? values[values.length - 1] : null;
});
const trainingStats = computed(() => {
  const values = trainingLoad.value.map((point) => point.value).filter((value) => isFiniteNumber(value));
  if (!values.length) return null;
  return { min: Math.min(...values), max: Math.max(...values), avg: values.reduce((sum, value) => sum + value, 0) / values.length };
});
const trainingBars = computed(() => {
  const values = trainingLoad.value.filter((point) => isFiniteNumber(point.value));
  if (!values.length) return [];
  const max = Math.max(...values.map((point) => point.value), 1);
  return values.slice(-14).map((point) => ({
    ...point,
    height: `${Math.max(5, Math.round((point.value / max) * 100))}%`,
  }));
});

const aiChecks = computed(() => [
  { label: '健康概览', ready: Boolean(overview.value) },
  { label: '睡眠记录', ready: recentSleep.value.length > 0 },
  { label: '运动记录', ready: recentWorkouts.value.length > 0 },
  { label: '训练负荷序列', ready: trainingLoad.value.length > 0 },
]);
const aiReadyCount = computed(() => aiChecks.value.filter((check) => check.ready).length);
const aiReadiness = computed(() => aiReadyCount.value ? Math.round((aiReadyCount.value / aiChecks.value.length) * 100) : null);
const aiReadinessStyle = computed(() => ({ width: `${aiReadiness.value ?? 0}%` }));

const deviceSummary = computed(() => {
  if (devicesLoading.value) return '正在识别';
  if (!deviceModels.value.length) return '未识别';
  return `${deviceModels.value.length} 个设备`;
});
const cloudState = computed(() => ['connected', 'configured'].includes(String(appStatus.value?.connection_state || '')) ? '账号已识别' : '未识别');
const syncLabel = computed(() => dateTime(appStatus.value?.last_cloud_sync_at));
const coverageLabel = computed(() => {
  const coverage = overview.value?.coverage;
  if (!coverage?.start || !coverage.end) return missing;
  return `${coverage.start} – ${coverage.end}`;
});
const recordsLabel = computed(() => {
  const total = (appStatus.value?.streams ?? []).reduce((sum, stream) => sum + (stream.records ?? 0), 0);
  return total > 0 ? `${total.toLocaleString('zh-CN')} 条` : missing;
});

const loadOverview = async () => {
  loading.value = true;
  error.value = null;
  partialWarning.value = null;
  if (!isDesktop()) {
    overview.value = null;
    trainingLoad.value = [];
    recentSleep.value = [];
    recentWorkouts.value = [];
    loading.value = false;
    return;
  }
  const results = await Promise.allSettled([
    backend.getHealthOverview(),
    backend.getTrainingLoadSeries(7),
    backend.getRecentSleep(3),
    backend.getRecentWorkouts(3),
  ]);
  const [health, load, sleep, workouts] = results;
  overview.value = health.status === 'fulfilled' ? health.value : null;
  trainingLoad.value = load.status === 'fulfilled' ? load.value : [];
  recentSleep.value = sleep.status === 'fulfilled' ? sleep.value : [];
  recentWorkouts.value = workouts.status === 'fulfilled' ? displayableWorkouts(workouts.value) : [];
  const rejected = results.filter((result) => result.status === 'rejected');
  if (rejected.length === results.length) {
    error.value = toUserMessage(rejected[0].reason, '健康数据暂时不可用');
  } else if (rejected.length) {
    partialWarning.value = toUserMessage(rejected[0].reason, '部分健康数据尚未获取');
  }
  loading.value = false;
};

onMounted(() => {
  void loadOverview();
  void loadDevices();
});
watch(dataRevision, () => {
  void loadOverview();
  void loadDevices();
});
</script>

<template>
  <section class="page overview-page" aria-labelledby="overview-title">
    <header class="page-header overview-heading">
      <div>
        <p class="eyebrow">HEALTH OVERVIEW</p>
        <h1 id="overview-title">健康概览</h1>
        <p class="page-intro">只呈现账户和本机已获取的穿戴数据；缺失字段会明确标记，不以推断补齐。</p>
      </div>
      <div class="overview-meta">
        <span class="state-chip"><i class="dot"></i>{{ cloudState }}</span>
        <span>最近同步 {{ syncLabel }}</span>
      </div>
    </header>

    <div v-if="partialWarning" class="inline-alert warning" role="status"><Icon name="info" :size="15" />{{ partialWarning }}</div>
    <div v-if="deviceError" class="inline-alert warning" role="status"><Icon name="info" :size="15" />设备识别：{{ deviceError }}</div>

    <div v-if="loading" class="overview-skeleton" aria-live="polite" aria-label="正在加载健康概览">
      <SkeletonBlock height="160px" />
      <div class="skeleton-grid"><SkeletonBlock height="190px" /><SkeletonBlock height="190px" /></div>
      <SkeletonBlock height="240px" />
    </div>
    <div v-else-if="error" class="empty-wrap">
      <div class="empty-state" role="alert"><Icon name="warning" :size="20" /><strong>无法读取健康概览</strong><span>{{ error }}</span><button class="button button-secondary" type="button" @click="loadOverview">重试</button></div>
    </div>
    <template v-else>
      <section class="overview-grid top-grid" aria-label="身体状态">
        <article class="surface-card body-readiness-card">
          <div class="section-head"><div><p class="eyebrow">BODY STATE</p><h2>恢复准备度</h2></div><Icon name="heart" :size="18" class="heart-icon" /></div>
          <div class="readiness-value" :class="{ missing: bodyReadiness.value === null }">
            <strong>{{ bodyReadiness.value === null ? missing : formatMetric(bodyReadiness.value) }}</strong>
            <span v-if="bodyReadiness.value !== null">/ 100</span>
          </div>
          <p class="metric-caption">{{ bodyReadiness.label }} · {{ bodyReadiness.source }}</p>
          <div class="progress-track" aria-hidden="true"><span :style="readinessStyle"></span></div>
          <dl class="metric-pairs">
            <div><dt>当前心率</dt><dd>{{ numberLabel(overview?.current_hr, ' bpm') }}</dd></div>
            <div><dt>静息心率</dt><dd>{{ numberLabel(overview?.resting_hr, ' bpm') }}</dd></div>
            <div><dt>HRV</dt><dd>{{ numberLabel(overview?.hrv, ' ms') }}</dd></div>
            <div><dt>更新时间</dt><dd>{{ dateTime(overview?.last_updated) }}</dd></div>
          </dl>
        </article>

        <article class="surface-card latest-sleep-card">
          <div class="section-head"><div><p class="eyebrow">LATEST SLEEP</p><h2>最新睡眠</h2></div><RouterLink class="text-link" :to="latestSleep ? `/sleep/${latestSleep.sleep_id}` : '/recent'">查看记录 <Icon name="arrow-right" :size="13" /></RouterLink></div>
          <div v-if="latestSleep" class="sleep-summary">
            <div class="sleep-duration"><strong>{{ formatDuration(latestSleep.duration_minutes, missing) }}</strong><span>{{ formatDate(latestSleep.start_time, 'short') }}</span></div>
            <div class="sleep-score"><span>评分</span><strong>{{ isFiniteNumber(latestSleep.score) ? formatMetric(latestSleep.score) : missing }}</strong></div>
          </div>
          <div v-if="latestSleep" class="sleep-times">{{ formatTime(latestSleep.start_time) }} 入睡 · {{ formatTime(latestSleep.end_time) }} 醒来 · 在床 {{ isFiniteNumber(latestSleep.time_in_bed_minutes) ? formatDuration(latestSleep.time_in_bed_minutes) : missing }}</div>
          <p v-else class="missing-note">尚未获取睡眠记录。</p>
          <div class="mini-stage-row" v-if="latestSleep">
            <span><i class="deep"></i>深睡 {{ isFiniteNumber(latestSleep.deep_minutes) ? formatDuration(latestSleep.deep_minutes) : missing }}</span>
            <span><i class="light"></i>浅睡 {{ isFiniteNumber(latestSleep.light_minutes) ? formatDuration(latestSleep.light_minutes) : missing }}</span>
            <span><i class="rem"></i>REM {{ isFiniteNumber(latestSleep.rem_minutes) ? formatDuration(latestSleep.rem_minutes) : missing }}</span>
          </div>
        </article>
      </section>

      <section class="overview-grid data-grid" aria-label="训练与运动摘要">
        <article class="surface-card training-card">
          <div class="section-head"><div><p class="eyebrow">TRAINING LOAD · 7 DAYS</p><h2>训练负荷</h2></div><span class="value-pill">{{ latestTrainingLoad === null ? missing : formatMetric(latestTrainingLoad) }}</span></div>
          <div v-if="trainingBars.length" class="training-chart" aria-label="最近七天训练负荷">
            <div v-for="point in trainingBars" :key="point.date" class="training-bar-wrap"><span class="training-bar" :style="{ height: point.height }" :title="`${point.date} ${formatMetric(point.value)}`"></span><small>{{ point.date.slice(5) }}</small></div>
          </div>
          <p v-else class="missing-note">尚未获取训练负荷序列。</p>
          <p v-if="trainingStats" class="chart-foot">最小 {{ formatMetric(trainingStats.min) }} · 平均 {{ formatMetric(trainingStats.avg, 1) }} · 最大 {{ formatMetric(trainingStats.max) }}</p>
        </article>

        <article class="surface-card recent-workout-card">
          <div class="section-head"><div><p class="eyebrow">RECENT WORKOUT</p><h2>最近运动摘要</h2></div><RouterLink class="text-link" to="/recent">查看全部 <Icon name="arrow-right" :size="13" /></RouterLink></div>
          <div v-if="latestWorkout" class="workout-summary">
            <span class="workout-icon"><Icon name="run" :size="20" /></span>
            <div class="workout-main"><strong>{{ latestWorkout.workout_type || missing }}</strong><span>{{ formatDate(latestWorkout.start_time, 'short') }} · {{ formatDuration(workoutDurationMinutes(latestWorkout), missing) }}</span></div>
            <strong class="workout-distance">{{ formatDistance(latestWorkout.distance_meters, missing) }}</strong>
          </div>
          <dl v-if="latestWorkout" class="metric-pairs workout-pairs">
            <div><dt>平均心率</dt><dd>{{ numberLabel(latestWorkout.avg_hr, ' bpm') }}</dd></div>
            <div><dt>消耗</dt><dd>{{ numberLabel(latestWorkout.calories, ' kcal') }}</dd></div>
            <div><dt>Training Load</dt><dd>{{ numberLabel(latestWorkout.training_load) }}</dd></div>
            <div><dt>VO₂ Max</dt><dd>{{ numberLabel(latestWorkout.vo2max) }}</dd></div>
          </dl>
          <p v-else class="missing-note">尚未获取运动记录。</p>
        </article>
      </section>

      <section class="surface-card devices-panel" aria-label="账号设备">
        <div class="section-head"><div><p class="eyebrow">ACCOUNT DEVICES</p><h2>账号设备</h2></div><span class="head-note">{{ deviceSummary }}</span></div>
        <div v-if="devicesLoading" class="device-grid device-grid-loading"><SkeletonBlock v-for="i in 2" :key="i" height="104px" /></div>
        <div v-else-if="deviceModels.length" class="device-grid">
          <DeviceCard v-for="device in deviceModels" :key="device.profile.device_id || device.profile.serial || device.canonicalName" :profile="device" />
        </div>
        <div v-else class="device-empty"><Icon name="watch" :size="18" /><span>账号尚未识别可展示的实体设备。</span></div>
        <div class="cloud-source"><span class="cloud-source-icon"><Icon name="cloud" :size="18" /></span><div><strong>Zap Cloud</strong><span>云服务 · {{ cloudState }}</span></div><span class="cloud-source-time">最近同步 {{ syncLabel }}</span></div>
      </section>

      <section class="overview-grid bottom-grid" aria-label="数据包与 AI 交接">
        <article class="surface-card package-card">
          <div class="section-head"><div><p class="eyebrow">LOCAL DATASET</p><h2>最新数据包</h2></div><RouterLink class="text-link" to="/recent">查看全部 <Icon name="arrow-right" :size="13" /></RouterLink></div>
          <dl class="metric-pairs">
            <div><dt>日期范围</dt><dd>{{ coverageLabel }}</dd></div>
            <div><dt>记录条数</dt><dd>{{ recordsLabel }}</dd></div>
            <div><dt>最后同步</dt><dd>{{ syncLabel }}</dd></div>
            <div><dt>今日步数</dt><dd>{{ numberLabel(overview?.steps_today, ' 步') }}</dd></div>
            <div><dt>活动消耗</dt><dd>{{ numberLabel(overview?.active_calories_today, ' kcal') }}</dd></div>
          </dl>
        </article>

        <article class="surface-card ai-card">
          <div class="section-head"><div><p class="eyebrow">AI HANDOFF</p><h2>AI 交接就绪度</h2></div><Icon name="spark" :size="18" class="ai-icon" /></div>
          <p class="card-note">这是字段可用性，不等同于身体恢复准备度，也不会生成训练或医疗建议。</p>
          <div class="readiness-value" :class="{ missing: aiReadiness === null }"><strong>{{ aiReadiness === null ? missing : `${aiReadiness}%` }}</strong><span v-if="aiReadiness !== null">字段可用</span></div>
          <div class="progress-track" aria-hidden="true"><span :style="aiReadinessStyle"></span></div>
          <ul class="check-list"><li v-for="check in aiChecks" :key="check.label"><Icon :name="check.ready ? 'circle-check' : 'info'" :size="14" :class="{ pending: !check.ready }" /><span>{{ check.label }}</span><em>{{ check.ready ? '已获取' : '未提供' }}</em></li></ul>
          <RouterLink class="button button-primary" to="/explore">前往导出与提示词 <Icon name="arrow-right" :size="14" /></RouterLink>
        </article>
      </section>

      <p class="overview-note"><Icon name="shield" :size="13" />本页仅展示本机已保存或账号已识别的数据。设备缓存状态：{{ deviceCache?.status || '未提供' }}。</p>
    </template>
  </section>
</template>

<style scoped>
.overview-page { display: grid; gap: 16px; }
.overview-heading { align-items: flex-end; margin-bottom: 0; }
.overview-meta { display: flex; align-items: center; gap: 12px; color: var(--muted); font-size: 12px; white-space: nowrap; }
.state-chip { display: inline-flex; align-items: center; gap: 6px; padding: 5px 10px; border: 1px solid var(--line); border-radius: 999px; background: var(--surface); color: var(--accent); }
.dot { width: 7px; height: 7px; border-radius: 50%; background: var(--accent); }
.inline-alert { display: flex; align-items: flex-start; gap: 8px; padding: 9px 12px; border: 1px solid var(--line); border-radius: var(--radius-sm); background: var(--surface); color: var(--muted); font-size: 12px; }
.inline-alert.warning { color: var(--warning); }
.overview-skeleton { display: grid; gap: 16px; }
.skeleton-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 16px; }
.overview-grid { display: grid; gap: 16px; }
.top-grid, .data-grid { grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); }
.bottom-grid { grid-template-columns: minmax(0, .95fr) minmax(0, 1.05fr); }
.surface-card { padding: 18px 20px; }
.section-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; margin-bottom: 16px; }
.section-head h2 { margin: 2px 0 0; font-size: 16px; font-weight: 700; }
.eyebrow { margin: 0; color: var(--subtle); font-size: 10px; letter-spacing: .14em; }
.head-note { color: var(--muted); font-size: 12px; }
.text-link { display: inline-flex; align-items: center; gap: 4px; color: var(--accent); font-size: 12px; text-decoration: none; }
.heart-icon { color: var(--heart); }
.ai-icon { color: var(--training); }
.readiness-value { display: flex; align-items: baseline; gap: 7px; min-height: 52px; }
.readiness-value strong { color: var(--ink); font-family: var(--font-mono); font-size: 40px; font-weight: 600; letter-spacing: -.03em; }
.readiness-value span { color: var(--muted); font-size: 12px; }
.readiness-value.missing strong { color: var(--muted); font-family: var(--font-sans); font-size: 20px; letter-spacing: 0; }
.metric-caption, .card-note { margin: 4px 0 14px; color: var(--muted); font-size: 11px; }
.progress-track { height: 8px; overflow: hidden; border-radius: 999px; background: var(--surface-raised); }
.progress-track span { display: block; height: 100%; border-radius: inherit; background: var(--readiness); transition: transform 180ms ease; transform-origin: left center; }
.body-readiness-card .progress-track span { background: var(--heart); }
.metric-pairs { display: grid; gap: 9px; margin: 16px 0 0; }
.metric-pairs > div { display: flex; align-items: baseline; justify-content: space-between; gap: 10px; padding-bottom: 8px; border-bottom: 1px solid var(--line); }
.metric-pairs > div:last-child { border-bottom: 0; padding-bottom: 0; }
.metric-pairs dt { color: var(--muted); font-size: 12px; }
.metric-pairs dd { margin: 0; color: var(--ink); font-family: var(--font-mono); font-size: 12px; text-align: right; }
.sleep-summary { display: flex; align-items: flex-end; justify-content: space-between; gap: 12px; }
.sleep-duration { display: grid; gap: 3px; }
.sleep-duration strong { color: var(--ink); font-family: var(--font-mono); font-size: 28px; font-weight: 600; }
.sleep-duration span, .sleep-times { color: var(--muted); font-size: 11px; }
.sleep-score { display: grid; justify-items: end; gap: 3px; }
.sleep-score span { color: var(--muted); font-size: 11px; }
.sleep-score strong { color: var(--sleep-light); font-family: var(--font-mono); font-size: 28px; }
.sleep-times { margin: 12px 0 14px; }
.mini-stage-row { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 8px; color: var(--muted); font-size: 11px; }
.mini-stage-row span { display: inline-flex; align-items: center; gap: 5px; min-width: 0; }
.mini-stage-row i { width: 7px; height: 7px; flex: 0 0 7px; border-radius: 50%; }
.deep { background: var(--sleep-deep); } .light { background: var(--sleep-light); } .rem { background: var(--sleep-rem); }
.missing-note { margin: 0; padding: 22px 0; color: var(--muted); font-size: 12px; }
.value-pill { padding: 4px 9px; border: 1px solid rgba(216, 255, 82, .30); border-radius: 999px; color: var(--training); font-family: var(--font-mono); font-size: 12px; }
.training-chart { display: flex; align-items: end; gap: 8px; height: 148px; padding: 12px 4px 0; border-bottom: 1px solid var(--line); }
.training-bar-wrap { display: grid; flex: 1; min-width: 0; height: 100%; align-items: end; justify-items: center; gap: 6px; }
.training-bar { display: block; width: min(22px, 70%); min-height: 5px; border-radius: 5px 5px 2px 2px; background: var(--training); opacity: .86; transition: transform 160ms ease, opacity 160ms ease; transform-origin: bottom center; }
.training-bar:hover { opacity: 1; transform: scaleY(1.04); }
.training-bar-wrap small { color: var(--subtle); font-family: var(--font-mono); font-size: 9px; white-space: nowrap; }
.chart-foot { margin: 10px 0 0; color: var(--muted); font-family: var(--font-mono); font-size: 11px; }
.workout-summary { display: flex; align-items: center; gap: 10px; padding: 12px; border: 1px solid var(--line); border-radius: var(--radius-sm); background: var(--surface-raised); }
.workout-icon { display: grid; place-items: center; width: 38px; height: 38px; flex: 0 0 38px; border-radius: 10px; background: var(--activity-wash); color: var(--cadence); }
.workout-main { display: grid; gap: 3px; min-width: 0; flex: 1; }
.workout-main strong { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 13px; }
.workout-main span { color: var(--muted); font-size: 11px; }
.workout-distance { color: var(--ink); font-family: var(--font-mono); font-size: 14px; white-space: nowrap; }
.workout-pairs { grid-template-columns: repeat(2, minmax(0, 1fr)); column-gap: 14px; }
.workout-pairs > div { display: grid; gap: 3px; }
.workout-pairs dd { text-align: left; }
.devices-panel { padding-bottom: 14px; }
.device-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; }
.device-grid-loading { align-items: stretch; }
.device-empty { display: flex; align-items: center; gap: 8px; min-height: 86px; padding: 12px; border: 1px dashed var(--line-strong); border-radius: var(--radius-sm); color: var(--muted); font-size: 12px; }
.cloud-source { display: flex; align-items: center; gap: 10px; margin-top: 12px; padding-top: 12px; border-top: 1px solid var(--line); }
.cloud-source-icon { display: grid; place-items: center; width: 36px; height: 36px; border: 1px solid var(--line); border-radius: 9px; color: var(--pace); }
.cloud-source div { display: grid; gap: 2px; min-width: 0; flex: 1; }
.cloud-source strong { font-size: 12px; }
.cloud-source div span, .cloud-source-time { color: var(--muted); font-size: 11px; }
.cloud-source-time { font-family: var(--font-mono); }
.package-card .metric-pairs { margin-top: 0; }
.ai-card .check-list { margin: 14px 0; }
.check-list { display: grid; gap: 8px; margin: 0; padding: 0; list-style: none; }
.check-list li { display: flex; align-items: center; gap: 7px; color: var(--muted); font-size: 12px; }
.check-list li svg { color: var(--readiness); }
.check-list li svg.pending { color: var(--subtle); }
.check-list li span { flex: 1; }
.check-list li em { color: var(--muted); font-size: 11px; font-style: normal; }
.button { text-decoration: none; }
.ai-card .button { width: 100%; }
.overview-note { display: flex; align-items: center; justify-content: center; gap: 6px; margin: 0; color: var(--subtle); font-size: 11px; }
.empty-wrap { padding: 30px 0; }
.empty-state { display: grid; justify-items: center; gap: 8px; padding: 30px; border: 1px dashed var(--line-strong); border-radius: var(--radius-md); background: var(--surface); color: var(--muted); text-align: center; }
.empty-state strong { color: var(--ink); font-size: 14px; }
.empty-state .button { margin-top: 4px; }
@media (max-width: 920px) { .top-grid, .data-grid, .bottom-grid { grid-template-columns: minmax(0, 1fr); } }
@media (max-width: 680px) { .overview-heading { display: grid; gap: 10px; } .overview-meta { white-space: normal; flex-wrap: wrap; } .skeleton-grid, .device-grid { grid-template-columns: minmax(0, 1fr); } .surface-card { padding: 16px; } .mini-stage-row { grid-template-columns: minmax(0, 1fr); } }
@media (prefers-reduced-motion: reduce) { .progress-track span, .training-bar, .training-bar:hover { transition: none; transform: none; } }
</style>
