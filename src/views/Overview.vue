<script setup lang="ts">
import LifeEventsPanel from '../components/LifeEventsPanel.vue';
import LifeEventShortcut from '../components/LifeEventShortcut.vue';

defineOptions({ name: 'Overview' });
import { computed, onMounted, ref, watch } from 'vue';
import { RouterLink } from 'vue-router';
import CoverageNotice from '../components/CoverageNotice.vue';
import DesignIcon from '../components/DesignIcon.vue';
import Icon from '../components/Icon.vue';
import SkeletonBlock from '../components/SkeletonBlock.vue';
import WeeklyReportCard from '../components/WeeklyReportCard.vue';
import HeartRateCard from '../components/overview/HeartRateCard.vue';
import RecentCard from '../components/overview/RecentCard.vue';
import SleepCard from '../components/overview/SleepCard.vue';
import SourcesStrip from '../components/overview/SourcesStrip.vue';
import StatusEntryCard from '../components/overview/StatusEntryCard.vue';
import StepsCard from '../components/overview/StepsCard.vue';
import '../components/overview/panels.css';
import { useDevices } from '../composables/useDevices';
import { useSyncController } from '../composables/useSyncController';
import { resolvedTheme } from '../composables/useTheme';
import { backend, isDesktop, toUserMessage } from '../lib/bridge';
import { chartPalettes } from '../lib/echartsTheme';
import { createLoadSeq } from '../lib/loadSeq';
import { indexSeries, latestValue } from '../lib/metricSeries';
import { formatMetric, isFiniteNumber } from '../lib/format';
import type { HealthOverview, HeartRatePoint, MetricSeries, SleepSession, Workout } from '../types';
import { defineMessages, useMessages } from '../i18n';

const messages = defineMessages(
  {
    overviewTitle: '概览',
    unrecognizedSuffix: ' 还没有识别出型号',
    unrecognizedCta: '点这里手动指认',
    deviceErrorPrefix: '设备识别：',
    loadingAria: '正在加载概览',
    loadFailedTitle: '无法读取数据概览',
    retry: '重试',
    healthUnavailable: '健康数据暂时不可用',
    partialUnavailable: '部分数据流尚未获取',
    bodyPanelAria: '打开身体状态',
    bodyTitle: '身体状态',
    factRecovery: '恢复',
    factStress: '压力',
    factSpo2: '血氧',
    bodySparkLabel: '近 7 天恢复状态趋势',
    bodyThin: '近 7 天记录不足以画出趋势',
    bodyEmpty: '同步后展示恢复、压力与血氧',
    trainingPanelAria: '打开训练状态',
    trainingTitle: '训练状态',
    factLoad: '负荷',
    trainingSparkLabel: '近 7 天训练负荷趋势',
    trainingThin: '近 7 天记录不足以画出趋势',
    trainingEmpty: '同步后展示 VO₂max 与训练负荷',
    loadLow: '偏低',
    loadMedium: '中等',
    loadHigh: '较高',
    loadVeryHigh: '很高',
    loadBandReference: (band: string) => `${band}（参考）`,
  },
  {
    overviewTitle: 'Overview',
    unrecognizedSuffix: ' has no model identified yet',
    unrecognizedCta: 'Pick it by hand',
    deviceErrorPrefix: 'Device identification: ',
    loadingAria: 'Loading the overview',
    loadFailedTitle: 'Could not read the data overview',
    retry: 'Try again',
    healthUnavailable: 'Health data is unavailable right now',
    partialUnavailable: 'Some data streams have not been fetched yet',
    bodyPanelAria: 'Open body status',
    bodyTitle: 'Body status',
    factRecovery: 'Readiness',
    factStress: 'Stress',
    factSpo2: 'SpO2',
    bodySparkLabel: 'Readiness over the last 7 days',
    bodyThin: 'Not enough records in the last 7 days to draw a trend',
    bodyEmpty: 'Readiness, stress and blood oxygen show up here after a sync',
    trainingPanelAria: 'Open training status',
    trainingTitle: 'Training status',
    factLoad: 'Load',
    trainingSparkLabel: 'Training load over the last 7 days',
    trainingThin: 'Not enough records in the last 7 days to draw a trend',
    trainingEmpty: 'VO₂max and training load show up here after a sync',
    loadLow: 'low',
    loadMedium: 'moderate',
    loadHigh: 'high',
    loadVeryHigh: 'very high',
    loadBandReference: (band: string) => `${band} (reference)`,
  },
  {
    overviewTitle: 'Resumen',
    unrecognizedSuffix: ' aún no tiene un modelo identificado',
    unrecognizedCta: 'Elígelo manualmente',
    deviceErrorPrefix: 'Identificación de dispositivos: ',
    loadingAria: 'Cargando el resumen',
    loadFailedTitle: 'No se pudo leer el resumen de datos',
    retry: 'Reintentar',
    healthUnavailable: 'Los datos de salud no están disponibles en este momento',
    partialUnavailable: 'Algunos flujos de datos aún no se han descargado',
    bodyPanelAria: 'Abrir el estado corporal',
    bodyTitle: 'Estado corporal',
    factRecovery: 'Recuperación',
    factStress: 'Estrés',
    factSpo2: 'SpO2',
    bodySparkLabel: 'Recuperación en los últimos 7 días',
    bodyThin: 'No hay suficientes registros en los últimos 7 días para trazar una tendencia',
    bodyEmpty: 'La recuperación, el estrés y el oxígeno en sangre aparecen aquí después de sincronizar',
    trainingPanelAria: 'Abrir el estado de entrenamiento',
    trainingTitle: 'Estado de entrenamiento',
    factLoad: 'Carga',
    trainingSparkLabel: 'Carga de entrenamiento en los últimos 7 días',
    trainingThin: 'No hay suficientes registros en los últimos 7 días para trazar una tendencia',
    trainingEmpty: 'El VO₂máx y la carga de entrenamiento aparecen aquí después de sincronizar',
    loadLow: 'baja',
    loadMedium: 'moderada',
    loadHigh: 'alta',
    loadVeryHigh: 'muy alta',
    loadBandReference: (band: string) => `${band} (referencia)`,
  },
);
const t = useMessages(messages);

