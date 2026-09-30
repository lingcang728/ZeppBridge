<script setup lang="ts">

defineOptions({ name: 'Overview' });
import { computed, onActivated, onBeforeUnmount, onDeactivated, onMounted, ref, watch } from 'vue';
import { RouterLink } from 'vue-router';
import CoverageNotice from '../components/CoverageNotice.vue';
import OfficialOnlyNote from '../components/OfficialOnlyNote.vue';
import GlyphTile from '../components/GlyphTile.vue';
import Icon from '../components/Icon.vue';
import SkeletonBlock from '../components/SkeletonBlock.vue';
/* 心率曲线是 SVG（HrMiniChart），首页不再加载 ECharts，所以这张卡可以静态引入。 */
import HeartRateCard from '../components/overview/HeartRateCard.vue';
import RecentCard from '../components/overview/RecentCard.vue';
import SleepCard from '../components/overview/SleepCard.vue';
import DataReadyCapsule from '../components/overview/DataReadyCapsule.vue';
import StepsCard from '../components/overview/StepsCard.vue';
import OverviewMore from '../components/overview/OverviewMore.vue';
import WeekDigest from '../components/overview/WeekDigest.vue';
import PinnedMetrics from '../components/overview/PinnedMetrics.vue';
import '../components/overview/panels.css';
import { useDevices } from '../composables/useDevices';
import { useSyncController } from '../composables/useSyncController';
import { resolvedTheme } from '../composables/useTheme';
import { backend, isDesktop, toUserMessage } from '../lib/bridge';
import { chartPalettes } from '../lib/echartsTheme';
import { createLoadSeq } from '../lib/loadSeq';
import { indexSeries, latestValue } from '../lib/metricSeries';
import { vTilt } from '../lib/tilt';
import { formatMetric, isFiniteNumber } from '../lib/format';
import { displayDateTimeFormatter } from '../lib/dateTime';
import type { HealthOverview, HeartRatePoint, MetricSeries, SleepSession, Workout } from '../types';
import { defineMessages, useMessages } from '../i18n';

