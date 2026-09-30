<script setup lang="ts">
import { displayDateTimeFormatter } from '../lib/dateTime';
import { useFirstLoad } from '../composables/useFirstLoad';

defineOptions({ name: 'HeartRateDetail' });
/**
 * 心率二级界面。
 *
 * 首页那张 24 小时心率卡只能回答「刚才是多少」；要判断「这几天是不是偏高」
 * 就得看跨天的趋势。这一页把两件事放在一起，但时间窗不是同一个：
 * 上面是固定 24 小时的全天曲线，范围开关在它下面，只管每日最高 / 静息 / HRV。
 *
 * 没有采样的时间段不画线，也不补 0——曲线断开就是断开。
 */
import { computed, onMounted, ref, watch } from 'vue';
import { HR_GAP_BREAK_MS, insertNullBreaks } from '../lib/chartGaps';
import { createLoadSeq } from '../lib/loadSeq';
import MetricTrendCard from '../components/MetricTrendCard.vue';
import SwapChart from '../components/SwapChart.vue';
import { trendGridStyle } from '../lib/trendGrid';
import { useQueuedOption } from '../composables/useQueuedOption';
import SectionGroup from '../components/SectionGroup.vue';
import PageHeader from '../components/PageHeader.vue';
import SkeletonBlock from '../components/SkeletonBlock.vue';
import Icon from '../components/Icon.vue';
import SegmentTrack from '../components/SegmentTrack.vue';
import { useSyncController } from '../composables/useSyncController';
import { backend, isDesktop, toUserMessage } from '../lib/bridge';
import { CHART_THEME, VChart, chartPalette } from '../lib/echartsSetup';
import { indexSeries, SERIES_FETCH_DAYS, SERIES_RANGE_DAYS, seriesRanges, sliceByDate, sliceIndexed, type SeriesRangeDays } from '../lib/metricSeries';
import { trackRangeSwap } from '../lib/chartSwap';
import { isFiniteNumber } from '../lib/format';
import type { DailyHeartRateExtreme, HeartRatePoint, MetricSeries } from '../types';
import { useMessages } from '../i18n';
import { heartRateDetailMessages as messages } from './HeartRateDetail.i18n';

const t = useMessages(messages);

const { dataRevision } = useSyncController();

const TREND_METRICS = ['resting_hr', 'hrv', 'hrv_rmssd'] as const;

const ranges = computed(() => seriesRanges());
const rangeDays = ref<SeriesRangeDays>(SERIES_RANGE_DAYS[0]);
/* 趋势一次取最长那档，切范围只在本地切（lib/metricSeries.ts 的 sliceSeries）：点下去不用等查库。 */
const fullSeries = ref<Record<string, MetricSeries>>({});
const series = computed(() => sliceIndexed(fullSeries.value, rangeDays.value));
trackRangeSwap(rangeDays);
const dayPoints = ref<HeartRatePoint[]>([]);
/*
 * 每日最高心率（Reddit p74fy0b：Zepp App 显示 104，原始数据峰值超过 120）。
 *
 * 只画本机原始样本的按日 max。**不和 Zepp 的日最高心率并排**——因为那个值
 * 根本没被采集进来：库里唯一叫 device_max_hr 的东西来自 PAI 流的 maxHr，那
 * 是这块表的最大心率设定值（划分区间用的），不是当天实测峰值。把它当成对照
 * 的另一半，就是又造一个「界面上有个数但它不是你以为的意思」。
 */
const fullExtremes = ref<DailyHeartRateExtreme[]>([]);
const dailyExtremes = computed(() => sliceByDate(fullExtremes.value, rangeDays.value));
/** 少于这个样本数的一天，它的 max 不能当成完整峰值看。 */
const SPARSE_SAMPLE_THRESHOLD = 60;
const sparseDays = computed(
  () => dailyExtremes.value.filter((day) => day.samples < SPARSE_SAMPLE_THRESHOLD).length,
);
const loading = ref(true);
const initialLoading = useFirstLoad(loading);
const error = ref<string | null>(null);
const dayError = ref<string | null>(null);
const trendsError = ref<string | null>(null);
const extremesError = ref<string | null>(null);
const loadSeq = createLoadSeq();
const dayLoadSeq = createLoadSeq();

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

