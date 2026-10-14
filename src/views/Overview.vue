<script setup lang="ts">

defineOptions({ name: 'Overview' });
import { computed, onActivated, onBeforeUnmount, onDeactivated, onMounted, ref, watch, type Component } from 'vue';
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
import StepsCard from '../components/overview/StepsCard.vue';
import StatusEntryCard, { type EntryFact } from '../components/overview/StatusEntryCard.vue';
import SegmentTrack from '../components/SegmentTrack.vue';
import OverviewMore from '../components/overview/OverviewMore.vue';
import PinnedMetrics from '../components/overview/PinnedMetrics.vue';
import '../components/overview/panels.css';
import { useDevices } from '../composables/useDevices';
import { useSyncController } from '../composables/useSyncController';
import { useRevisionReload } from '../composables/useRevisionReload';
import { useFocusAreas, focusChoiceItems } from '../composables/useFocusAreas';
import { today as currentToday } from '../lib/currentDay';
import { backend, isDesktop, toUserMessage } from '../lib/bridge';
import { createLoadSeq } from '../lib/loadSeq';
import { holdInPlace } from '../lib/motion/holdInPlace';
import { indexSeries, latestValue } from '../lib/metricSeries';
import { metricColor } from '../lib/metricTone';
import { vTilt } from '../lib/tilt';
import { formatMetric, isFiniteNumber } from '../lib/format';
import { displayDateTimeFormatter } from '../lib/dateTime';
import { focusSplit, type FocusChoice, type FocusModule } from '../lib/focusAreas';
import { trainingLoadTierText } from '../lib/trainingLoadTier';
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
    factReadiness: '准备度',
    factStress: '压力',
    factSpo2: '血氧',
    bodyEmpty: '同步后展示准备度、压力与血氧',
    trainingPanelAria: '打开训练状态',
    trainingTitle: '训练状态',
    factLoad: '负荷',
    entryWeek: '近 7 天',
    focusLabel: '我关注',
    trainingThin: '近 7 天记录不足以画出趋势',
    trainingEmpty: '同步后展示 VO₂max 与训练负荷',
    focusQuestion: '你最关注什么？',
    focusDone: '好了',
    focusSkip: '跳过',
    showAllModules: '查看全部',
    collapseModules: '收起',
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
    factReadiness: 'Readiness',
    factStress: 'Stress',
    factSpo2: 'SpO2',
    bodyEmpty: 'Readiness, stress and SpO2 appear after a sync',
    trainingPanelAria: 'Open training status',
    trainingTitle: 'Training status',
    factLoad: 'Load',
    entryWeek: 'Last 7 days',
    focusLabel: 'I care about',
    trainingThin: 'Too few records in the last 7 days for a trend',
    trainingEmpty: 'VO₂max and training load appear after a sync',
    focusQuestion: 'What do you care about most?',
    focusDone: 'Done',
    focusSkip: 'Skip',
    showAllModules: 'Show all',
    collapseModules: 'Collapse',
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
    factReadiness: 'Recuperación',
    factStress: 'Estrés',
    factSpo2: 'SpO₂',
    bodyEmpty: 'La recuperación, el estrés y el oxígeno en sangre aparecen aquí después de sincronizar',
    trainingPanelAria: 'Abrir el estado de entrenamiento',
    trainingTitle: 'Estado de entrenamiento',
    factLoad: 'Carga',
    entryWeek: 'Últimos 7 días',
    focusLabel: 'Me interesa',
    trainingThin: 'No hay suficientes registros en los últimos 7 días para trazar una tendencia',
    trainingEmpty: 'El VO₂máx y la carga de entrenamiento aparecen aquí después de sincronizar',
    focusQuestion: '¿Qué es lo que más te interesa?',
    focusDone: 'Listo',
    focusSkip: 'Omitir',
    showAllModules: 'Mostrar todo',
    collapseModules: 'Reducir',
  },
  'views/Overview',
);
const t = useMessages(messages);

const { streamUpdate } = useSyncController();
/** 页头标题下面一行今天的日期（按界面语言），标题不再孤零零地占一整行。 */
const todayLabel = computed(() => displayDateTimeFormatter({ month: 'long', day: 'numeric', weekday: 'long' }).format(currentToday()));
const { models: deviceModels, error: deviceError, load: loadDevices, reloadAfterDataChange } = useDevices();

