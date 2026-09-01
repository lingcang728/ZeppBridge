<script setup lang="ts">
defineOptions({ name: 'HeartRateDetail' });
/**
 * 心率二级界面。
 *
 * 首页那张 24 小时心率卡只能回答「刚才是多少」；要判断「这几天是不是偏高」
 * 就得看跨天的趋势。这一页把两件事放在一起：上面是今天的全天曲线，下面是
 * 静息心率与 HRV 的按天趋势。
 *
 * 没有采样的时间段不画线，也不补 0——曲线断开就是断开。
 */
import { computed, onMounted, ref, watch } from 'vue';
import { VChart } from '../lib/echartsSetup';
import MetricTrendCard from '../components/MetricTrendCard.vue';
import PageHeader from '../components/PageHeader.vue';
import SkeletonBlock from '../components/SkeletonBlock.vue';
import Icon from '../components/Icon.vue';
import { useSyncController } from '../composables/useSyncController';
import { backend, isDesktop, toUserMessage } from '../lib/bridge';
import { zeppSemanticColors } from '../lib/echartsTheme';
import { indexSeries, SERIES_RANGE_DAYS, seriesRanges, type SeriesRangeDays } from '../lib/metricSeries';
import { isFiniteNumber } from '../lib/format';
import type { DailyHeartRateExtreme, HeartRatePoint, MetricSeries } from '../types';
import { defineMessages, intlLocale, useMessages } from '../i18n';

const messages = defineMessages(
  {
    backToOverview: '返回概览',
    eyebrow: '心率',
    title: '心率',
    intro: '今天的全天心率曲线，以及静息心率与 HRV 的按天趋势。没有采样的时间不画线，也不补 0。',
    rangeAria: '趋势时间范围',
    desktopOnly: '请使用桌面应用；浏览器预览不会读取账户数据。',
    loadFailed: '心率数据暂时不可用',
    retry: '重试',
    loadingAria: '正在加载心率',
    dayCardAria: '24 小时心率',
    dayTitle: '最近 24 小时',
    daySub: '逐条读数，按时间排列',
    statLatest: '最新',
    statAverage: '平均',
    statLowest: '最低',
    statHighest: '最高',
    chartAria: '最近 24 小时心率曲线',
    noSamples: '最近 24 小时没有心率采样，所以这里不画曲线。',
    bpmTooltip: (clock: string, value: number) => `${clock}　<b>${value}</b> 次/分`,
    restingLabel: '静息心率',
    restingHint: '手表每天给出的静息心率，越稳越好',
    hrvHint: '逐条 HRV 读数按天平均',
    rmssdHint: '另一种 HRV 口径，和上面不是同一个数',
    emptyCard: '这段范围没有记录。',
    dailyMaxTitle: '每日最高心率（本机原始样本）',
    dailyMaxSub: 'Zepp App 显示的日最高心率是过滤过的，这里不过滤——两个数字不一样是正常的。',
    dailyMaxAria: '每日最高心率趋势',
    dailyMaxNone: '这段范围里本机没有心率样本，所以没有可比的最高值。',
    dailyMaxSparse: (days: number) =>
      `其中 ${days} 天的样本很少（少于 60 个）。那几天的「最高」只是这几个点里的最高，不是那一天真正的峰值——图上用空心点标出。`,
    dailyMaxLegendMax: '最高',
    dailyMaxLegendAvg: '平均',
    dailyMaxTooltip: (date: string, max: number, avg: number, samples: number) =>
      `${date}<br/>最高 <b>${max}</b> 次/分<br/>平均 ${avg} 次/分<br/>${samples} 个样本`,
    dailyMaxNote: '这里只用本机存着的原始逐条读数。Zepp 自己的日最高心率没有被采集进来（库里那个 device_max_hr 是手表的最大心率设定值，用来划分区间，不是当天实测峰值），所以无法在应用内并排对照——要核对请打开 Zepp App 看那一天的数字。',
  },
  {
    backToOverview: 'Back to overview',
    eyebrow: 'Heart rate',
    title: 'Heart rate',
    intro: "Today's full-day heart rate curve, plus resting heart rate and HRV day by day. Stretches without samples are left blank, not filled with a zero.",
    rangeAria: 'Trend time range',
    desktopOnly: 'Use the desktop app. This browser preview reads no account data.',
    loadFailed: 'Heart rate data is unavailable right now',
    retry: 'Try again',
    loadingAria: 'Loading heart rate',
    dayCardAria: '24-hour heart rate',
    dayTitle: 'Last 24 hours',
    daySub: 'Individual readings, in time order',
    statLatest: 'Latest',
    statAverage: 'Avg',
    statLowest: 'Min',
    statHighest: 'Max',
    chartAria: 'Heart rate over the last 24 hours',
    noSamples: 'No heart rate samples in the last 24 hours, so there is no curve to draw.',
    bpmTooltip: (clock: string, value: number) => `${clock}　<b>${value}</b> bpm`,
    restingLabel: 'Resting heart rate',
    restingHint: 'The watch reports one per day; steadier is better',
    hrvHint: 'Individual HRV readings, averaged per day',
    rmssdHint: 'A different HRV measure, not the same number as above',
    emptyCard: 'Nothing recorded in this range.',
    dailyMaxTitle: 'Daily peak heart rate (raw samples on this machine)',
    dailyMaxSub: 'The Zepp app filters its daily peak; this does not. The two numbers differing is expected.',
    dailyMaxAria: 'Daily peak heart rate trend',
    dailyMaxNone: 'No heart rate samples on this machine for this range, so there is no peak to compare.',
    dailyMaxSparse: (days: number) =>
      `${days} of these days have very few samples (fewer than 60). On those days the peak is the highest of just those points, not that day real peak — they are drawn as hollow markers.`,
    dailyMaxLegendMax: 'Peak',
    dailyMaxLegendAvg: 'Average',
    dailyMaxTooltip: (date: string, max: number, avg: number, samples: number) =>
      `${date}<br/>Peak <b>${max}</b> bpm<br/>Average ${avg} bpm<br/>${samples} samples`,
    dailyMaxNote: 'This uses only the raw per-reading samples stored on this machine. The Zepp daily peak is never sent to us (the device_max_hr in the library is the configured maximum used for zone limits, not a measured peak), so there is nothing to place beside it here — open the Zepp app to compare that day number.',
  },
);
const t = useMessages(messages);