const { dataRevision } = useSyncController();
const { models: deviceModels, error: deviceError, load: loadDevices } = useDevices();

const overview = ref<HealthOverview | null>(null);
const heartRateSeries = ref<HeartRatePoint[]>([]);
const recentSleep = ref<SleepSession[]>([]);
const recentWorkouts = ref<Workout[]>([]);
const statusSeries = ref<Record<string, MetricSeries>>({});
const loading = ref(true);
const error = ref<string | null>(null);
const partialWarning = ref<string | null>(null);
const loadSeq = createLoadSeq();

/* 没被认出来的设备。
 *
 * 认不出来时首页会显示一个占位图和「未识别设备」，但不会告诉用户这能改——
 * 于是他要么以为坏了，要么以为自己的表不支持。其实设置里点两下就能指认。
 * 有几台就提示几台，并且直接把人送到那台设备的页面，而不是丢到设置首页
 * 让他自己找。 */
const unrecognizedDevices = computed(() => deviceModels.value
  .filter((model) => model.state === 'unknown')
  .map((model) => ({
    key: model.deviceKey || model.canonicalName,
    name: model.profile.display_name?.trim() || model.canonicalName,
    to: model.deviceKey ? `/devices/${encodeURIComponent(model.deviceKey)}` : '/settings',
  })));

const stepsToday = computed(() => isFiniteNumber(overview.value?.steps_today) ? overview.value.steps_today : null);
const lastSleep = computed(() => recentSleep.value[0] ?? null);

const DEFAULT_LOAD_SCALE = 600;
const loadScale = computed(() => {
  const scale = overview.value?.training_load_scale;
  return isFiniteNumber(scale) && scale > 0 ? scale : DEFAULT_LOAD_SCALE;
});
const loadScaleIsReference = computed(() =>
  !(isFiniteNumber(overview.value?.training_load_scale) && (overview.value?.training_load_scale ?? 0) > 0),
);
const trainingLoad = computed(() => isFiniteNumber(overview.value?.training_load) ? overview.value.training_load : null);
const loadBand = computed(() => {
  if (trainingLoad.value === null) return null;
  const ratio = trainingLoad.value / loadScale.value;
  if (ratio < 1 / 6) return t.value.loadLow;
  if (ratio < 1 / 2) return t.value.loadMedium;
  if (ratio < 1) return t.value.loadHigh;
  return t.value.loadVeryHigh;
});

/**
 * The two entry cards.
 *
 * Each shows today's figures and a seven-day shape, and nothing more: the
 * reading of those numbers belongs on the page behind the card, and the
 * interpreting of them belongs to the AI the user chooses.
 */
const ENTRY_METRICS = ['readiness', 'stress', 'spo2', 'vo2max', 'training_load'];

const seriesValues = (metric: string): number[] =>
  (statusSeries.value[metric]?.points ?? []).map((point) => point.value);

/* 拿不到值就返回 null，让这一项整个消失。
   一排「血氧 —」「VO₂max —」既没告诉用户任何事，又把有数的那几项挤窄了。 */
const entryFigure = (metric: string, unit: string, digits = 0): string | null => {
  const value = latestValue(statusSeries.value[metric]);
  return value === null ? null : `${formatMetric(value, digits)}${unit}`;
};