const overview = ref<HealthOverview | null>(null);
const heartRateSeries = ref<HeartRatePoint[]>([]);
const recentSleep = ref<SleepSession[]>([]);
const recentWorkouts = ref<Workout[]>([]);
const statusSeries = ref<Record<string, MetricSeries>>({});
const loading = ref(true);
const error = ref<string | null>(null);
const partialWarning = ref<string | null>(null);
const loadSeq = createLoadSeq();
/** 还什么都没有：首次加载显示骨架，失败显示空态。骨架换成内容时交叉淡化（模板里的 skeleton-out）。 */
const nothingYet = computed(() => !overview.value && !heartRateSeries.value.length && !recentSleep.value.length);
const showSkeleton = computed(() => loading.value && nothingYet.value);
const showLoadError = computed(() => !showSkeleton.value && Boolean(error.value) && nothingYet.value);

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

const trainingLoad = computed(() => isFiniteNumber(overview.value?.training_load) ? overview.value.training_load : null);
const loadBand = computed(() => trainingLoadTierText(trainingLoad.value, overview.value?.training_load_scale));

/**
 * The two entry cards.
 *
 * Each shows today's figures and a seven-day shape, and nothing more: the
 * reading of those numbers belongs on the page behind the card, and the
 * interpreting of them belongs to the AI the user chooses.
 */
const ENTRY_METRICS = ['readiness', 'stress', 'spo2', 'vo2max', 'training_load', 'steps'];

const seriesValues = (metric: string): number[] =>
  (statusSeries.value[metric]?.points ?? []).map((point) => point.value);

/* 拿不到值就返回 null，让这一项整个消失。
   一排「血氧 —」「VO₂max —」既没告诉用户任何事，又把有数的那几项挤窄了。
   每一项带上自己近 7 天的形状：卡片下半截不再空着，线和数字也一一对得上。 */
const entryFact = (metric: string, label: string, unit = '', digits = 0): EntryFact | null => {
  const value = latestValue(statusSeries.value[metric]);
  return value === null
    ? null
    : { key: metric, label, text: formatMetric(value, digits), unit, spark: seriesValues(metric), color: metricColor(metric) };
};
const present = (facts: (EntryFact | null)[]): EntryFact[] => facts.filter((fact): fact is EntryFact => fact !== null);
const hasDays = (...metrics: string[]) => metrics.some((metric) => statusSeries.value[metric]?.days_with_data);

const bodyEntry = computed(() => ({
  facts: present([
    entryFact('readiness', t.value.factReadiness),
    entryFact('stress', t.value.factStress),
    entryFact('spo2', t.value.factSpo2, '%'),
  ]),
  caption: hasDays('readiness', 'stress', 'spo2') ? t.value.entryWeek : t.value.bodyEmpty,
}));

const trainingEntry = computed(() => {
  const vo2 = entryFact('vo2max', 'VO₂max', '', 1);
  const load: EntryFact | null = trainingLoad.value === null ? null : {
    key: 'training_load',
    label: t.value.factLoad,
    text: formatMetric(trainingLoad.value),
    tag: loadBand.value || null,
    spark: seriesValues('training_load'),
    color: metricColor('training_load'),
  };
  const facts = present([vo2, load]);
  const thin = facts.every((fact) => (fact.spark?.length ?? 0) < 2);
  return {
    facts,
    caption: !hasDays('training_load', 'vo2max') ? t.value.trainingEmpty : thin ? t.value.trainingThin : t.value.entryWeek,
  };
});
const stepsWeek = computed(() => statusSeries.value.steps?.points ?? []);

/* 「我关注」：选中的区块把对应模块排到最上面，其余收在「查看全部」后面；
   一个没选（或三个全选）时页面就是原样。跨区块的模块（最近记录、这一周、
   生活事件、数据来源）不属于任何一个区块，不参与排序。 */