const { dataRevision } = useSyncController();

const TREND_METRICS = ['resting_hr', 'hrv', 'hrv_rmssd'] as const;

const ranges = computed(() => seriesRanges());
const rangeDays = ref<SeriesRangeDays>(SERIES_RANGE_DAYS[0]);
const series = ref<Record<string, MetricSeries>>({});
const dayPoints = ref<HeartRatePoint[]>([]);
/*
 * 每日最高心率（Reddit p74fy0b：Zepp App 显示 104，原始数据峰值超过 120）。
 *
 * 只画本机原始样本的按日 max。**不和 Zepp 的日最高心率并排**——因为那个值
 * 根本没被采集进来：库里唯一叫 device_max_hr 的东西来自 PAI 流的 maxHr，那
 * 是这块表的最大心率设定值（划分区间用的），不是当天实测峰值。把它当成对照
 * 的另一半，就是又造一个「界面上有个数但它不是你以为的意思」。
 */
const dailyExtremes = ref<DailyHeartRateExtreme[]>([]);
/** 少于这个样本数的一天，它的 max 不能当成完整峰值看。 */
const SPARSE_SAMPLE_THRESHOLD = 60;
const sparseDays = computed(
  () => dailyExtremes.value.filter((day) => day.samples < SPARSE_SAMPLE_THRESHOLD).length,
);
const loading = ref(true);
const error = ref<string | null>(null);

const points = computed(() => dayPoints.value
  .map((point) => ({ ts: new Date(point.timestamp).getTime(), value: point.value }))
  .filter((point) => Number.isFinite(point.ts) && isFiniteNumber(point.value)));

