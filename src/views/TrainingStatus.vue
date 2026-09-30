<script setup lang="ts">
import LifeEventShortcut from '../components/LifeEventShortcut.vue';
import { useFirstLoad } from '../composables/useFirstLoad';
defineOptions({ name: 'TrainingStatus' });
import { computed, onMounted, ref, watch } from 'vue';
import { createLoadSeq } from '../lib/loadSeq';
import HeartRateZonePicker from '../components/HeartRateZonePicker.vue';
import MetricTrendCard from '../components/MetricTrendCard.vue';
import SwapChart from '../components/SwapChart.vue';
import { trendGridStyle } from '../lib/trendGrid';
import { useQueuedOption } from '../composables/useQueuedOption';
import PageHeader from '../components/PageHeader.vue';
import CoverageNotice from '../components/CoverageNotice.vue';
import SkeletonBlock from '../components/SkeletonBlock.vue';
import Icon from '../components/Icon.vue';
import TrendRangeBar from '../components/TrendRangeBar.vue';
import MissingMetricsRow from '../components/MissingMetricsRow.vue';
import { useTrendRange } from '../composables/useTrendRange';
import { useSyncController } from '../composables/useSyncController';
import { backend, isDesktop, toUserMessage } from '../lib/bridge';
import { zeppSemanticColors } from '../lib/echartsTheme';
import {
  formatPaceSeconds,
  SERIES_FETCH_DAYS,
  indexSeries,
  sliceByDate,
  sliceIndexed,
} from '../lib/metricSeries';
import { trackRangeSwap } from '../lib/chartSwap';
import type { MetricSeries, TrainingBalancePoint } from '../types';
import { useMessages } from '../i18n';
import { paceUnitLabel } from '../lib/units';
import { coveredWindowValue } from '../lib/missingValues';
import { trainingStatusMessages as messages } from './TrainingStatus.i18n';

const t = useMessages(messages);

const { dataRevision } = useSyncController();

const METRICS = [
  'vo2max',
  'training_load',
  'lactate_threshold_hr',
  'lactate_threshold_pace',
  'pai_daily',
];

const rangeDays = useTrendRange();
/* 一次取最长那档，切范围只在本地切（见 lib/metricSeries.ts 的 sliceSeries）。 */
const fullSeries = ref<Record<string, MetricSeries>>({});
const fullBalance = ref<TrainingBalancePoint[]>([]);
const series = computed(() => sliceIndexed(fullSeries.value, rangeDays.value));
// 负荷平衡至少看一个月：28 天窗口要先有这么长的跑道才算得出比值。
const balance = computed(() => sliceByDate(fullBalance.value, Math.max(28, rangeDays.value)));
trackRangeSwap(rangeDays);
const loading = ref(true);
const initialLoading = useFirstLoad(loading);
const loadSeq = createLoadSeq();
const error = ref<string | null>(null);

const vo2max = computed(() => series.value.vo2max ?? null);
const trainingLoad = computed(() => series.value.training_load ?? null);
const pai = computed(() => series.value.pai_daily ?? null);
const thresholdHr = computed(() => series.value.lactate_threshold_hr ?? null);
const thresholdPace = computed(() => series.value.lactate_threshold_pace ?? null);

/**
 * Lactate threshold is measured a handful of times a year, so its two series
 * share one chart: separate cards would mostly show two nearly empty axes.
 */
const thresholdDates = computed(() => {
  const dates = new Set<string>();
  for (const point of thresholdHr.value?.points ?? []) dates.add(point.date);
  for (const point of thresholdPace.value?.points ?? []) dates.add(point.date);
  return [...dates].sort();
});
const hasThreshold = computed(() => thresholdDates.value.length > 0);

/* 近 6 个月一条读数都没有的卡收成一行（U09），把有数据的图（尤其心率区间）让进首屏。
   按整段定而不是按当前范围：切范围时卡片不增减。 */