const clock = (value: number) => displayDateTimeFormatter({
  hour: '2-digit', minute: '2-digit', hour12: false,
}).format(new Date(value));

const dayChartOption = computed(() => {
  const data = insertNullBreaks(points.value, HR_GAP_BREAK_MS);
  return {
    // 不扫入：这张图每次进页面都是新建的，从左往右画一遍读起来就是「心率又重画了」。
    animationDuration: 0,
    grid: { left: 40, right: 18, top: 16, bottom: 28 },
    tooltip: {
      trigger: 'axis',
      backgroundColor: chartPalette.value.tooltipBg,
      borderColor: chartPalette.value.tooltipBorder,
      borderWidth: 1,
      padding: [8, 12],
      textStyle: { color: chartPalette.value.tooltipText, fontSize: 15.5 },
      extraCssText: 'border-radius:8px;box-shadow:none;',
      formatter: (params: Array<{ value: [number, number | null] }>) => {
        const point = Array.isArray(params) ? params[0] : params;
        if (!point || point.value[1] == null) return '';
        return t.value.bpmTooltip(clock(point.value[0]), Math.round(point.value[1]));
      },
    },
    xAxis: {
      type: 'time',
      min: data[0]?.[0],
      max: data[data.length - 1]?.[0],
      axisLabel: { formatter: clock, hideOverlap: true, color: chartPalette.value.axis, fontSize: 14.5 },
      axisLine: { lineStyle: { color: chartPalette.value.grid } },
      axisTick: { show: false },
      splitLine: { show: false },
    },
    yAxis: {
      type: 'value', scale: true, splitNumber: 4,
      axisLabel: { color: chartPalette.value.axis, fontSize: 14.5 },
      axisLine: { show: false }, axisTick: { show: false },
      splitLine: { lineStyle: { color: chartPalette.value.gridSoft, type: 'dashed' } },
    },
    series: [{
      type: 'line',
      data,
      smooth: 0.18,
      showSymbol: false,
      lineStyle: { width: 1.6, color: chartPalette.value.series.heart },
      areaStyle: { color: `${chartPalette.value.series.heart}1F` },
      connectNulls: false,
    }],
  };
});

const trendCards = computed(() => [
  {
    metric: 'resting_hr',
    label: t.value.restingLabel,
    hint: t.value.restingHint,
    color: chartPalette.value.series.readiness,
    unit: 'bpm',
    series: series.value.resting_hr ?? null,
  },
  {
    metric: 'hrv',
    label: 'HRV (SDNN)',
    hint: t.value.hrvHint,
    color: chartPalette.value.series.pace,
    unit: 'ms',
    series: series.value.hrv ?? null,
  },
  {
    metric: 'hrv_rmssd',
    label: 'HRV (RMSSD)',
    hint: t.value.rmssdHint,
    color: chartPalette.value.series.calories,
    unit: 'ms',
    series: series.value.hrv_rmssd ?? null,
  },
]);