const latest = computed(() => points.value[points.value.length - 1]?.value ?? null);
const lowest = computed(() => (points.value.length
  ? Math.min(...points.value.map((point) => point.value))
  : null));
const highest = computed(() => (points.value.length
  ? Math.max(...points.value.map((point) => point.value))
  : null));
const average = computed(() => (points.value.length
  ? Math.round(points.value.reduce((total, point) => total + point.value, 0) / points.value.length)
  : null));

const clock = (value: number) => new Intl.DateTimeFormat(intlLocale(), {
  hour: '2-digit', minute: '2-digit', hour12: false,
}).format(new Date(value));

const dayChartOption = computed(() => {
  const data = points.value.map((point) => [point.ts, point.value]);
  return {
    animationDuration: 700,
    grid: { left: 40, right: 18, top: 16, bottom: 28 },
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
        return t.value.bpmTooltip(clock(point.value[0]), Math.round(point.value[1]));
      },
    },
    xAxis: {
      type: 'time',
      min: data[0]?.[0],
      max: data[data.length - 1]?.[0],
      axisLabel: { formatter: clock, hideOverlap: true, color: '#78818C', fontSize: 10 },
      axisLine: { lineStyle: { color: 'rgba(232,238,244,.12)' } },
      axisTick: { show: false },
      splitLine: { show: false },
    },
    yAxis: {
      type: 'value', scale: true, splitNumber: 4,
      axisLabel: { color: '#78818C', fontSize: 10 },
      axisLine: { show: false }, axisTick: { show: false },
      splitLine: { lineStyle: { color: 'rgba(232,238,244,.08)', type: 'dashed' } },
    },
    series: [{
      type: 'line',
      data,
      smooth: 0.18,
      showSymbol: false,
      lineStyle: { width: 1.6, color: zeppSemanticColors.heart },
      areaStyle: { color: 'rgba(240,97,106,.12)' },
      connectNulls: false,
    }],
  };
});

const trendCards = computed(() => [
  {
    metric: 'resting_hr',
    label: t.value.restingLabel,
    hint: t.value.restingHint,
    color: zeppSemanticColors.readiness,
    unit: 'bpm',
    series: series.value.resting_hr ?? null,
  },
  {
    metric: 'hrv',
    label: 'HRV (SDNN)',
    hint: t.value.hrvHint,
    color: zeppSemanticColors.pace,
    unit: 'ms',
    series: series.value.hrv ?? null,
  },
  {
    metric: 'hrv_rmssd',
    label: 'HRV (RMSSD)',
    hint: t.value.rmssdHint,
    color: zeppSemanticColors.calories,
    unit: 'ms',
    series: series.value.hrv_rmssd ?? null,
  },
]);

const load = async () => {
  loading.value = true;
  error.value = null;
  if (!isDesktop()) {
    series.value = {};
    dayPoints.value = [];
    loading.value = false;
    error.value = t.value.desktopOnly;
    return;
  }
  const [day, trends, extremes] = await Promise.allSettled([
    backend.getHeartRateSeries(24),
    backend.getMetricSeries([...TREND_METRICS], rangeDays.value),
    backend.getDailyHeartRateExtremes(rangeDays.value),
  ]);
  dayPoints.value = day.status === 'fulfilled' ? day.value : [];
  series.value = trends.status === 'fulfilled' ? indexSeries(trends.value) : {};
  dailyExtremes.value = extremes.status === 'fulfilled' ? extremes.value : [];
  if (day.status === 'rejected' && trends.status === 'rejected') {
    error.value = toUserMessage(day.reason, t.value.loadFailed);
  }
  loading.value = false;
};

/* 样本稀疏的那一天画成空心点。用不同的标记而不是干脆不画：那一天确实有
   读数，只是不足以称为「这一天的最高」——把它藏起来会让曲线看着更完整，
   而那正是这条功能要避免的事。 */