const everMeasured = (...metrics: string[]) => metrics.some((metric) => (fullSeries.value[metric]?.points.length ?? 0) > 0);
const show = computed(() => ({
  vo2: everMeasured('vo2max'),
  load: everMeasured('training_load'),
  pai: everMeasured('pai_daily'),
  threshold: everMeasured('lactate_threshold_hr', 'lactate_threshold_pace'),
  balance: fullBalance.value.some((point) => point.acute_days_with_data > 0),
}));
const shownCardCount = computed(() => [show.value.vo2, show.value.load, show.value.pai, show.value.threshold].filter(Boolean).length);
const missing = computed(() => [
  !show.value.vo2 && { key: 'vo2', label: 'VO₂max', detail: t.value.vo2Hint },
  !show.value.load && { key: 'load', label: t.value.loadLabel, detail: t.value.loadHint },
  !show.value.pai && { key: 'pai', label: t.value.paiLabel, detail: t.value.paiHint },
  !show.value.threshold && { key: 'threshold', label: t.value.thresholdLabel, detail: t.value.thresholdHint },
  !show.value.balance && { key: 'balance', label: t.value.balanceLabel, detail: t.value.balanceEmpty },
].filter((item): item is { key: string; label: string; detail: string } => Boolean(item)));

const thresholdOption = computed(() => {
  const dates = thresholdDates.value;
  if (dates.length < 2) return null;
  const pick = (source: MetricSeries | null, date: string) =>
    source?.points.find((point) => point.date === date)?.value ?? null;
  return {
    grid: { left: 8, right: 12, top: 34, bottom: 8, containLabel: true },
    legend: {
      data: [t.value.thresholdHr, t.value.thresholdPace],
      top: 0,
      itemWidth: 14,
      itemHeight: 8,
      textStyle: { fontSize: 14.5 },
    },
    tooltip: {
      trigger: 'axis',
      // 用 seriesIndex 而不是 seriesName 判断是哪条线：名字要跟着界面语言
      // 变，拿它当标识符的话一切到英文，两条线就都会走 else 分支。
      formatter: (params: Array<{ axisValue: string; seriesIndex: number; value: number | null }>) => {
        if (!Array.isArray(params) || !params.length) return '';
        const lines = params
          .filter((item) => typeof item.value === 'number')
          .map((item) => (item.seriesIndex === 1
            ? t.value.thresholdPaceTooltip(formatPaceSeconds(item.value), paceUnitLabel())
            : t.value.thresholdHrTooltip(Math.round(item.value as number))));
        return [params[0].axisValue, ...lines].join('<br>');
      },
    },
    xAxis: { type: 'category', data: dates, boundaryGap: false, axisLabel: { fontSize: 14.5, hideOverlap: true } },
    yAxis: [
      // 两根轴刻度对齐（alignTicks）：左右两列数字落在同一条网格线上，不再一边 5 格一边 4 格。
      { type: 'value', scale: true, splitNumber: 3, alignTicks: true, axisLabel: { fontSize: 14.5, formatter: '{value} bpm' } },
      {
        type: 'value',
        scale: true,
        splitNumber: 3,
        alignTicks: true,
        // Faster is a smaller number of seconds, so the axis is inverted to
        // keep "better" pointing up like every other chart here.
        inverse: true,
        splitLine: { show: false },
        axisLabel: { fontSize: 14.5, formatter: (value: number) => formatPaceSeconds(value) },
      },
    ],
    series: [
      {
        name: t.value.thresholdHr,
        type: 'line',
        data: dates.map((date) => pick(thresholdHr.value, date)),
        connectNulls: true,
        showSymbol: true,
        symbolSize: 6,
        itemStyle: { color: zeppSemanticColors.heart },
        lineStyle: { width: 2, color: zeppSemanticColors.heart },
      },
      {
        name: t.value.thresholdPace,
        type: 'line',
        yAxisIndex: 1,
        data: dates.map((date) => pick(thresholdPace.value, date)),
        connectNulls: true,
        showSymbol: true,
        symbolSize: 6,
        itemStyle: { color: zeppSemanticColors.pace },
        lineStyle: { width: 2, color: zeppSemanticColors.pace },
      },
    ],
  };
});

