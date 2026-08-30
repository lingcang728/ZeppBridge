<script setup lang="ts">
defineOptions({ name: 'Overview' });
import { computed, onMounted, ref, watch } from 'vue';
import { RouterLink } from 'vue-router';
import { graphic } from 'echarts/core';
import { VChart } from '../lib/echartsSetup';
import CircularProgress from '../components/CircularProgress.vue';
import DesignIcon, { type DesignIconName } from '../components/DesignIcon.vue';
import DeviceVisual from '../components/DeviceVisual.vue';
import Icon from '../components/Icon.vue';
import RecordRow from '../components/RecordRow.vue';
import SkeletonBlock from '../components/SkeletonBlock.vue';
import WeeklyReportCard from '../components/WeeklyReportCard.vue';
import Sparkline from '../components/Sparkline.vue';
import { useDevices } from '../composables/useDevices';
import { useSyncController } from '../composables/useSyncController';
import { AI_PROVIDERS } from '../lib/aiProviders';
import { backend, isDesktop, toUserMessage } from '../lib/bridge';
import { formatDeviceIntro } from '../lib/deviceCopy';
import { zeppSemanticColors } from '../lib/echartsTheme';
import { indexSeries, latestValue } from '../lib/metricSeries';
import { formatDistance, formatDuration, formatMetric, formatTime, isFiniteNumber, type HealthCategory } from '../lib/format';
import { displayableWorkouts, workoutDisplayLabel, workoutDurationMinutes, workoutTypeKey } from '../lib/workouts';
import type { HealthOverview, HeartRatePoint, MetricSeries, SleepSession, Workout } from '../types';
import { sleepStageLabel } from '../lib/sleepStages';
import { defineMessages, intlLocale, useMessages } from '../i18n';