const dailyMaxChartOption = computed(() => {
  const rows = dailyExtremes.value;
  return {
    animationDuration: 700,
    grid: { left: 40, right: 12, top: 28, bottom: 26 },
    legend: {
      data: [t.value.dailyMaxLegendMax, t.value.dailyMaxLegendAvg],
      top: 0,
      textStyle: { color: '#7E856D', fontSize: 11 },
    },
    tooltip: {
      trigger: 'axis',
      formatter: (params: Array<{ dataIndex: number }>) => {
        const row = rows[params?.[0]?.dataIndex ?? -1];
        if (!row) return '';
        return t.value.dailyMaxTooltip(row.date, row.max, row.average, row.samples);
      },
    },
    xAxis: {
      type: 'category',
      data: rows.map((row) => row.date.slice(5)),
      axisLabel: { color: '#7E856D', fontSize: 11, hideOverlap: true },
      axisTick: { show: false },
      axisLine: { lineStyle: { color: 'rgba(226, 234, 242, .12)' } },
    },
    yAxis: {
      type: 'value',
      scale: true,
      axisLabel: { color: '#7E856D', fontSize: 11 },
      axisLine: { show: false },
      axisTick: { show: false },
      splitLine: { lineStyle: { color: 'rgba(226, 234, 242, .08)', type: 'dashed' } },
    },
    series: [
      {
        name: t.value.dailyMaxLegendMax,
        type: 'line',
        data: rows.map((row) => row.max),
        showSymbol: true,
        symbolSize: 6,
        lineStyle: { width: 2.2, color: zeppSemanticColors.heart },
        itemStyle: {
          color: (params: { dataIndex: number }) =>
            (rows[params.dataIndex]?.samples ?? 0) < SPARSE_SAMPLE_THRESHOLD
              ? 'transparent'
              : zeppSemanticColors.heart,
          borderColor: zeppSemanticColors.heart,
          borderWidth: 1.6,
        },
      },
      {
        name: t.value.dailyMaxLegendAvg,
        type: 'line',
        data: rows.map((row) => row.average),
        showSymbol: false,
        lineStyle: { width: 1.4, type: 'dashed', color: 'rgba(226, 234, 242, .45)' },
      },
    ],
  };
});

onMounted(() => { void load(); });
watch(rangeDays, () => { void load(); });
watch(dataRevision, () => { void load(); });
</script>

<template>
  <section class="page metric-page" aria-labelledby="hr-title">
    <PageHeader
      back="/"
      :back-label="t.backToOverview"
      title-id="hr-title"
      :eyebrow="t.eyebrow"
      :title="t.title"
      :intro="t.intro"
    >
      <div class="range-switch" role="radiogroup" :aria-label="t.rangeAria">
        <button
          v-for="range in ranges"
          :key="range.days"
          type="button"
          role="radio"
          :aria-checked="rangeDays === range.days"
          :class="['range-pill', { 'is-on': rangeDays === range.days }]"
          @click="rangeDays = range.days"
        >{{ range.label }}</button>
      </div>
    </PageHeader>

    <div v-if="error" class="inline-alert" role="alert">
      <Icon name="warning" :size="14" />{{ error }}
      <button v-if="isDesktop()" class="button button-secondary retry" type="button" @click="load">{{ t.retry }}</button>
    </div>

    <div v-if="loading" class="stack" aria-live="polite" :aria-label="t.loadingAria">
      <SkeletonBlock height="280px" /><SkeletonBlock height="268px" />
    </div>

    <template v-else>
      <section class="surface-card day-card" :aria-label="t.dayCardAria">
        <header class="day-head">
          <div>
            <h2>{{ t.dayTitle }}</h2>
            <p>{{ t.daySub }}</p>
          </div>
          <dl class="day-stats">
            <div><dt>{{ t.statLatest }}</dt><dd>{{ latest === null ? '—' : Math.round(latest) }}</dd></div>
            <div><dt>{{ t.statAverage }}</dt><dd>{{ average === null ? '—' : average }}</dd></div>
            <div><dt>{{ t.statLowest }}</dt><dd>{{ lowest === null ? '—' : Math.round(lowest) }}</dd></div>
            <div><dt>{{ t.statHighest }}</dt><dd>{{ highest === null ? '—' : Math.round(highest) }}</dd></div>
          </dl>
        </header>
        <VChart
          v-if="points.length"
          class="day-chart"
          :option="dayChartOption"
          autoresize
          role="img"
          :aria-label="t.chartAria"
        />
        <p v-else class="inline-alert" role="status">
          <Icon name="info" :size="14" />{{ t.noSamples }}
        </p>
      </section>

      <section class="surface-card day-card" :aria-label="t.dailyMaxAria">
        <header class="day-head">
          <div>
            <h2>{{ t.dailyMaxTitle }}</h2>
            <p>{{ t.dailyMaxSub }}</p>
          </div>
        </header>
        <VChart
          v-if="dailyExtremes.length"
          class="day-chart"
          :option="dailyMaxChartOption"
          autoresize
          role="img"
          :aria-label="t.dailyMaxAria"
        />
        <p v-else class="inline-alert" role="status">
          <Icon name="info" :size="14" />{{ t.dailyMaxNone }}
        </p>
        <p v-if="sparseDays" class="inline-alert" role="status">
          <Icon name="info" :size="14" />{{ t.dailyMaxSparse(sparseDays) }}
        </p>
        <p class="daily-max-note">{{ t.dailyMaxNote }}</p>
      </section>

      <div class="card-grid">
        <MetricTrendCard
          v-for="card in trendCards"
          :key="card.metric"
          :label="card.label"
          :hint="card.hint"
          :series="card.series"
          :color="card.color"
          :unit="card.unit"
          :decimals="0"
          :empty-text="t.emptyCard"
        />
      </div>
    </template>
  </section>