const { areas: focusAreas, asked: focusAsked, choice: focusChoice, setChoice: setFocusChoice, skipPrompt: skipFocusPrompt } = useFocusAreas();
const showAllModules = ref(false);
const focusSplitView = computed(() => focusSplit(focusAreas.value));
const focusMode = computed(() => focusSplitView.value !== null);
const focusCells = computed(() => {
  const split = focusSplitView.value;
  if (!split) return null;
  const ids = showAllModules.value ? [...split.matched, ...split.folded] : split.matched;
  return ids.map((id): { id: FocusModule; component: Component; props: Record<string, unknown> } => {
    switch (id) {
      case 'heart': return {
        id, component: HeartRateCard,
        props: { points: heartRateSeries.value, currentHr: overview.value?.current_hr ?? null, latestAt: overview.value?.latest_heart_rate_at ?? null },
      };
      case 'steps': return {
        id, component: StepsCard,
        props: { steps: stepsToday.value, goal: overview.value?.steps_goal ?? null, latestAt: overview.value?.latest_heart_rate_at ?? null, week: stepsWeek.value },
      };
      case 'sleep': return { id, component: SleepCard, props: { sleep: lastSleep.value } };
      case 'body': return {
        id, component: StatusEntryCard,
        props: { to: '/body', tone: 'body', icon: 'recovery', title: t.value.bodyTitle, 'aria-label': t.value.bodyPanelAria, facts: bodyEntry.value.facts, caption: bodyEntry.value.caption },
      };
      default: return {
        id: 'training', component: StatusEntryCard,
        props: {
          to: '/training', tone: 'training', icon: 'training-load', title: t.value.trainingTitle, 'aria-label': t.value.trainingPanelAria,
          facts: trainingEntry.value.facts, caption: trainingEntry.value.caption,
        },
      };
    }
  });
});

/* 首次提问：还没答过、又已经连上并读出概览时，页面顶上问一次「你最关注什么」。
   回答过或跳过就再也不出现（记在 localStorage，和选择本身同一处）。 */
const focusPromptOpen = computed(() => !focusAsked.value && overview.value !== null && !showLoadError.value);
const draftChoice = ref<FocusChoice>('all');

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
useRevisionReload(() => { void loadOverview(); void reloadAfterDataChange(); });
</script>

<template>
  <section class="page overview-page" aria-labelledby="overview-title">
    <header class="page-header overview-header">
      <div class="overview-title">
        <h1 id="overview-title">{{ t.overviewTitle }}</h1>
        <p class="overview-date">{{ todayLabel }}</p>
      </div>
      <!-- 「我关注」随时在这里改：以前只在首次提问里问一次，答过以后只能去设置里找。 -->
      <div v-if="!focusPromptOpen" class="overview-focus">
        <span class="overview-focus-label">{{ t.focusLabel }}</span>
        <SegmentTrack :model-value="focusChoice" :items="focusChoiceItems" :aria-label="t.focusLabel" compact no-wrap @update:model-value="setFocusChoice" />
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
      <em>{{ t.unrecognizedCta }} <GlyphTile name="chevron-right" :size="16" /></em>
    </RouterLink>

    <!-- 首次提问：只有第一次连上并读出数据后问一遍，答过或跳过就再也不出现。 -->
    <div v-if="focusPromptOpen" class="focus-prompt" role="note">
      <span class="focus-ask">{{ t.focusQuestion }}</span>
      <SegmentTrack v-model="draftChoice" :items="focusChoiceItems" :aria-label="t.focusQuestion" compact />
      <span class="focus-actions">
        <button type="button" class="pill-button" @click="setFocusChoice(draftChoice)">{{ t.focusDone }}</button>
        <button type="button" class="pill-button quiet" @click="skipFocusPrompt">{{ t.focusSkip }}</button>
      </span>
    </div>

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

    <Transition name="skeleton-out" @before-leave="holdInPlace">
      <div v-if="showSkeleton" class="overview-skeleton" aria-live="polite" :aria-label="t.loadingAria">
        <div class="skeleton-grid"><SkeletonBlock v-for="index in 6" :key="index" height="188px" /></div>
      </div>
    </Transition>
    <div v-if="showLoadError" class="empty-wrap">
      <div class="empty-state" role="alert"><GlyphTile name="cloud-output" :size="72" /><strong>{{ t.loadFailedTitle }}</strong><span>{{ error }}</span><button class="button button-secondary" type="button" @click="loadOverview">{{ t.retry }}</button></div>
    </div>

    <!-- 「我关注」选了区块时，选中的模块排到最上面、每张占半行；其余收在下面那枚胶囊后面。
         一个没选时整块走原路：和原来一模一样，不给一套没人要的伪布局。 -->
    <div v-if="!showSkeleton && !showLoadError" :class="['dashboard-grid', { 'is-focus': focusMode }]">
      <template v-if="!focusMode">
        <!-- 心率卡的格子由外壳持有：卡片是异步 chunk，骨架与本体占同一个格子。 -->
        <div class="hr-card-slot">
          <HeartRateCard v-tilt :points="heartRateSeries" :current-hr="overview?.current_hr ?? null" :latest-at="overview?.latest_heart_rate_at ?? null" />
        </div>
        <StepsCard v-tilt :steps="stepsToday" :goal="overview?.steps_goal ?? null" :latest-at="overview?.latest_heart_rate_at ?? null" :week="stepsWeek" />
        <SleepCard v-tilt :sleep="lastSleep" />
      </template>
      <template v-else>
        <div
          v-for="(cell, index) in focusCells"
          :key="cell.id"
          :class="['focus-cell', { 'is-wide': (focusCells?.length ?? 0) % 2 === 1 && index === (focusCells?.length ?? 0) - 1 }]"
        >
          <component :is="cell.component" v-bind="cell.props" v-tilt />
        </div>
      </template>
      <RecentCard v-tilt :sleep="recentSleep" :workouts="recentWorkouts" />
    </div>

    <!-- 收起来的模块都在这枚胶囊后面：不是删掉，一键摊回来；摊开后再收回去。 -->
    <div v-if="focusMode" class="fold-row">
      <button type="button" class="pill-button quiet" @click="showAllModules = !showAllModules">
        {{ showAllModules ? t.collapseModules : t.showAllModules }}
      </button>
    </div>

    <!-- 四张主卡下面接着摊开这一周、身体、训练、生活事件、数据来源，不收起来；选了
         「我关注」时身体 / 训练两张入口卡已经排进上面的格子里，这里不再摆第二份。 -->
    <OverviewMore
      :body="bodyEntry"
      :training="trainingEntry"
      :body-title="t.bodyTitle" :training-title="t.trainingTitle"
      :body-aria="t.bodyPanelAria" :training-aria="t.trainingPanelAria"
      :show-entries="!focusMode"
    />
  </section>