const messages = defineMessages(
  {
    heroTitleLine1: '你的穿戴数据，',
    heroTitleLine2: '已准备好交给 AI',
    valueSecure: '安全',
    valueSecureSub: '数据留在本机',
    valuePrivate: '私密',
    valuePrivateSub: '不上传原始记录',
    valueAiReady: 'AI-ready',
    valueAiReadySub: '结构化再交付',
    heroVisualAria: '已识别设备的数据汇入云端 AI',
    aiNodeAria: '交接给云端 AI：ChatGPT、豆包、DeepSeek',
    cloudAi: '云端 AI',
    unrecognizedSuffix: ' 还没有识别出型号',
    unrecognizedCta: '点这里手动指认',
    deviceErrorPrefix: '设备识别：',
    loadingAria: '正在加载概览',
    loadFailedTitle: '无法读取数据概览',
    retry: '重试',
    healthUnavailable: '健康数据暂时不可用',
    partialUnavailable: '部分数据流尚未获取',
    hrPanelAria: '打开心率详情，查看完整 24 小时',
    hrTitle: '最近心率',
    hrWindow: (hours: number) => `最近 ${hours} 小时`,
    latest: '最新',
    bpm: '次/分',
    hrChartAria: '24 小时心率曲线',
    hrZonesAria: '心率区间（绝对阈值）',
    hrEmpty: '同步后展示真实的心率波动。',
    hrMore: '完整 24 小时',
    hrTooltip: (clock: string, value: number) => `${clock}　<b>${value}</b> 次/分`,
    zoneRest: '休息 0–99',
    zoneFat: '燃脂 100–139',
    zoneAerobic: '有氧 140–169',
    zoneAnaerobic: '无氧 170+',
    stepsPanelAria: '打开日常活动详情',
    stepsTitle: '今日步数',
    stepsGoalReference: '参考目标',
    stepsGoalToday: '今日目标',
    stepsUnit: '步',
    stepsGoalLine: (goal: string, percent: number) => `目标 ${goal} · ${percent}%`,
    seeMore: '看更多',
    sleepPanelAria: '打开睡眠详情',
    sleepTitle: '昨晚睡眠',
    sleepSub: '睡眠结构简介',
    sleepBarAria: '睡眠阶段比例',
    sleepEmpty: '同步后展示昨晚睡眠。',
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
    recentAria: '最近记录',
    recentTitle: '最近记录',
    recentSub: '睡眠、跑步与力量训练',
    seeAll: '查看全部',
    recentEmpty: '暂无记录，完成一次同步后展示。',
    sleepRecordTitle: '睡眠',
    sleepScore: (score: number) => `睡眠评分 ${score}`,
    avgHr: (value: number) => `均心率 ${value}`,
    timeUnknown: '时间未知',
    durationHours: (hours: number, minutes: number) => `${hours} 小时 ${minutes} 分`,
    durationMinutes: (minutes: number) => `${minutes} 分`,
    loadLow: '偏低',
    loadMedium: '中等',
    loadHigh: '较高',
    loadVeryHigh: '很高',
  },
  {
    heroTitleLine1: 'Your wearable data,',
    heroTitleLine2: 'ready to hand to an AI',
    valueSecure: 'Secure',
    valueSecureSub: 'Data stays on this machine',
    valuePrivate: 'Private',
    valuePrivateSub: 'Raw records are never uploaded',
    valueAiReady: 'AI-ready',
    valueAiReadySub: 'Structured before it leaves',
    heroVisualAria: 'Data from recognized devices flowing to a cloud AI',
    aiNodeAria: 'Hand-off to a cloud AI: ChatGPT, Doubao, DeepSeek',
    cloudAi: 'Cloud AI',
    unrecognizedSuffix: ' has no model identified yet',
    unrecognizedCta: 'Pick it by hand',
    deviceErrorPrefix: 'Device identification: ',
    loadingAria: 'Loading the overview',
    loadFailedTitle: 'Could not read the data overview',
    retry: 'Try again',
    healthUnavailable: 'Health data is unavailable right now',
    partialUnavailable: 'Some data streams have not been fetched yet',
    hrPanelAria: 'Open heart rate detail for the full 24 hours',
    hrTitle: 'Recent heart rate',
    hrWindow: (hours: number) => `Last ${hours} hours`,
    latest: 'Latest',
    bpm: 'bpm',
    hrChartAria: '24-hour heart rate curve',
    hrZonesAria: 'Heart rate zones (absolute thresholds)',
    hrEmpty: 'Real heart rate movement shows up here after a sync.',
    hrMore: 'Full 24 hours',
    hrTooltip: (clock: string, value: number) => `${clock}　<b>${value}</b> bpm`,
    zoneRest: 'Rest 0–99',
    zoneFat: 'Fat burn 100–139',
    zoneAerobic: 'Aerobic 140–169',
    zoneAnaerobic: 'Anaerobic 170+',
    stepsPanelAria: 'Open daily activity detail',
    stepsTitle: "Today's steps",
    stepsGoalReference: 'Reference goal',
    stepsGoalToday: "Today's goal",
    stepsUnit: 'steps',
    stepsGoalLine: (goal: string, percent: number) => `Goal ${goal} · ${percent}%`,
    seeMore: 'See more',
    sleepPanelAria: 'Open sleep detail',
    sleepTitle: 'Last night',
    sleepSub: 'Sleep structure at a glance',
    sleepBarAria: 'Sleep stage share',
    sleepEmpty: "Last night's sleep shows up here after a sync.",
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
    recentAria: 'Recent records',
    recentTitle: 'Recent records',
    recentSub: 'Sleep, runs and strength work',
    seeAll: 'See all',
    recentEmpty: 'Nothing recorded yet. Run a sync and it shows up here.',
    sleepRecordTitle: 'Sleep',
    sleepScore: (score: number) => `Sleep score ${score}`,
    avgHr: (value: number) => `Avg HR ${value}`,
    timeUnknown: 'Time unknown',
    durationHours: (hours: number, minutes: number) => `${hours} hr ${minutes} min`,
    durationMinutes: (minutes: number) => `${minutes} min`,
    loadLow: 'low',
    loadMedium: 'moderate',
    loadHigh: 'high',
    loadVeryHigh: 'very high',
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

const num = (value: unknown) => isFiniteNumber(value) ? formatMetric(value) : '—';
const hm = (minutes?: number | null) => {
  if (!isFiniteNumber(minutes) || minutes < 0) return '—';
  const total = Math.round(minutes);
  const hours = Math.floor(total / 60);
  const remainder = total % 60;
  return hours > 0 ? t.value.durationHours(hours, remainder) : t.value.durationMinutes(remainder);
};

const heroRoster = computed(() => {
  const sorted = [...deviceModels.value].sort((left, right) => {
    const leftTime = Date.parse(left.profile.last_data_at || '') || 0;
    const rightTime = Date.parse(right.profile.last_data_at || '') || 0;
    if (rightTime !== leftTime) return rightTime - leftTime;
    return left.canonicalName.localeCompare(right.canonicalName);
  });
  return {
    shown: sorted.slice(0, 2).map((model) => ({
      key: model.profile.device_id || model.canonicalName,
      name: model.canonicalName,
      image: model.image,
      kind: model.kind,
    })),
    extra: Math.max(0, sorted.length - 2),
    intro: formatDeviceIntro(sorted.map((model) => model.canonicalName)),
  };
});
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

const heroAiProviders = AI_PROVIDERS.filter((provider) => (
  provider.id === 'chatgpt' || provider.id === 'doubao' || provider.id === 'deepseek'
));

/**
 * 首页这张卡只画**最近几个小时**。
 *
 * 把整整 24 小时压进一张小卡，几百个点挤在两百来像素里，看到的是一团锯齿，
 * 既看不出「刚才怎么样」，也看不出趋势。完整的 24 小时留给心率二级页，那里
 * 有足够的宽度。
 */
const OVERVIEW_HR_WINDOW_HOURS = 5;
/** 超过这个间隔就断线。没有采样的时段不画线，不用一根直线把两头连起来。 */
const HR_GAP_BREAK_MINUTES = 15;

const allHrPoints = computed(() => heartRateSeries.value
  .map((point) => ({ ts: new Date(point.timestamp).getTime(), value: point.value }))
  .filter((point) => Number.isFinite(point.ts) && isFiniteNumber(point.value)));

const hrPoints = computed(() => {
  const points = allHrPoints.value;
  const newest = points[points.length - 1]?.ts;
  if (!newest) return points;
  const cutoff = newest - OVERVIEW_HR_WINDOW_HOURS * 3_600_000;
  return points.filter((point) => point.ts >= cutoff);
});
const hrLatest = computed(() => {
  if (isFiniteNumber(overview.value?.current_hr)) return overview.value.current_hr;
  return hrPoints.value[hrPoints.value.length - 1]?.value ?? null;
});
const HR_ZONES = computed(() => [
  { key: 'rest', label: t.value.zoneRest, from: 0, to: 99, color: 'rgba(120,129,140,.10)' },
  { key: 'fat', label: t.value.zoneFat, from: 100, to: 139, color: 'rgba(245,195,59,.12)' },
  { key: 'aero', label: t.value.zoneAerobic, from: 140, to: 169, color: 'rgba(74,168,232,.12)' },
  { key: 'an', label: t.value.zoneAnaerobic, from: 170, to: 240, color: 'rgba(240,97,106,.12)' },
]);
const hrAverage = computed(() => {
  if (!hrPoints.value.length) return null;
  const sum = hrPoints.value.reduce((total, point) => total + point.value, 0);
  return Math.round(sum / hrPoints.value.length);
});
const hrChartOption = computed(() => {
  // 采样断档处插一个 null，让线断开而不是被直线连起来。
  const points = hrPoints.value;
  const data: Array<[number, number] | [number, null]> = [];
  points.forEach((point, index) => {
    const previous = points[index - 1];
    if (previous && point.ts - previous.ts > HR_GAP_BREAK_MINUTES * 60_000) {
      data.push([previous.ts + 1, null]);
    }
    data.push([point.ts, point.value]);
  });
  const last = data[data.length - 1];
  const clock = (value: number) => new Intl.DateTimeFormat(intlLocale(), { hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(value));
  return {
    animationDuration: 900,
    animationEasing: 'cubicOut' as const,
    grid: { left: 36, right: 16, top: 14, bottom: 24 },
    tooltip: {
      trigger: 'axis',
      backgroundColor: '#22261A',
      borderColor: 'rgba(228, 235, 208, 0.16)',
      borderWidth: 1,
      padding: [8, 12],
      textStyle: { color: '#F3F4EC', fontSize: 12 },
      extraCssText: 'border-radius:8px;box-shadow:none;',
      formatter: (params: Array<{ value: [number, number] }>) => {
        const point = Array.isArray(params) ? params[0] : params;
        if (!point) return '';
        return t.value.hrTooltip(clock(point.value[0]), Math.round(point.value[1]));
      },
    },
    xAxis: {
      type: 'time', min: data[0]?.[0], max: last?.[0],
      axisLabel: { formatter: clock, hideOverlap: true, color: '#78818C', fontSize: 10 },
      axisLine: { lineStyle: { color: 'rgba(232,238,244,.12)' } }, axisTick: { show: false }, splitLine: { show: false },
    },
    yAxis: {
      type: 'value', scale: true, splitNumber: 3, min: 40,
      axisLabel: { color: '#78818C', fontSize: 10 }, axisLine: { show: false }, axisTick: { show: false },
      splitLine: { lineStyle: { color: 'rgba(232,238,244,.08)', type: 'dashed' } },
    },
    series: [{
      type: 'line', data, smooth: .18, showSymbol: false,
      lineStyle: { width: 2, color: '#F0616A', cap: 'round' },
      areaStyle: { color: new graphic.LinearGradient(0, 0, 0, 1, [
        { offset: 0, color: 'rgba(240,97,106,.22)' },
        { offset: 1, color: 'rgba(24,28,34,0)' },
      ]) },
      markLine: hrAverage.value === null ? undefined : {
        silent: true,
        symbol: 'none',
        lineStyle: { type: 'dashed', color: 'rgba(243,244,236,.35)', width: 1.1 },
        label: { show: false },
        data: [{ yAxis: hrAverage.value }],
      },
    }, {
      type: 'line', data: last ? [last] : [], symbol: 'circle', symbolSize: 7,
      itemStyle: { color: '#F0616A', borderColor: '#F7FAF3', borderWidth: 2 }, lineStyle: { opacity: 0 }, tooltip: { show: false }, z: 5,
    }],
  };
});

const DEFAULT_STEP_GOAL = 10000;
const stepGoal = computed(() => {
  const goal = overview.value?.steps_goal;
  return isFiniteNumber(goal) && goal > 0 ? goal : DEFAULT_STEP_GOAL;
});
const stepGoalIsReference = computed(() => !(isFiniteNumber(overview.value?.steps_goal) && (overview.value?.steps_goal ?? 0) > 0));
const stepsToday = computed(() => isFiniteNumber(overview.value?.steps_today) ? overview.value.steps_today : null);
const stepsPercent = computed(() => stepsToday.value === null ? 0 : Math.min(100, Math.round((stepsToday.value / stepGoal.value) * 100)));
const lastSleep = computed(() => recentSleep.value[0] ?? null);
const sleepStages = computed(() => {
  const sleep = lastSleep.value;
  if (!sleep) return [];
  return [
    { key: 'deep', label: sleepStageLabel('deep'), minutes: sleep.deep_minutes, color: 'var(--sleep-deep)' },
    { key: 'light', label: sleepStageLabel('light'), minutes: sleep.light_minutes, color: 'var(--sleep-light)' },
    { key: 'rem', label: sleepStageLabel('rem'), minutes: sleep.rem_minutes ?? 0, color: 'var(--sleep-rem)' },
    { key: 'awake', label: sleepStageLabel('awake'), minutes: sleep.awake_minutes, color: 'var(--sleep-awake)' },
  ];
});

const DEFAULT_LOAD_SCALE = 600;
const loadScale = computed(() => {
  const scale = overview.value?.training_load_scale;
  return isFiniteNumber(scale) && scale > 0 ? scale : DEFAULT_LOAD_SCALE;
});
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

const bodyEntry = computed(() => ({
  facts: withValues([
    { key: 'readiness', label: t.value.factRecovery, text: entryFigure('readiness', '') },
    { key: 'stress', label: t.value.factStress, text: entryFigure('stress', '') },
    { key: 'spo2', label: t.value.factSpo2, text: entryFigure('spo2', '%') },
  ]),
  spark: seriesValues('readiness'),
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
        : `${formatMetric(trainingLoad.value)}${loadBand.value ? ` ${loadBand.value}` : ''}`,
    },
  ]),
  spark: seriesValues('training_load'),
  sparkLabel: t.value.trainingSparkLabel,
  measured: Boolean(statusSeries.value.training_load?.days_with_data
    || statusSeries.value.vo2max?.days_with_data),
}));