</template>

<style scoped>
.metric-page.page { display: grid; gap: var(--space-4); align-content: start; }
.stack { display: grid; gap: var(--space-4); }
.range-switch { display: flex; gap: var(--space-1); padding: 4px; border-radius: var(--radius-sm); background: var(--surface-raised); }
.range-pill { min-height: 30px; padding: 5px 12px; border: 1px solid transparent; border-radius: var(--radius-sm); background: transparent; color: var(--muted); font-size: 12px; cursor: pointer; }
.range-pill:hover { color: var(--ink); }
.range-pill.is-on { background: var(--accent); color: var(--accent-ink); font-weight: 600; }
.day-card { padding: 18px 20px; border: 1px solid var(--line); border-radius: var(--radius-md); background: var(--surface); }
.day-head { display: flex; flex-wrap: wrap; align-items: flex-start; justify-content: space-between; gap: 14px; margin-bottom: 12px; }
.day-head h2 { margin: 0 0 2px; font-size: 15px; font-weight: 700; color: var(--ink); }
.day-head p { margin: 0; color: var(--muted); font-size: 12px; }
.day-stats { display: flex; gap: 18px; margin: 0; }
.day-stats div { display: grid; gap: 2px; }
.day-stats dt { color: var(--subtle); font-size: 11px; }
.day-stats dd { margin: 0; color: var(--ink); font-size: 18px; font-weight: 700; font-family: var(--font-mono); }
.day-chart { width: 100%; height: 240px; }
/* 说明为什么这个数字和 Zepp App 里的不一样。少了它，用户只会以为其中一边坏了。 */
.daily-max-note { margin: 10px 0 0; color: var(--subtle); font-size: 11px; line-height: 1.6; }
.card-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(320px, 1fr)); gap: var(--space-4); }
.inline-alert { display: flex; align-items: center; gap: var(--space-2); margin: 0; padding: 9px 13px; border: 1px solid var(--line); border-radius: var(--radius-md); background: var(--surface); color: var(--muted); font-size: 12px; }
.inline-alert[role='alert'] { color: var(--danger); }
.retry { margin-left: auto; }
@media (max-width: 720px) {
  .card-grid { grid-template-columns: minmax(0, 1fr); }
  .day-stats { gap: 12px; }
}
</style>