</template>

<style scoped>
.overview-page { display: grid; gap: 18px; align-content: start; max-width: 1540px; margin: 0 auto; }
.overview-header { flex-wrap: wrap; min-height: 58px; align-items: center; margin-bottom: 0; }
.overview-header h1 { margin-bottom: 0; }
.overview-title { display: grid; gap: 2px; }
.overview-date { margin: 0; color: var(--subtle); font-size: var(--fs-sm); white-space: nowrap; }

/* 页面级的提示条：细线描边、无底无投影。卡片材质只给主信息区，一条提示
   抬着一块卡板的厚度，会把视线从上面的卡上抢走。 */
.inline-alert { display: flex; align-items: center; gap: 8px; padding: 9px 13px; border: 1px solid var(--mat-line); border-radius: 12px; color: var(--muted); font-size: var(--fs-sm); }
.inline-alert.warning { color: var(--warning); }

/* 首次提问「你最关注什么？」：页面级的一行，不是卡中卡——同样的细线描边、
   无底无投影。选择用和设置里同一条玻璃滑块。 */
.focus-prompt { display: flex; flex-wrap: wrap; align-items: center; gap: 8px 12px; padding: 10px 14px; border: 1px solid var(--mat-line); border-radius: var(--radius-md); color: var(--muted); font-size: var(--fs-sm); }
.focus-ask { color: var(--ink); font-weight: 600; }
.overview-focus { display: inline-flex; align-items: center; gap: 10px; margin-left: auto; min-width: 0; }
.overview-focus-label { color: var(--subtle); font-size: var(--fs-xs); font-weight: 600; white-space: nowrap; }
.focus-actions { display: inline-flex; gap: 8px; margin-left: auto; }
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
/* 「我关注」筛过之后每张卡占半行；只剩一张时占满整行，半行空着比硬撑宽更难看。
   入口卡在原布局里本来就是对半的两张，挪进格子只是同一个宽度。 */
.dashboard-grid.is-focus .focus-cell { display: grid; grid-column: span 6; }
.dashboard-grid.is-focus .focus-cell.is-wide { grid-column: 1 / -1; }
@container (max-width: 540px) {
  .dashboard-grid.is-focus .focus-cell, .dashboard-grid.is-focus .focus-cell.is-wide { grid-column: 1 / -1; }
}

/* 「查看全部 / 收起」：次要动作一律胶囊按钮（quiet 这一档不带底），排在格子的下沿。 */
.fold-row { display: flex; }
.fold-row .pill-button { justify-self: start; }

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