type EntryFact = { key: string; label: string; text: string | null };
const withValues = (facts: EntryFact[]) =>
  facts.filter((fact): fact is EntryFact & { text: string } => fact.text !== null);

const palette = computed(() => chartPalettes[resolvedTheme.value]);

const bodyEntry = computed(() => ({
  facts: withValues([
    { key: 'readiness', label: t.value.factRecovery, text: entryFigure('readiness', '') },
    { key: 'stress', label: t.value.factStress, text: entryFigure('stress', '') },
    { key: 'spo2', label: t.value.factSpo2, text: entryFigure('spo2', '%') },
  ]),
  spark: seriesValues('readiness'),
  sparkColor: palette.value.series.readiness,
  // Say what the sparkline is, rather than leaving a shape with no caption.
  sparkLabel: t.value.bodySparkLabel,
  measured: Boolean(statusSeries.value.readiness?.days_with_data
    || statusSeries.value.stress?.days_with_data
    || statusSeries.value.spo2?.days_with_data),
}));

const trainingEntry = computed(() => ({
  facts: withValues([
    { key: 'vo2max', label: 'VO₂max', text: entryFigure('vo2max', '', 1) },
    {
      key: 'training_load',
      label: t.value.factLoad,
      text: trainingLoad.value === null
        ? null
        : `${formatMetric(trainingLoad.value)}${loadBand.value ? ` ${loadScaleIsReference.value ? t.value.loadBandReference(loadBand.value) : loadBand.value}` : ''}`,
    },
  ]),
  spark: seriesValues('training_load'),
  sparkColor: palette.value.series.training,
  sparkLabel: t.value.trainingSparkLabel,
  measured: Boolean(statusSeries.value.training_load?.days_with_data
    || statusSeries.value.vo2max?.days_with_data),
}));

const loadOverview = async () => {
  const seq = loadSeq.next();
  loading.value = true;
  error.value = null;
  partialWarning.value = null;
  if (!isDesktop()) {
    if (!loadSeq.isCurrent(seq)) return;
    overview.value = null;
    heartRateSeries.value = [];
    recentSleep.value = [];
    recentWorkouts.value = [];
    statusSeries.value = {};
    loading.value = false;
    return;
  }
  const results = await Promise.allSettled([
    backend.getHealthOverview(), backend.getHeartRateSeries(24), backend.getRecentSleep(3), backend.getRecentWorkouts(5),
    backend.getMetricSeries(ENTRY_METRICS, 7),
  ]);
  if (!loadSeq.isCurrent(seq)) return;
  const [health, heartRate, sleep, workouts, status] = results;
  overview.value = health.status === 'fulfilled' ? health.value : null;
  heartRateSeries.value = heartRate.status === 'fulfilled' ? heartRate.value : [];
  recentSleep.value = sleep.status === 'fulfilled' ? sleep.value : [];
  recentWorkouts.value = workouts.status === 'fulfilled' ? workouts.value : [];
  statusSeries.value = status.status === 'fulfilled' ? indexSeries(status.value) : {};
  const rejected = results.filter((result) => result.status === 'rejected');
  if (rejected.length === results.length) error.value = toUserMessage(rejected[0].reason, t.value.healthUnavailable);
  else if (rejected.length) partialWarning.value = toUserMessage(rejected[0].reason, t.value.partialUnavailable);
  loading.value = false;
};

onMounted(() => {
  // v3 起没有 Hero 卡，旧的「不再显示介绍」偏好也就没有对象了——
  // 留在 localStorage 里无害，顺手清掉避免误会它还在生效。
  try { window.localStorage.removeItem('zeppbridge.overview.hideHero'); } catch { /* 忽略 */ }
  void loadOverview();
  void loadDevices();
});
watch(dataRevision, () => { void loadOverview(); void loadDevices(); });
</script>