const load = async (opts?: { trendsOnly?: boolean }) => {
  const seq = loadSeq.next();
  const trendsOnly = Boolean(opts?.trendsOnly);
  // trendsOnly's `day` slot resolves synchronously (Promise.resolve below),
  // so it can settle before an in-flight full load's real network fetch
  // does. The day/loading state must only ever be owned and cleared by a
  // full load, tracked on its own sequence, or a fast trends-only refresh
  // clears `loading` out from under the real fetch and the 24h chart goes
  // blank until the next remount.
  const daySeq = trendsOnly ? null : dayLoadSeq.next();
  if (daySeq !== null) loading.value = true;
  error.value = null;
  if (daySeq !== null) dayError.value = null;
  trendsError.value = null;
  extremesError.value = null;
  if (!isDesktop()) {
    if (!loadSeq.isCurrent(seq)) return;
    fullSeries.value = {};
    if (daySeq !== null) dayPoints.value = [];
    fullExtremes.value = [];
    if (daySeq !== null) loading.value = false;
    error.value = t.value.desktopOnly;
    return;
  }
  const [day, trends, extremes] = await Promise.allSettled([
    trendsOnly ? Promise.resolve(dayPoints.value) : backend.getHeartRateSeries(24),
    backend.getMetricSeries([...TREND_METRICS], SERIES_FETCH_DAYS),
    backend.getDailyHeartRateExtremes(SERIES_FETCH_DAYS),
  ]);
  const dayCommitted = daySeq !== null && dayLoadSeq.isCurrent(daySeq);
  if (dayCommitted) {
    dayPoints.value = day.status === 'fulfilled' ? day.value : [];
    dayError.value = day.status === 'rejected' ? toUserMessage(day.reason, t.value.dayFailed) : null;
    loading.value = false;
  }
  const trendsCommitted = loadSeq.isCurrent(seq);
  if (trendsCommitted) {
    fullSeries.value = trends.status === 'fulfilled' ? indexSeries(trends.value) : {};
    fullExtremes.value = extremes.status === 'fulfilled' ? extremes.value : [];
    trendsError.value = trends.status === 'rejected' ? toUserMessage(trends.reason, t.value.trendsFailed) : null;
    extremesError.value = extremes.status === 'rejected' ? toUserMessage(extremes.reason, t.value.dailyMaxFailed) : null;
  }
  if (dayCommitted || trendsCommitted) {
    error.value = dayError.value || trendsError.value || extremesError.value;
  }
};

/* 样本稀疏的那一天画成空心点。用不同的标记而不是干脆不画：那一天确实有
   读数，只是不足以称为「这一天的最高」——把它藏起来会让曲线看着更完整，
   而那正是这条功能要避免的事。 */
const dailyMaxChartOption = computed(() => {
  const rows = dailyExtremes.value;
  return {
    grid: { left: 40, right: 12, top: 28, bottom: 26 },
    legend: {
      data: [t.value.dailyMaxLegendMax, t.value.dailyMaxLegendAvg],
      top: 0,
      textStyle: { color: chartPalette.value.axis, fontSize: 14.5 },
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
      axisLabel: { color: chartPalette.value.axis, fontSize: 14.5, hideOverlap: true },
      axisTick: { show: false },
      axisLine: { lineStyle: { color: chartPalette.value.grid } },
    },
    yAxis: {
      type: 'value',
      scale: true,
      axisLabel: { color: chartPalette.value.axis, fontSize: 14.5 },
      axisLine: { show: false },
      axisTick: { show: false },
      splitLine: { lineStyle: { color: chartPalette.value.grid, type: 'dashed' } },
    },
    series: [
      {
        name: t.value.dailyMaxLegendMax,
        type: 'line',
        data: rows.map((row) => row.max),
        showSymbol: true,
        symbolSize: 6,
        lineStyle: { width: 2.2, color: chartPalette.value.series.heart },
        itemStyle: {
          color: (params: { dataIndex: number }) =>
            (rows[params.dataIndex]?.samples ?? 0) < SPARSE_SAMPLE_THRESHOLD
              ? 'transparent'
              : chartPalette.value.series.heart,
          borderColor: chartPalette.value.series.heart,
          borderWidth: 1.6,
        },
      },
      {
        name: t.value.dailyMaxLegendAvg,
        type: 'line',
        data: rows.map((row) => row.average),
        showSymbol: false,
        lineStyle: { width: 1.4, type: 'dashed', color: chartPalette.value.mark },
      },
    ],
  };
});