interface RecentItem {
  key: string;
  to: string;
  category: HealthCategory;
  icon: 'moon' | 'run';
  designIcon: DesignIconName;
  time: number;
  kicker: string;
  title: string;
  fact: string;
  factLabel?: string;
}
const shortDateTime = (value: string) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return t.value.timeUnknown;
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  return `${mm}/${dd} ${formatTime(value)}`;
};
const workoutPresentation = (workout: Workout): Pick<RecentItem, 'category' | 'designIcon'> => {
  const key = workoutTypeKey(workout);
  const label = workoutDisplayLabel(workout);
  if (/strength|weight|力量|健身|无氧/.test(`${key} ${label}`.toLowerCase())) return { category: 'heart', designIcon: 'body-activity' };
  if (/cycl|ride|骑行/.test(`${key} ${label}`.toLowerCase())) return { category: 'activity', designIcon: 'outdoor-cycling' };
  return { category: 'activity', designIcon: 'outdoor-run' };
};
const recentItems = computed<RecentItem[]>(() => {
  const items: RecentItem[] = recentSleep.value.map((sleep) => ({
    key: `sleep-${sleep.sleep_id}`, to: `/sleep/${sleep.sleep_id}`, category: 'sleep', icon: 'moon', designIcon: 'sleep',
    time: new Date(sleep.end_time || sleep.start_time).getTime(), kicker: shortDateTime(sleep.start_time), title: t.value.sleepRecordTitle,
    fact: formatDuration(sleep.duration_minutes, '—'), factLabel: isFiniteNumber(sleep.score) ? t.value.sleepScore(sleep.score) : undefined,
  }));
  for (const workout of displayableWorkouts(recentWorkouts.value)) {
    const presentation = workoutPresentation(workout);
    items.push({
      key: `workout-${workout.workout_id}`, to: `/workouts/${workout.workout_id}`, ...presentation, icon: 'run',
      time: new Date(workout.start_time).getTime(), kicker: shortDateTime(workout.start_time), title: workoutDisplayLabel(workout),
      fact: isFiniteNumber(workout.distance_meters) && workout.distance_meters > 0 ? formatDistance(workout.distance_meters) : formatDuration(workoutDurationMinutes(workout), '—'),
      factLabel: isFiniteNumber(workout.avg_hr) ? t.value.avgHr(Math.round(workout.avg_hr)) : undefined,
    });
  }
  return items.sort((a, b) => b.time - a.time).slice(0, 5);
});