<template>
  <section class="page overview-page" aria-labelledby="overview-title">
    <header class="page-header overview-header">
      <div>
        <h1 id="overview-title">{{ t.overviewTitle }}</h1>
      </div>
    </header>

    <!-- 认不出型号不是「坏了」，是可以自己指认的。不说这一句，用户只会以为
         自己的表不受支持。 -->
    <RouterLink
      v-for="device in unrecognizedDevices"
      :key="device.key"
      class="unrecognized-banner"
      :to="device.to"
    >
      <Icon name="warning" :size="15" />
      <span><strong>{{ device.name }}</strong>{{ t.unrecognizedSuffix }}</span>
      <em>{{ t.unrecognizedCta }} <DesignIcon name="chevron-right" :size="16" /></em>
    </RouterLink>

    <WeeklyReportCard />

    <!--
      同步跑通却一条记录都没有，最先看到的是这一页。上面每个面板各自说一句
      「暂无数据」，谁也不解释为什么——而原因往往是登录时没确认对区域。
    -->
    <CoverageNotice />
    <LifeEventShortcut />

    <!-- v2 左侧栏的「数据来源」搬到了这里：一条横带列出设备和账户状态。 -->
    <SourcesStrip />

    <div v-if="partialWarning" class="inline-alert warning" role="status"><Icon name="info" :size="15" />{{ partialWarning }}</div>
    <div v-if="deviceError" class="inline-alert warning" role="status"><Icon name="info" :size="15" />{{ t.deviceErrorPrefix }}{{ deviceError }}</div>

    <div v-if="loading" class="overview-skeleton" aria-live="polite" :aria-label="t.loadingAria">
      <div class="skeleton-grid"><SkeletonBlock v-for="index in 6" :key="index" height="188px" /></div>
    </div>
    <div v-else-if="error" class="empty-wrap">
      <div class="empty-state" role="alert"><DesignIcon name="cloud-output" :size="72" /><strong>{{ t.loadFailedTitle }}</strong><span>{{ error }}</span><button class="button button-secondary" type="button" @click="loadOverview">{{ t.retry }}</button></div>
    </div>

    <div v-else class="dashboard-grid">
      <HeartRateCard :points="heartRateSeries" :current-hr="overview?.current_hr ?? null" />
      <StepsCard :steps="stepsToday" :goal="overview?.steps_goal ?? null" />
      <SleepCard :sleep="lastSleep" />
      <StatusEntryCard
        to="/body"
        tone="body"
        icon="recovery"
        :aria-label="t.bodyPanelAria"
        :title="t.bodyTitle"
        :facts="bodyEntry.facts"
        :spark="bodyEntry.spark"
        :spark-color="bodyEntry.sparkColor"
        :spark-label="bodyEntry.sparkLabel"
        :note="bodyEntry.measured ? t.bodyThin : t.bodyEmpty"
      />
      <StatusEntryCard
        to="/training"
        tone="training"
        icon="training-load"
        :aria-label="t.trainingPanelAria"
        :title="t.trainingTitle"
        :facts="trainingEntry.facts"
        :spark="trainingEntry.spark"
        :spark-color="trainingEntry.sparkColor"
        :spark-label="trainingEntry.sparkLabel"
        :note="trainingEntry.measured ? t.trainingThin : t.trainingEmpty"
      />
      <RecentCard :sleep="recentSleep" :workouts="recentWorkouts" />
    </div>
    <LifeEventsPanel />
  </section>
</template>

<style scoped>
.overview-page { display: grid; gap: 18px; align-content: start; max-width: 1540px; margin: 0 auto; }
.overview-header { margin-bottom: 0; }
.overview-header h1 { margin-bottom: 0; }

.inline-alert { display: flex; align-items: center; gap: 8px; padding: 9px 13px; border: 1px solid var(--line); border-radius: 12px; background: var(--surface); color: var(--muted); font-size: var(--fs-sm); }
.inline-alert.warning { color: var(--warning); }
.overview-skeleton { display: grid; gap: 16px; }
.skeleton-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 16px; }
.empty-wrap { display: grid; min-height: 300px; place-items: center; }
.empty-state { display: grid; max-width: 360px; justify-items: center; gap: 9px; padding: 32px; color: var(--muted); text-align: center; }
.empty-state strong { color: var(--ink); font-size: var(--fs-2xl); }
.dashboard-grid { display: grid; grid-template-columns: repeat(12, minmax(0, 1fr)); gap: 16px; }

/* 未识别设备提醒是唯一一块有意的琥珀色——它是提示条，不是装饰。 */
.unrecognized-banner {
  display: flex;
  align-items: center;
  gap: 9px;
  padding: 10px 14px;
  border: 1px solid color-mix(in srgb, var(--warning) 32%, transparent);
  border-radius: 14px;
  background: color-mix(in srgb, var(--warning) 9%, transparent);
  color: var(--warning);
  font-size: var(--fs-sm);
  text-decoration: none;
}
.unrecognized-banner strong { color: var(--ink); font-weight: 600; }
.unrecognized-banner em { display: inline-flex; align-items: center; gap: 3px; margin-left: auto; font-style: normal; white-space: nowrap; }
.unrecognized-banner:hover { border-color: color-mix(in srgb, var(--warning) 48%, transparent); }

@media (max-width: 820px) {
  .overview-page { padding-inline: 16px; }
  .dashboard-grid { grid-template-columns: minmax(0, 1fr); }
  .skeleton-grid { grid-template-columns: minmax(0, 1fr); }
}
</style>