const balanceOption = computed(() => {
  if (balance.value.length < 2) return null;
  const dates = balance.value.map((point) => point.date);
  return {
    grid: { left: 8, right: 12, top: 38, bottom: 8, containLabel: true },
    legend: {
      data: [t.value.acute7d, t.value.chronicWeekly, t.value.acuteChronic],
      top: 0,
      itemWidth: 14,
      itemHeight: 8,
      textStyle: { fontSize: 14.5 },
    },
    tooltip: {
      trigger: 'axis',
      formatter: (params: Array<{ axisValue: string; dataIndex: number }>) => {
        const index = Array.isArray(params) ? params[0]?.dataIndex : undefined;
        const point = typeof index === 'number' ? balance.value[index] : undefined;
        if (!point) return '';
        const ratio = typeof point.acute_chronic_ratio === 'number'
          ? `${point.acute_chronic_ratio.toFixed(2)}`
          : t.value.ratioMissing(point.chronic_days_with_data);
        const acute = coveredWindowValue(point.acute_7d, point.acute_days_with_data);
        const chronic = coveredWindowValue(
          Math.round((point.chronic_28d / 4) * 10) / 10,
          point.chronic_days_with_data,
        );
        return [
          point.date,
          t.value.acuteTooltip(
            acute === null ? t.value.notProvided : String(Math.round(acute)),
            point.acute_days_with_data,
          ),
          t.value.chronicTooltip(chronic === null ? t.value.notProvided : String(Math.round(chronic))),
          t.value.ratioTooltip(ratio),
        ].join('<br>');
      },
    },
    xAxis: { type: 'category', data: dates, boundaryGap: false, axisLabel: { fontSize: 14.5, hideOverlap: true } },
    yAxis: [
      { type: 'value', scale: true, splitNumber: 3, axisLabel: { fontSize: 14.5 } },
      { type: 'value', scale: true, splitNumber: 3, splitLine: { show: false }, axisLabel: { fontSize: 14.5 } },
    ],
    series: [
      {
        name: t.value.acute7d,
        type: 'line',
        data: balance.value.map((point) => coveredWindowValue(point.acute_7d, point.acute_days_with_data)),
        connectNulls: false,
        showSymbol: false,
        smooth: 0.2,
        itemStyle: { color: zeppSemanticColors.training },
        lineStyle: { width: 2, color: zeppSemanticColors.training },
      },
      {
        name: t.value.chronicWeekly,
        type: 'line',
        data: balance.value.map((point) => coveredWindowValue(
          Math.round((point.chronic_28d / 4) * 10) / 10,
          point.chronic_days_with_data,
        )),
        connectNulls: false,
        showSymbol: false,
        smooth: 0.2,
        itemStyle: { color: zeppSemanticColors.cadence },
        lineStyle: { width: 2, type: 'dashed', color: zeppSemanticColors.cadence },
      },
      {
        name: t.value.acuteChronic,
        type: 'line',
        yAxisIndex: 1,
        // A day whose chronic window is not covered carries no ratio, and the
        // line breaks there rather than pretending one was computed.
        data: balance.value.map((point) => point.acute_chronic_ratio ?? null),
        connectNulls: false,
        showSymbol: false,
        smooth: 0.2,
        itemStyle: { color: zeppSemanticColors.altitude },
        lineStyle: { width: 1.6, color: zeppSemanticColors.altitude },
      },
    ],
  };
});

const latestBalance = computed(() => {
  for (let index = balance.value.length - 1; index >= 0; index -= 1) {
    if (typeof balance.value[index].acute_chronic_ratio === 'number') return balance.value[index];
  }
  return balance.value[balance.value.length - 1] ?? null;
});

const load = async () => {
  const seq = loadSeq.next();
  loading.value = true;
  error.value = null;
  if (!isDesktop()) {
    if (!loadSeq.isCurrent(seq)) return;
    fullSeries.value = {};
    fullBalance.value = [];
    loading.value = false;
    error.value = t.value.desktopOnly;
    return;
  }
  const results = await Promise.allSettled([
    backend.getMetricSeries(METRICS, SERIES_FETCH_DAYS),
    backend.getTrainingBalance(Math.max(28, SERIES_FETCH_DAYS)),
  ]);
  if (!loadSeq.isCurrent(seq)) return;
  const [metrics, trend] = results;
  fullSeries.value = metrics.status === 'fulfilled' ? indexSeries(metrics.value) : {};
  fullBalance.value = trend.status === 'fulfilled' ? trend.value : [];
  const rejected = results.find((result) => result.status === 'rejected');
  if (rejected && rejected.status === 'rejected') {
    error.value = toUserMessage(rejected.reason, t.value.loadFailed);
  }
  loading.value = false;
};