const messages = defineMessages(
  {
    overviewTitle: '概览',
    unrecognizedSuffix: ' 还没有识别出型号',
    unrecognizedCta: '点这里指认',
    deviceErrorPrefix: '设备识别：',
    loadingAria: '正在加载概览',
    loadFailedTitle: '无法读取数据概览',
    desktopOnly: '浏览器预览不读账户数据，用桌面应用打开。',
    retry: '重试',
    healthUnavailable: '健康数据暂不可用',
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
    loadFailedTitle: 'Could not load overview',
    desktopOnly: 'Use the desktop app. This browser preview reads no account data.',
    retry: 'Retry',
    healthUnavailable: 'Health data unavailable right now',
    partialUnavailable: 'Some data streams not fetched yet',
    bodyPanelAria: 'Open body status',
    bodyTitle: 'Body status',
    factRecovery: 'Readiness',
    factStress: 'Stress',
    factSpo2: 'SpO2',
    bodySparkLabel: 'Readiness over the last 7 days',
    bodyThin: 'Too few records in the last 7 days for a trend',
    bodyEmpty: 'Readiness, stress and SpO2 appear after a sync',
    trainingPanelAria: 'Open training status',
    trainingTitle: 'Training status',
    factLoad: 'Load',
    trainingSparkLabel: 'Training load over the last 7 days',
    trainingThin: 'Too few records in the last 7 days for a trend',
    trainingEmpty: 'VO₂max and training load appear after a sync',
    loadLow: 'low',
    loadMedium: 'moderate',
    loadHigh: 'high',
    loadVeryHigh: 'very high',
    loadBandReference: (band: string) => `${band} (reference)`,
  },
  {
    overviewTitle: 'Resumen',
    unrecognizedSuffix: ' aún no tiene un modelo identificado',
    unrecognizedCta: 'Toca aquí para indicarlo',
    deviceErrorPrefix: 'Identificación de dispositivos: ',
    loadingAria: 'Cargando el resumen',
    loadFailedTitle: 'No se pudo leer el resumen de datos',
    desktopOnly: 'La vista previa del navegador no lee datos de la cuenta; usa la app de escritorio.',
    retry: 'Reintentar',
    healthUnavailable: 'Datos de salud no disponibles de momento',
    partialUnavailable: 'Algunos flujos de datos aún no se han descargado',
    bodyPanelAria: 'Abrir el estado corporal',
    bodyTitle: 'Estado corporal',
    factRecovery: 'Recuperación',
    factStress: 'Estrés',
    factSpo2: 'SpO₂',
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
  'views/Overview',
);
const t = useMessages(messages);

const { dataRevision, streamUpdate } = useSyncController();
/** 页头标题下面一行今天的日期（按界面语言），标题不再孤零零地占一整行。 */
const todayLabel = computed(() => displayDateTimeFormatter({ month: 'long', day: 'numeric', weekday: 'long' }).format(new Date()));
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
    to: model.deviceKey ? `/devices/${encodeURIComponent(model.deviceKey)}` : '/settings/account',
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
  sparkColor: palette.value.series.heart,
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

// Each query publishes as soon as it resolves. Stream updates never clear visible cards.
const queryVersions = new Map<string, number>();
let active = true;
let refreshOnActivate = false;
const publish = async <T,>(key: string, query: () => Promise<T>, apply: (value: T) => void) => {
  const version = (queryVersions.get(key) ?? 0) + 1;
  queryVersions.set(key, version);
  const value = await query();
  if (queryVersions.get(key) === version) {
    apply(value);
    loading.value = false;
    error.value = null;
  }
};
const queries = () => ({
  health: () => publish('health', () => backend.getHealthOverview(), value => { overview.value = value; }),
  heart: () => publish('heart', () => backend.getHeartRateSeries(6), value => { heartRateSeries.value = value; }),
  sleep: () => publish('sleep', () => backend.getRecentSleep(3), value => { recentSleep.value = value; }),
  workouts: () => publish('workouts', () => backend.getRecentWorkouts(5), value => { recentWorkouts.value = value; }),
  status: () => publish('status', () => backend.getMetricSeries(ENTRY_METRICS, 7), value => { statusSeries.value = indexSeries(value); }),
});
const loadOverview = async () => {
  if (!active) { refreshOnActivate = true; return; }
  const seq = loadSeq.next();
  if (!isDesktop()) { loading.value = false; error.value = t.value.desktopOnly; return; }
  partialWarning.value = null;
  const q = queries();
  const results = await Promise.allSettled([q.heart(), q.health(), q.sleep(), q.workouts(), q.status()]);
  if (!loadSeq.isCurrent(seq)) return;
  const rejected = results.filter(result => result.status === 'rejected');
  if (rejected.length === results.length) error.value = toUserMessage(rejected[0].reason, t.value.healthUnavailable);
  else if (rejected.length) partialWarning.value = toUserMessage(rejected[0].reason, t.value.partialUnavailable);
  loading.value = false;
};
const refreshStream = async (stream: string) => {
  if (!active) { refreshOnActivate = true; return; }
  if (!isDesktop()) return;
  const q = queries();
  const tasks = stream === 'heart_rate' ? [q.heart(), q.health()]
    : stream === 'sleep' ? [q.sleep()]
    : stream === 'workouts' || stream === 'workout_detail' ? [q.workouts()]
    : [q.health(), q.status()];
  const results = await Promise.allSettled(tasks);
  const failure = results.find(result => result.status === 'rejected');
  if (failure?.status === 'rejected') partialWarning.value = toUserMessage(failure.reason, t.value.partialUnavailable);
};
onDeactivated(() => { active = false; });
onActivated(() => { active = true; if (refreshOnActivate) { refreshOnActivate = false; void loadOverview(); } });
/* 同步按块落库，一条流会连续发好几次「有新数据」。同一条流在一小段时间里只读
   一次库：第一次事件排上，这段时间里的后续事件都并进这次读取（读的时候它们
   都已经落库了）。 */
const STREAM_REFRESH_COALESCE_MS = 250;
const pendingStreamRefresh = new Map<string, number>();
watch(streamUpdate, update => {
  const stream = update.stream;
  if (!stream || pendingStreamRefresh.has(stream)) return;
  pendingStreamRefresh.set(stream, window.setTimeout(() => {
    pendingStreamRefresh.delete(stream);
    void refreshStream(stream);
  }, STREAM_REFRESH_COALESCE_MS));
});
onBeforeUnmount(() => {
  for (const timer of pendingStreamRefresh.values()) window.clearTimeout(timer);
  pendingStreamRefresh.clear();
});

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
      <div class="overview-title">
        <h1 id="overview-title">{{ t.overviewTitle }}</h1>
        <p class="overview-date">{{ todayLabel }}</p>
      </div>
      <!-- 取餐胶囊：同步在跑时报进度，用户等的那次同步落地后发光喊「交给 AI」。 -->
      <DataReadyCapsule />
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
      <em>{{ t.unrecognizedCta }} <GlyphTile name="chevron-right" :size="16" /></em>
    </RouterLink>

    <!--
      同步跑通却一条记录都没有，最先看到的是这一页。上面每个面板各自说一句
      「暂无数据」，谁也不解释为什么——而原因往往是登录时没确认对区域。
    -->
    <CoverageNotice />
    <OfficialOnlyNote />

    <div v-if="partialWarning" class="inline-alert warning" role="status"><Icon name="info" :size="15" />{{ partialWarning }}</div>
    <div v-if="deviceError" class="inline-alert warning" role="status"><Icon name="info" :size="15" />{{ t.deviceErrorPrefix }}{{ deviceError }}</div>

    <!-- 用户自己固定的 3–4 个指标排在最上面：顺序由用户定，概览不替所有人排（评审 U10）。 -->
    <PinnedMetrics />
    <!-- 「这一周」的事实摘要放进第一屏（体验评估 #3）：完整周报仍在下面。 -->
    <WeekDigest />

    <div v-if="loading && !overview && !heartRateSeries.length && !recentSleep.length" class="overview-skeleton" aria-live="polite" :aria-label="t.loadingAria">
      <div class="skeleton-grid"><SkeletonBlock v-for="index in 6" :key="index" height="188px" /></div>
    </div>
    <div v-else-if="error && !overview && !heartRateSeries.length && !recentSleep.length" class="empty-wrap">
      <div class="empty-state" role="alert"><GlyphTile name="cloud-output" :size="72" /><strong>{{ t.loadFailedTitle }}</strong><span>{{ error }}</span><button class="button button-secondary" type="button" @click="loadOverview">{{ t.retry }}</button></div>
    </div>

    <div v-else class="dashboard-grid">
      <!-- 心率卡的格子由外壳持有：卡片是异步 chunk，骨架与本体占同一个格子。 -->
      <div class="hr-card-slot">
        <HeartRateCard v-tilt :points="heartRateSeries" :current-hr="overview?.current_hr ?? null" :latest-at="overview?.latest_heart_rate_at ?? null" />
      </div>
      <StepsCard v-tilt :steps="stepsToday" :goal="overview?.steps_goal ?? null" :latest-at="overview?.latest_heart_rate_at ?? null" />
      <SleepCard v-tilt :sleep="lastSleep" />
      <RecentCard v-tilt :sleep="recentSleep" :workouts="recentWorkouts" />
    </div>

    <!-- 四张主卡下面接着摊开这一周、身体、训练、生活事件、数据来源，不收起来。 -->
    <OverviewMore
      :body="{ ...bodyEntry, caption: bodyEntry.measured ? t.bodyThin : t.bodyEmpty }"
      :training="{ ...trainingEntry, caption: trainingEntry.measured ? t.trainingThin : t.trainingEmpty }"
      :body-title="t.bodyTitle" :training-title="t.trainingTitle"
      :body-aria="t.bodyPanelAria" :training-aria="t.trainingPanelAria"
    />
  </section>
</template>

<style scoped>
.overview-page { display: grid; gap: 18px; align-content: start; max-width: 1540px; margin: 0 auto; }
/* 页头行固定高度：取餐胶囊出现、消失都在这一行里，不推动下面的内容。
   窄了取餐胶囊换到下一行，标题和日期不被挤成两截。 */
.overview-header { flex-wrap: wrap; min-height: 58px; align-items: center; margin-bottom: 0; }
.overview-header h1 { margin-bottom: 0; }
.overview-title { display: grid; gap: 2px; }
.overview-date { margin: 0; color: var(--subtle); font-size: var(--fs-sm); white-space: nowrap; }

.inline-alert { display: flex; align-items: center; gap: 8px; padding: 9px 13px; border: 1px solid var(--mat-line); border-radius: 12px; background: var(--mat-card); color: var(--muted); font-size: var(--fs-sm); box-shadow: var(--mat-rim), var(--mat-shadow); }
.inline-alert.warning { color: var(--warning); }
.overview-skeleton { display: grid; gap: 16px; }
.skeleton-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 16px; }
.empty-wrap { display: grid; min-height: 300px; place-items: center; }
.empty-state { display: grid; max-width: 360px; justify-items: center; gap: 9px; padding: 32px; color: var(--muted); text-align: center; }
.empty-state strong { color: var(--ink); font-size: var(--fs-2xl); }
/* 主卡的排布按这一页自己的宽度走（容器查询），不按窗口宽度：界面缩放、窗口无级拖动时
   档位都跟着真实可用的宽度变。以前各张卡各写各的媒体查询，断点对不上——1000px 宽时
   心率占 8 格、步数 4 格，睡眠被挤到下一行只剩 3 格，标题都折成两行。
     宽：心率 6 + 步数 3 + 睡眠 3 一行；
     中：心率占满一行，步数和睡眠对半；
     窄：一张一行。
   最近记录永远占满一行。 */
.dashboard-grid { display: grid; grid-template-columns: repeat(12, minmax(0, 1fr)); gap: 16px; container-type: inline-size; }
.dashboard-grid > * { min-width: 0; }
/* 异步心率卡的网格位置由这个外壳占位：骨架和加载完成的卡片落在同一个格子里。 */
.hr-card-slot { grid-column: span 6; }
.dashboard-grid > .steps-panel, .dashboard-grid > .sleep-panel { grid-column: span 3; }
.dashboard-grid > .recent-panel { grid-column: 1 / -1; }
@container (max-width: 1080px) {
  .hr-card-slot { grid-column: 1 / -1; }
  .dashboard-grid > .steps-panel, .dashboard-grid > .sleep-panel { grid-column: span 6; }
}
@container (max-width: 540px) {
  .hr-card-slot, .dashboard-grid > .steps-panel, .dashboard-grid > .sleep-panel { grid-column: 1 / -1; }
}

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
  .skeleton-grid { grid-template-columns: minmax(0, 1fr); }
}
</style>