/* 和趋势卡同一条队：切范围时一帧只换一张图（见 useQueuedOption）。 */
const shownDailyMax = useQueuedOption(dailyMaxChartOption);

onMounted(() => { void load(); });
watch(dataRevision, () => { void load(); });

const trendsSummary = computed(() => trendCards.value.map((card) => card.label).join(' · '));
</script>

<template>
  <section class="page metric-page" aria-labelledby="hr-title">
    <PageHeader
      title-id="hr-title"
      :title="t.title"
      :intro="t.intro"
    />

    <div v-if="error" class="inline-alert" role="alert">
      <Icon name="warning" :size="14" />{{ error }}
      <button v-if="isDesktop()" class="button button-secondary retry" type="button" @click="() => load()">{{ t.retry }}</button>
    </div>

    <div v-if="initialLoading" class="stack" aria-live="polite" :aria-label="t.loadingAria">
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
          :key="CHART_THEME"
          :theme="CHART_THEME"
          :option="dayChartOption"
          autoresize
          role="img"
          :aria-label="t.chartAria"
        />
        <p v-else-if="dayError" class="inline-alert" role="alert">
          <Icon name="warning" :size="14" />{{ dayError }}
        </p>
        <p v-else class="inline-alert" role="status">
          <Icon name="info" :size="14" />{{ t.noSamples }}
        </p>
      </section>

      <!-- 24 小时曲线不跟这个开关走。放在大图下面，才不会让人以为
           切 7 天 / 1 个月会改那张全天图。 -->
      <div class="range-toolbar">
        <p class="range-label">{{ t.trendRangeLabel }}</p>
        <SegmentTrack
          :items="ranges.map((range) => ({ value: range.days, label: range.label }))"
          :model-value="rangeDays"
          :aria-label="t.rangeAria"
          @update:model-value="(value) => rangeDays = Number(value) as SeriesRangeDays"
        />
      </div>

      <!-- 每日最高心率、静息心率与 HRV 趋势直接摊开：点进这一页就是来看它们的。 -->
          <section class="surface-card day-card" :aria-label="t.dailyMaxAria">
            <header class="day-head">
              <div>
                <h2>{{ t.dailyMaxTitle }}</h2>
                <p>{{ t.dailyMaxSub }}</p>
              </div>
            </header>
            <SwapChart
              v-if="dailyExtremes.length"
              class="day-chart"
              :option="shownDailyMax"
              :aria-label="t.dailyMaxAria"
            />
            <p v-else-if="extremesError" class="inline-alert" role="alert">
              <Icon name="warning" :size="14" />{{ extremesError }}
            </p>
            <p v-else class="inline-alert" role="status">
              <Icon name="info" :size="14" />{{ t.dailyMaxNone }}
            </p>
            <p v-if="sparseDays" class="inline-alert" role="status">
              <Icon name="info" :size="14" />{{ t.dailyMaxSparse(sparseDays) }}
            </p>
            <p class="daily-max-note">{{ t.dailyMaxNote }}</p>
          </section>
        <SectionGroup :title="t.trendsTitle" :summary="trendsSummary" icon="resting-heart-rate" tone="heart">
          <p v-if="trendsError" class="inline-alert" role="alert">
            <Icon name="warning" :size="14" />{{ trendsError }}
          </p>
          <div class="trend-grid" :style="trendGridStyle(trendCards.length)">
            <MetricTrendCard
              v-for="card in trendCards"
              :key="card.metric"
              :label="card.label"
              :hint="card.hint"
              :series="card.series"
              :color="card.color"
              :unit="card.unit"
              :decimals="0"
              :empty-text="trendsError || t.emptyCard"
            />
          </div>
        </SectionGroup>

    </template>
  </section>
</template>

<style scoped src="./dayPanel.css"></style>
<style scoped src="./HeartRateDetail.css"></style>