/* 和趋势卡同一条队：切范围时一帧只换一张图（见 useQueuedOption）。 */
const shownThreshold = useQueuedOption(thresholdOption);
const shownBalance = useQueuedOption(balanceOption);

onMounted(() => { void load(); });
watch(dataRevision, () => { void load(); });

</script>

<template>
  <section class="page training-page" aria-labelledby="training-title">
    <PageHeader
      title-id="training-title"
      :title="t.title"
      :intro="t.intro"
    />

    <LifeEventShortcut :days="rangeDays" />
    <CoverageNotice :requested-days="rangeDays" />

    <p v-if="error" class="inline-alert" role="alert">
      <Icon name="warning" :size="14" />{{ error }}
      <button v-if="isDesktop()" class="button button-secondary retry" type="button" @click="load">{{ t.retry }}</button>
    </p>

    <div v-if="initialLoading" class="trend-grid" aria-live="polite" :aria-label="t.loadingAria">
      <SkeletonBlock v-for="index in 4" :key="index" height="268px" />
    </div>

    <template v-else>
      <TrendRangeBar />
      <div v-if="shownCardCount" class="trend-grid" :style="trendGridStyle(shownCardCount)">
        <MetricTrendCard
          v-if="show.vo2"
          label="VO₂max"
          :hint="t.vo2Hint"
          :series="vo2max"
          :color="zeppSemanticColors.vo2"
          unit="ml/kg/min"
          :decimals="1"
          :empty-text="t.vo2Empty"
        />
        <MetricTrendCard
          v-if="show.load"
          :label="t.loadLabel"
          :hint="t.loadHint"
          :series="trainingLoad"
          :color="zeppSemanticColors.training"
          :unit="t.loadUnit"
          :empty-text="t.loadEmpty"
        />
        <MetricTrendCard
          v-if="show.pai"
          :label="t.paiLabel"
          :hint="t.paiHint"
          :series="pai"
          :color="zeppSemanticColors.calories"
          unit="PAI"
          :empty-text="t.paiEmpty"
        />

        <!-- 乳酸阈有心率和配速两条线：和另外三张同一种卡（同样的卡头、同样对齐），
             只是最新读数和曲线换成自己的，平均/最低/最高那一行不给（两条线各一套会挤）。 -->
        <MetricTrendCard
          v-if="show.threshold"
          :label="t.thresholdLabel"
          :hint="t.thresholdHint"
          :series="thresholdHr"
          :color="zeppSemanticColors.heart"
          :empty-text="t.thresholdEmpty"
          hide-stats
        >
          <template #latest>
            <strong class="hr">{{ thresholdHr?.latest ? Math.round(thresholdHr.latest.value) : '—' }}</strong><small>bpm</small>
            <strong class="pace">{{ formatPaceSeconds(thresholdPace?.latest?.value) }}</strong><small>{{ paceUnitLabel() }}</small>
          </template>
          <template v-if="shownThreshold || hasThreshold" #chart>
            <SwapChart
              v-if="shownThreshold"
              :option="shownThreshold"
              :aria-label="t.thresholdChartAria"
            />
            <p v-else class="chart-empty">{{ t.thresholdOnce(thresholdDates[0]) }}</p>
          </template>
        </MetricTrendCard>
      </div>

      <MissingMetricsRow :items="missing" />

      <!-- 负荷平衡与心率区间直接摊开。 -->
          <section v-if="show.balance" class="chart-card wide" :aria-label="t.balanceLabel">
            <header class="chart-head">
              <span class="chart-title">
                <strong>{{ t.balanceLabel }}</strong>
                <small>{{ t.balanceHint }}</small>
              </span>
              <span v-if="latestBalance" class="chart-latest">
                <b>{{ latestBalance.acute_chronic_ratio?.toFixed(2) ?? '—' }}</b><i>{{ t.acuteChronic }}</i>
              </span>
            </header>
            <SwapChart
              v-if="shownBalance"
              class="chart-body tall"
              :option="shownBalance"
              :aria-label="t.balanceChartAria"
            />
            <p v-else class="chart-empty">{{ t.balanceEmpty }}</p>
            <p class="chart-note">{{ t.balanceNote }}</p>
          </section>
          <HeartRateZonePicker :days="Math.max(30, rangeDays)" :revision="dataRevision" />
    </template>
  </section>
</template>

<style scoped src="./TrainingStatus.css"></style>