const loadOverview = async () => {
  loading.value = true;
  error.value = null;
  partialWarning.value = null;
  if (!isDesktop()) {
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

onMounted(() => { void loadOverview(); void loadDevices(); });
watch(dataRevision, () => { void loadOverview(); void loadDevices(); });
</script>

<template>
  <section class="page overview-page" aria-labelledby="overview-title">
    <header class="hero-card">
      <div class="hero-copy">
        <p class="hero-kicker"><span></span> LOCAL HEALTH DATA BRIDGE</p>
        <h1 id="overview-title">{{ t.heroTitleLine1 }}<br><em>{{ t.heroTitleLine2 }}</em></h1>
        <p class="hero-intro">{{ heroRoster.intro }}</p>
        <ul class="hero-values">
          <li><DesignIcon name="secure" :size="46" /><span><strong>{{ t.valueSecure }}</strong><small>{{ t.valueSecureSub }}</small></span></li>
          <li><DesignIcon name="private" :size="46" /><span><strong>{{ t.valuePrivate }}</strong><small>{{ t.valuePrivateSub }}</small></span></li>
          <li><DesignIcon name="ai-ready" :size="46" /><span><strong>{{ t.valueAiReady }}</strong><small>{{ t.valueAiReadySub }}</small></span></li>
        </ul>
      </div>

      <div class="hero-visual" :aria-label="t.heroVisualAria">
        <div v-if="heroRoster.shown.length" class="device-stack" :class="{ solo: heroRoster.shown.length === 1 }">
          <figure v-for="device in heroRoster.shown" :key="device.key" class="hero-device">
            <span class="device-plinth"><DeviceVisual :src="device.image" :alt="device.name" :kind="device.kind" /></span>
            <figcaption>{{ device.name }}</figcaption>
          </figure>
          <span v-if="heroRoster.extra" class="device-more">+{{ heroRoster.extra }}</span>
        </div>
        <svg v-if="heroRoster.shown.length" class="data-flow" viewBox="0 0 180 88" fill="none" preserveAspectRatio="none" aria-hidden="true">
          <path d="M0 22H142" /><path d="M0 44H142" /><path d="M0 66H142" />
          <path class="arrow" d="m142 17 18 5-18 5z" /><path class="arrow" d="m142 39 18 5-18 5z" /><path class="arrow" d="m142 61 18 5-18 5z" />
        </svg>
        <div class="ai-node" :aria-label="t.aiNodeAria">
          <div class="ai-logos">
            <img v-for="provider in heroAiProviders" :key="provider.id" :src="provider.localIcon" :alt="provider.label" />
          </div>
          <span>{{ t.cloudAi }}</span>
        </div>
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

    <div v-if="partialWarning" class="inline-alert warning" role="status"><Icon name="info" :size="15" />{{ partialWarning }}</div>
    <div v-if="deviceError" class="inline-alert warning" role="status"><Icon name="info" :size="15" />{{ t.deviceErrorPrefix }}{{ deviceError }}</div>

    <div v-if="loading" class="overview-skeleton" aria-live="polite" :aria-label="t.loadingAria">
      <SkeletonBlock height="270px" /><div class="skeleton-grid"><SkeletonBlock v-for="index in 6" :key="index" height="188px" /></div>
    </div>
    <div v-else-if="error" class="empty-wrap">
      <div class="empty-state" role="alert"><DesignIcon name="cloud-output" :size="72" /><strong>{{ t.loadFailedTitle }}</strong><span>{{ error }}</span><button class="button button-secondary" type="button" @click="loadOverview">{{ t.retry }}</button></div>
    </div>

    <div v-else class="dashboard-grid">
      <RouterLink class="metric-panel hr-panel" to="/heart" :aria-label="t.hrPanelAria">
        <div class="panel-head"><span class="panel-title"><span class="chart-icon"><DesignIcon name="heart-rate" :size="34" /></span><span><strong>{{ t.hrTitle }}</strong><small>{{ t.hrWindow(OVERVIEW_HR_WINDOW_HOURS) }}</small></span></span><span class="latest-value">{{ t.latest }} <strong>{{ num(hrLatest) }}</strong><small>{{ t.bpm }}</small></span></div>
        <VChart v-if="hrPoints.length > 1" class="hr-chart" theme="zeppbridge-dark" :option="hrChartOption" autoresize role="img" :aria-label="t.hrChartAria" />
        <ul v-if="hrPoints.length > 1" class="hr-zones" :aria-label="t.hrZonesAria">
          <li v-for="zone in HR_ZONES" :key="zone.key">{{ zone.label }}</li>
        </ul>
        <div v-else class="panel-empty"><DesignIcon name="heart-rate" :size="56" /><span>{{ t.hrEmpty }}</span></div>
        <span class="panel-more">{{ t.hrMore }} <DesignIcon name="chevron-right" :size="18" /></span>
      </RouterLink>

      <RouterLink class="metric-panel steps-panel" to="/activity" :aria-label="t.stepsPanelAria">
        <div class="panel-head"><span class="panel-title"><DesignIcon name="steps" :size="34" /><span><strong>{{ t.stepsTitle }}</strong><small>{{ stepGoalIsReference ? t.stepsGoalReference : t.stepsGoalToday }}</small></span></span></div>
        <div class="steps-content">
          <CircularProgress :value="stepsPercent" :size="148" :stroke-width="9" color="#66D77D" track-color="rgba(116, 216, 137, .14)" :show-label="false">
            <div class="steps-inring">
              <strong>{{ num(stepsToday) }}</strong>
              <span>{{ t.stepsUnit }}</span>
            </div>
          </CircularProgress>
          <p class="steps-goal">{{ t.stepsGoalLine(formatMetric(stepGoal), stepsPercent) }}</p>
        </div>
        <span class="panel-more">{{ t.seeMore }} <DesignIcon name="chevron-right" :size="18" /></span>
      </RouterLink>

      <RouterLink class="metric-panel sleep-panel" :to="lastSleep ? `/sleep/${lastSleep.sleep_id}` : '/sleep'" :aria-label="t.sleepPanelAria">
        <div class="panel-head"><span class="panel-title"><DesignIcon name="sleep" :size="38" /><span><strong>{{ t.sleepTitle }}</strong><small>{{ t.sleepSub }}</small></span></span><span v-if="lastSleep && isFiniteNumber(lastSleep.score)" class="sleep-score">{{ lastSleep.score }}</span></div>
        <template v-if="lastSleep">
          <p class="sleep-total">{{ hm(lastSleep.duration_minutes) }}</p>
          <div class="sleep-bar" :aria-label="t.sleepBarAria"><span v-for="stage in sleepStages" :key="stage.key" :style="{ flex: Math.max(1, stage.minutes || 0), background: stage.color }"></span></div>
          <ul class="sleep-stages"><li v-for="stage in sleepStages" :key="stage.key"><i :style="{ background: stage.color }"></i><span>{{ stage.label }}</span><strong>{{ hm(stage.minutes) }}</strong></li></ul>
        </template>
        <div v-else class="panel-empty compact"><DesignIcon name="sleep" :size="50" /><span>{{ t.sleepEmpty }}</span></div>
        <span class="panel-more">{{ t.seeMore }} <DesignIcon name="chevron-right" :size="18" /></span>
      </RouterLink>

      <RouterLink class="metric-panel entry-panel body-entry" to="/body" :aria-label="t.bodyPanelAria">
        <div class="entry-icon"><DesignIcon name="recovery" :size="52" /></div>
        <div class="entry-copy">
          <p class="entry-label">{{ t.bodyTitle }} <DesignIcon name="chevron-right" :size="18" /></p>
          <p class="entry-facts">
            <span v-for="fact in bodyEntry.facts" :key="fact.key">
              {{ fact.label }} <strong>{{ fact.text }}</strong>
            </span>
          </p>
          <Sparkline
            v-if="bodyEntry.spark.length > 1"
            :values="bodyEntry.spark"
            :color="zeppSemanticColors.readiness"
            :label="bodyEntry.sparkLabel"
          />
          <p v-else class="entry-note">{{ bodyEntry.measured ? t.bodyThin : t.bodyEmpty }}</p>
        </div>
      </RouterLink>

      <RouterLink class="metric-panel entry-panel training-entry" to="/training" :aria-label="t.trainingPanelAria">
        <div class="entry-icon"><DesignIcon name="training-load" :size="52" /></div>
        <div class="entry-copy">
          <p class="entry-label">{{ t.trainingTitle }} <DesignIcon name="chevron-right" :size="18" /></p>
          <p class="entry-facts">
            <span v-for="fact in trainingEntry.facts" :key="fact.key">
              {{ fact.label }} <strong>{{ fact.text }}</strong>
            </span>
          </p>
          <Sparkline
            v-if="trainingEntry.spark.length > 1"
            :values="trainingEntry.spark"
            :color="zeppSemanticColors.training"
            :label="trainingEntry.sparkLabel"
          />
          <p v-else class="entry-note">{{ trainingEntry.measured ? t.trainingThin : t.trainingEmpty }}</p>
        </div>
      </RouterLink>

      <section class="metric-panel recent-panel" :aria-label="t.recentAria">
        <div class="panel-head"><span class="panel-title"><DesignIcon name="document" :size="38" /><span><strong>{{ t.recentTitle }}</strong><small>{{ t.recentSub }}</small></span></span><RouterLink class="text-link" to="/recent">{{ t.seeAll }} <DesignIcon name="chevron-right" :size="22" /></RouterLink></div>
        <div v-if="recentItems.length" class="recent-list"><RecordRow v-for="item in recentItems" :key="item.key" :to="item.to" :category="item.category" :icon="item.icon" :design-icon="item.designIcon" :kicker="item.kicker" :title="item.title" :fact="item.fact" :fact-label="item.factLabel" /></div>
        <div v-else class="panel-empty recent-empty"><DesignIcon name="document" :size="58" /><span>{{ t.recentEmpty }}</span></div>
      </section>
    </div>
  </section>
</template>

<style scoped>
.overview-page { display: grid; gap: 18px; align-content: start; max-width: 1540px; margin: 0 auto; }
.hero-card { position: relative; display: grid; grid-template-columns: minmax(0, 1.08fr) minmax(440px, .92fr); min-height: 292px; overflow: hidden; border: 1px solid rgba(220,232,239,.1); border-radius: 26px; background: radial-gradient(700px 320px at 92% 20%, rgba(136,164,73,.13), transparent 68%), linear-gradient(135deg, #1C2026, #181C20 68%); box-shadow: inset 0 1px 0 rgba(255,255,255,.045), 0 20px 48px rgba(5,8,10,.15); }
.hero-card::before { position: absolute; inset: 0; pointer-events: none; content: ''; background-image: linear-gradient(rgba(255,255,255,.018) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.018) 1px, transparent 1px); background-size: 34px 34px; mask-image: linear-gradient(90deg, transparent 35%, black); }
.hero-copy { position: relative; padding: 34px 10px 30px 34px; align-self: center; }
.hero-kicker { display: flex; align-items: center; gap: 8px; margin: 0 0 12px; color: #A3BD69; font-family: var(--font-mono); font-size: 10px; letter-spacing: .12em; }.hero-kicker span { width: 26px; height: 1px; background: #9DBB58; }
.hero-copy h1 { margin: 0; color: #F5F7F0; font-size: clamp(27px, 2.3vw, 39px); font-weight: 700; letter-spacing: -.04em; line-height: 1.18; }.hero-copy h1 em { color: #C7DC80; font-style: normal; }
.hero-intro { max-width: 640px; margin: 13px 0 22px; color: #9AA3AD; font-size: 13px; line-height: 1.75; }
.hero-values { display: flex; flex-wrap: wrap; gap: 10px; margin: 0; padding: 0; list-style: none; }.hero-values li { display: flex; min-width: 148px; align-items: center; gap: 8px; padding: 6px 12px 6px 5px; border: 1px solid rgba(222,232,239,.09); border-radius: 15px; background: rgba(38,43,49,.72); box-shadow: inset 0 1px 0 rgba(255,255,255,.04); }.hero-values li > span { display: grid; gap: 1px; }.hero-values strong { color: #EEF2E7; font-size: 12px; }.hero-values small { color: #78818B; font-size: 10px; }
.hero-visual { position: relative; display: grid; grid-template-columns: auto minmax(64px, 1fr) auto; align-items: center; min-width: 0; padding: 26px 28px 26px 8px; gap: 14px; }
.device-stack { display: flex; align-items: flex-end; gap: 14px; min-width: 0; }
.hero-device { display: grid; justify-items: center; gap: 7px; margin: 0; flex: 0 0 auto; width: 104px; }
.device-plinth { display: grid; width: 104px; height: 90px; place-items: center; border: 1px solid rgba(221,232,240,.09); border-radius: 20px; background: linear-gradient(145deg, rgba(45,50,58,.9), rgba(26,30,35,.78)); box-shadow: inset 0 1px 0 rgba(255,255,255,.055), 0 14px 30px rgba(3,5,7,.28); }
.device-stack.solo .hero-device { width: 124px; }
.device-stack.solo .device-plinth { width: 124px; height: 106px; }
.hero-device :deep(.device-visual) { width: 92px; height: 80px; flex-basis: 80px; border: 0; background: transparent; }
.device-stack.solo .hero-device :deep(.device-visual) { width: 112px; height: 94px; flex-basis: 94px; }
.hero-device :deep(.device-visual img) { padding: 1px; filter: drop-shadow(0 9px 12px rgba(0,0,0,.28)); }
.hero-device figcaption { width: 100%; color: #818A94; font-size: 11px; line-height: 1.3; text-align: center; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.device-more { align-self: center; padding: 4px 8px; border: 1px solid rgba(221,232,240,.12); border-radius: 999px; color: #9CB965; font-family: var(--font-mono); font-size: 11px; }
.data-flow { width: 100%; min-width: 56px; max-width: 140px; height: 72px; justify-self: stretch; color: #8FB348; overflow: visible; }.data-flow path:not(.arrow) { stroke: currentColor; stroke-width: 2; stroke-dasharray: 6 8; animation: flow 1.7s linear infinite; }.data-flow .arrow { fill: currentColor; }@keyframes flow { to { stroke-dashoffset: -28; } }
.ai-node { display: grid; justify-items: center; gap: 8px; flex: 0 0 auto; min-width: 96px; color: #9CB965; font-family: var(--font-mono); font-size: 9px; letter-spacing: .15em; }
.ai-logos { display: flex; align-items: center; }
.ai-logos img { width: 32px; height: 32px; margin-left: -8px; border: 2px solid #1C2026; border-radius: 50%; background: #161a14; object-fit: cover; }
.ai-logos img:first-child { margin-left: 0; }
.inline-alert { display: flex; align-items: center; gap: 8px; padding: 9px 13px; border: 1px solid var(--line); border-radius: 12px; background: var(--surface); color: var(--muted); font-size: 12px; }.inline-alert.warning { color: var(--warning); }
.overview-skeleton { display: grid; gap: 16px; }.skeleton-grid { display: grid; grid-template-columns: repeat(3, minmax(0,1fr)); gap: 16px; }.empty-wrap { display: grid; min-height: 300px; place-items: center; }.empty-state { display: grid; max-width: 360px; justify-items: center; gap: 9px; padding: 32px; color: var(--muted); text-align: center; }.empty-state strong { color: var(--ink); font-size: 16px; }
.dashboard-grid { display: grid; grid-template-columns: repeat(12, minmax(0, 1fr)); gap: 16px; }.metric-panel { position: relative; min-width: 0; overflow: hidden; border: 1px solid rgba(221,231,239,.09); border-radius: 22px; background: linear-gradient(145deg, rgba(31,35,41,.98), rgba(27,31,36,.98)); box-shadow: inset 0 1px 0 rgba(255,255,255,.035); transition: transform .28s cubic-bezier(.16,1,.3,1), border-color .28s ease; }.metric-panel:hover { transform: translateY(-2px); border-color: rgba(221,231,239,.15); }
.hr-panel { grid-column: span 6; min-height: 286px; padding: 20px 20px 12px; }.steps-panel, .sleep-panel { grid-column: span 3; min-height: 286px; padding: 18px; }.mini-panel { grid-column: span 4; min-height: 166px; padding: 18px; }.recent-panel { grid-column: 1 / -1; padding: 18px; }
.panel-head { display: flex; min-width: 0; align-items: center; justify-content: space-between; gap: 12px; }.panel-title { display: flex; min-width: 0; align-items: center; gap: 8px; }.panel-title > span { display: grid; gap: 1px; }.panel-title strong { color: #EEF1EC; font-size: 13px; font-weight: 600; }.panel-title small { color: #737C86; font-size: 11px; }.chart-icon { display: grid; width: 38px; height: 38px; flex: 0 0 38px; place-items: center; overflow: hidden; border-radius: 11px; background: rgba(255,255,255,.025); }.latest-value { display: flex; align-items: baseline; gap: 5px; color: #8A929B; font-size: 12px; white-space: nowrap; }.latest-value strong { color: #F1F5EC; font-family: var(--font-mono); font-size: 20px; font-weight: 600; }.latest-value small { font-size: 11px; }
.hr-chart { width: 100%; height: 198px; }.hr-zones { display: flex; flex-wrap: wrap; gap: 8px 12px; margin: 4px 0 0; padding: 0; list-style: none; color: #747D87; font-size: 11px; }.panel-empty { display: flex; min-height: 190px; align-items: center; justify-content: center; gap: 12px; color: #717A84; font-size: 11px; text-align: center; }.panel-empty.compact { min-height: 170px; flex-direction: column; }.panel-empty .design-icon { opacity: .7; filter: saturate(.8); }
.steps-content { display: grid; min-height: 220px; place-items: center; align-content: center; gap: 14px; }
.steps-inring { display: grid; justify-items: center; gap: 2px; }
.steps-inring strong { color: #F4F6EF; font-family: var(--font-mono); font-size: 22px; font-weight: 600; font-variant-numeric: tabular-nums; line-height: 1; }
.steps-inring span { color: #8AA894; font-size: 11px; }
.steps-goal { margin: 0; color: #8A929B; font-size: 12px; font-variant-numeric: tabular-nums; }
.sleep-panel { background: radial-gradient(380px 240px at 90% 0, rgba(104,87,217,.12), transparent 70%), linear-gradient(145deg, #20222C, #1C1F27); }.sleep-score { padding: 4px 10px; border-radius: 999px; background: rgba(131,109,235,.14); color: #A895FF; font-family: var(--font-mono); font-size: 12px; }.sleep-total { margin: 16px 0 10px; color: #F4F3FC; font-family: var(--font-mono); font-size: 20px; font-weight: 600; }.sleep-bar { display: flex; gap: 3px; height: 7px; overflow: hidden; border-radius: 999px; }.sleep-bar span { min-width: 3px; border-radius: 999px; }.sleep-stages { display: grid; grid-template-columns: minmax(0,1fr); gap: 9px; margin: 14px 0 0; padding: 0; list-style: none; }.sleep-stages li { display: grid; grid-template-columns: 8px minmax(0,1fr) auto; align-items: center; gap: 8px; min-width: 0; color: #9299A4; font-size: 12px; }.sleep-stages i { width: 6px; height: 6px; border-radius: 50%; }.sleep-stages strong { color: #C4C8D0; font-family: var(--font-mono); font-size: 12px; font-weight: 500; white-space: nowrap; }
.mini-panel { display: grid; grid-template-columns: auto minmax(0,1fr); align-items: center; gap: 14px; }.mini-icon { display: grid; width: 68px; height: 68px; place-items: center; overflow: hidden; border-radius: 18px; }.mini-label { margin: 0; color: #B4BAC1; font-size: 13px; font-weight: 500; }.mini-value { display: flex; align-items: baseline; gap: 6px; margin: 5px 0; }.mini-value strong { color: #F5F6F2; font-family: var(--font-mono); font-size: 22px; font-weight: 600; line-height: 1; }.mini-value span { color: #8A929B; font-size: 12px; }.mini-note { margin: 0; color: #7B838C; font-size: 11px; line-height: 1.4; }.resting-panel { background: radial-gradient(300px 180px at 0 100%, rgba(225,75,88,.1), transparent 72%), linear-gradient(145deg, #221E23, #1D2025); }
/* 四张指标卡现在是链接，得把 <a> 的默认样式收掉，并给出一致的「看更多」提示。 */
.unrecognized-banner {
  display: flex;
  align-items: center;
  gap: 9px;
  padding: 10px 14px;
  border: 1px solid rgba(245, 195, 59, .28);
  border-radius: 14px;
  background: rgba(245, 195, 59, .08);
  color: #e8cf86;
  font-size: 12px;
  text-decoration: none;
}
.unrecognized-banner strong { color: #f4e2ae; font-weight: 600; }
.unrecognized-banner em { display: inline-flex; align-items: center; gap: 3px; margin-left: auto; font-style: normal; white-space: nowrap; }
.unrecognized-banner:hover { border-color: rgba(245, 195, 59, .45); }

a.metric-panel { display: block; color: inherit; text-decoration: none; }
a.metric-panel.mini-panel { display: flex; align-items: center; gap: 14px; }
.panel-more { display: inline-flex; align-items: center; gap: 4px; margin-top: 6px; color: #737C86; font-size: 11px; }
.mini-chevron { margin-left: auto; opacity: .55; }
/* 静息心率卡撤掉之后，这一行由身体状态和训练状态平分。 */
.entry-panel { display: grid; grid-template-columns: auto minmax(0,1fr); grid-column: span 6; align-items: start; gap: 12px; min-height: 166px; padding: 18px; color: inherit; text-decoration: none; }
.entry-panel:hover { border-color: rgba(221,231,239,.18); }
.entry-icon { display: grid; width: 52px; height: 52px; place-items: center; overflow: hidden; border-radius: 15px; }
.entry-copy { display: grid; align-content: start; gap: 7px; min-width: 0; }
.entry-label { display: flex; align-items: center; gap: 3px; margin: 0; color: #B4BAC1; font-size: 13px; font-weight: 500; }
.entry-facts { display: flex; flex-wrap: wrap; gap: 4px 14px; margin: 0; color: #7B838C; font-size: 11px; }
.entry-facts strong { color: #F5F6F2; font-family: var(--font-mono); font-size: 15px; font-weight: 600; font-variant-numeric: tabular-nums; }
.entry-note { margin: 0; color: #7B838C; font-size: 11px; line-height: 1.5; }
.body-entry { background: radial-gradient(300px 180px at 0 100%, rgba(61,216,76,.09), transparent 72%), linear-gradient(145deg, #1C2320, #1D2025); }
.training-entry { background: radial-gradient(300px 180px at 0 100%, rgba(136,164,73,.1), transparent 72%), linear-gradient(145deg, #1E2218, #1C2018); }
.text-link { display: inline-flex; align-items: center; gap: 3px; color: #9DBA5D; font-size: 11px; text-decoration: none; }.text-link:hover { color: #C7DC80; }.recent-list { display: grid; grid-template-columns: repeat(2, minmax(0,1fr)); margin-top: 12px; overflow: hidden; border: 1px solid rgba(226,234,242,.07); border-radius: 16px; }.recent-list :deep(.record-row:nth-child(odd)) { border-right: 1px solid var(--line); }.recent-list :deep(.record-row) { min-height: 72px; transition: background .2s ease, transform .2s ease; }.recent-list :deep(.record-row:hover) { transform: translateX(2px); }.recent-empty { min-height: 120px; }
@media (max-width: 1180px) { .hero-card { grid-template-columns: minmax(0,1fr); }.hero-visual { min-height: 210px; padding: 0 34px 24px; }.hero-copy { padding-right: 34px; }.hr-panel { grid-column: span 8; }.steps-panel { grid-column: span 4; }.sleep-panel { grid-column: span 6; }.mini-panel, .entry-panel { grid-column: span 6; } }
@media (max-width: 820px) { .overview-page { padding-inline: 16px; }.hero-card { border-radius: 20px; }.hero-copy { padding: 26px 22px 18px; }.hero-visual { grid-template-columns: auto auto; padding: 0 20px 24px; }.data-flow { display: none; }.hero-values li { min-width: calc(50% - 5px); }.dashboard-grid { grid-template-columns: minmax(0,1fr); }.hr-panel,.steps-panel,.sleep-panel,.mini-panel,.entry-panel,.recent-panel { grid-column: 1; }.recent-list { grid-template-columns: minmax(0,1fr); }.recent-list :deep(.record-row:nth-child(odd)) { border-right: 0; }.skeleton-grid { grid-template-columns: minmax(0,1fr); } }
@media (max-width: 520px) { .hero-visual { grid-template-columns: minmax(0,1fr); }.hero-values { display: grid; }.hero-values li { min-width: 0; } }
@media (prefers-reduced-motion: reduce) { .data-flow path { animation: none; }.metric-panel { transition: none; } }
</style>
