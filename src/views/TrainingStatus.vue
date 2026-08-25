<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import VChart from 'vue-echarts';
import HeartRateZonePicker from '../components/HeartRateZonePicker.vue';
import MetricTrendCard from '../components/MetricTrendCard.vue';
import PageHeader from '../components/PageHeader.vue';
import SkeletonBlock from '../components/SkeletonBlock.vue';
import Icon from '../components/Icon.vue';
import { useSyncController } from '../composables/useSyncController';
import { backend, isDesktop, toUserMessage } from '../lib/bridge';
import { zeppSemanticColors } from '../lib/echartsTheme';
import {
  formatPaceSeconds,
  indexSeries,
  SERIES_RANGES,
  type SeriesRangeDays,
} from '../lib/metricSeries';
import type { MetricSeries, TrainingBalancePoint } from '../types';

const { dataRevision } = useSyncController();

const METRICS = [
  'vo2max',
  'training_load',
  'lactate_threshold_hr',
  'lactate_threshold_pace',
  'pai_daily',
];

const rangeDays = ref<SeriesRangeDays>(180);
const series = ref<Record<string, MetricSeries>>({});
const balance = ref<TrainingBalancePoint[]>([]);
const loading = ref(true);
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

const thresholdOption = computed(() => {
  const dates = thresholdDates.value;
  if (dates.length < 2) return null;
  const pick = (source: MetricSeries | null, date: string) =>
    source?.points.find((point) => point.date === date)?.value ?? null;
  return {
    animationDuration: 600,
    grid: { left: 46, right: 52, top: 24, bottom: 28 },
    legend: {
      data: ['阈值心率', '阈值配速'],
      top: 0,
      itemWidth: 14,
      itemHeight: 8,
      textStyle: { fontSize: 11 },
    },
    tooltip: {
      trigger: 'axis',
      formatter: (params: Array<{ axisValue: string; seriesName: string; value: number | null }>) => {
        if (!Array.isArray(params) || !params.length) return '';
        const lines = params
          .filter((item) => typeof item.value === 'number')
          .map((item) => item.seriesName === '阈值配速'
            ? `阈值配速 <b>${formatPaceSeconds(item.value)}</b> /km`
            : `阈值心率 <b>${Math.round(item.value as number)}</b> bpm`);
        return [params[0].axisValue, ...lines].join('<br>');
      },
    },
    xAxis: { type: 'category', data: dates, boundaryGap: false, axisLabel: { fontSize: 10, hideOverlap: true } },
    yAxis: [
      { type: 'value', scale: true, splitNumber: 3, axisLabel: { fontSize: 10, formatter: '{value} bpm' } },
      {
        type: 'value',
        scale: true,
        splitNumber: 3,
        // Faster is a smaller number of seconds, so the axis is inverted to
        // keep "better" pointing up like every other chart here.
        inverse: true,
        splitLine: { show: false },
        axisLabel: { fontSize: 10, formatter: (value: number) => formatPaceSeconds(value) },
      },
    ],
    series: [
      {
        name: '阈值心率',
        type: 'line',
        data: dates.map((date) => pick(thresholdHr.value, date)),
        connectNulls: true,
        showSymbol: true,
        symbolSize: 6,
        itemStyle: { color: zeppSemanticColors.heart },
        lineStyle: { width: 2, color: zeppSemanticColors.heart },
      },
      {
        name: '阈值配速',
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
    animationDuration: 600,
    grid: { left: 46, right: 46, top: 24, bottom: 28 },
    legend: {
      data: ['7 天负荷', '28 天周均', '急慢比'],
      top: 0,
      itemWidth: 14,
      itemHeight: 8,
      textStyle: { fontSize: 11 },
    },
    tooltip: {
      trigger: 'axis',
      formatter: (params: Array<{ axisValue: string; dataIndex: number }>) => {
        const index = Array.isArray(params) ? params[0]?.dataIndex : undefined;
        const point = typeof index === 'number' ? balance.value[index] : undefined;
        if (!point) return '';
        const ratio = typeof point.acute_chronic_ratio === 'number'
          ? `${point.acute_chronic_ratio.toFixed(2)}`
          : `—（28 天窗口只有 ${point.chronic_days_with_data} 天有数据）`;
        return [
          point.date,
          `7 天负荷 <b>${Math.round(point.acute_7d)}</b>（${point.acute_days_with_data}/7 天有数据）`,
          `28 天周均 <b>${Math.round(point.chronic_28d / 4)}</b>`,
          `急慢比 <b>${ratio}</b>`,
        ].join('<br>');
      },
    },
    xAxis: { type: 'category', data: dates, boundaryGap: false, axisLabel: { fontSize: 10, hideOverlap: true } },
    yAxis: [
      { type: 'value', scale: true, splitNumber: 3, axisLabel: { fontSize: 10 } },
      { type: 'value', scale: true, splitNumber: 3, splitLine: { show: false }, axisLabel: { fontSize: 10 } },
    ],
    series: [
      {
        name: '7 天负荷',
        type: 'line',
        data: balance.value.map((point) => point.acute_7d),
        showSymbol: false,
        smooth: 0.2,
        itemStyle: { color: zeppSemanticColors.training },
        lineStyle: { width: 2, color: zeppSemanticColors.training },
      },
      {
        name: '28 天周均',
        type: 'line',
        data: balance.value.map((point) => Math.round((point.chronic_28d / 4) * 10) / 10),
        showSymbol: false,
        smooth: 0.2,
        itemStyle: { color: zeppSemanticColors.cadence },
        lineStyle: { width: 2, type: 'dashed', color: zeppSemanticColors.cadence },
      },
      {
        name: '急慢比',
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
  loading.value = true;
  error.value = null;
  if (!isDesktop()) {
    series.value = {};
    balance.value = [];
    loading.value = false;
    error.value = '请使用桌面应用；浏览器预览不会读取账户数据。';
    return;
  }
  const results = await Promise.allSettled([
    backend.getMetricSeries(METRICS, rangeDays.value),
    // The balance chart is always a month: 28-day windows need at least that
    // much runway before a ratio exists at all.
    backend.getTrainingBalance(Math.max(28, rangeDays.value)),
  ]);
  const [metrics, trend] = results;
  series.value = metrics.status === 'fulfilled' ? indexSeries(metrics.value) : {};
  balance.value = trend.status === 'fulfilled' ? trend.value : [];
  const rejected = results.find((result) => result.status === 'rejected');
  if (rejected && rejected.status === 'rejected') {
    error.value = toUserMessage(rejected.reason, '训练状态数据暂时不可用');
  }
  loading.value = false;
};

onMounted(() => { void load(); });
watch(rangeDays, () => { void load(); });
watch(dataRevision, () => { void load(); });
</script>

<template>
  <section class="page training-page" aria-labelledby="training-title">
    <PageHeader
      title-id="training-title"
      eyebrow="训练状态"
      title="训练状态"
      intro="VO₂max、乳酸阈值、训练负荷与心率区间。全部读自已同步的记录，不做训练建议。"
    >
      <div class="range-switch" role="radiogroup" aria-label="时间范围">
        <button
          v-for="range in SERIES_RANGES"
          :key="range.days"
          type="button"
          role="radio"
          :aria-checked="rangeDays === range.days"
          :class="['range-pill', { 'is-on': rangeDays === range.days }]"
          @click="rangeDays = range.days"
        >{{ range.label }}</button>
      </div>
    </PageHeader>

    <p v-if="error" class="inline-alert" role="alert">
      <Icon name="warning" :size="14" />{{ error }}
      <button v-if="isDesktop()" class="button button-secondary retry" type="button" @click="load">重试</button>
    </p>

    <div v-if="loading" class="card-grid" aria-live="polite" aria-label="正在加载训练状态">
      <SkeletonBlock v-for="index in 4" :key="index" height="268px" />
    </div>

    <template v-else>
      <div class="card-grid">
        <MetricTrendCard
          label="VO₂max"
          hint="手表在户外跑步后估算的最大摄氧量"
          :series="vo2max"
          :color="zeppSemanticColors.vo2"
          unit="ml/kg/min"
          :decimals="1"
          empty-text="这段范围没有 VO₂max 记录；它只在户外跑步后更新。"
        />
        <MetricTrendCard
          label="训练负荷"
          hint="每天的运动负荷得分"
          :series="trainingLoad"
          :color="zeppSemanticColors.training"
          unit="load"
          empty-text="这段范围没有训练负荷记录。"
        />
        <MetricTrendCard
          label="PAI 活力指数"
          hint="滚动 7 天的个人活力指数"
          :series="pai"
          :color="zeppSemanticColors.calories"
          unit="PAI"
          empty-text="这段范围没有 PAI 记录。"
        />

        <section class="chart-card" aria-label="乳酸阈值">
          <header class="chart-head">
            <span class="chart-title">
              <strong>乳酸阈值</strong>
              <small>心率与配速，只在高强度跑步后更新</small>
            </span>
            <span v-if="thresholdHr?.latest || thresholdPace?.latest" class="chart-latest">
              <b>{{ thresholdHr?.latest ? Math.round(thresholdHr.latest.value) : '—' }}</b><i>bpm</i>
              <b>{{ formatPaceSeconds(thresholdPace?.latest?.value) }}</b><i>/km</i>
            </span>
          </header>
          <VChart
            v-if="thresholdOption"
            class="chart-body"
            theme="zeppbridge-dark"
            :option="thresholdOption"
            autoresize
            role="img"
            aria-label="乳酸阈值心率与配速曲线"
          />
          <p v-else-if="hasThreshold" class="chart-empty">
            这段范围只有 1 次阈值测量（{{ thresholdDates[0] }}），画不出趋势。
          </p>
          <p v-else class="chart-empty">这段范围没有乳酸阈值测量记录。</p>
        </section>
      </div>

      <section class="chart-card wide" aria-label="运动负荷平衡">
        <header class="chart-head">
          <span class="chart-title">
            <strong>运动负荷平衡</strong>
            <small>7 天负荷相对 28 天周均，即急性／慢性负荷比</small>
          </span>
          <span v-if="latestBalance" class="chart-latest">
            <b>{{ latestBalance.acute_chronic_ratio?.toFixed(2) ?? '—' }}</b><i>急慢比</i>
          </span>
        </header>
        <VChart
          v-if="balanceOption"
          class="chart-body tall"
          theme="zeppbridge-dark"
          :option="balanceOption"
          autoresize
          role="img"
          aria-label="7 天与 28 天训练负荷及急慢比曲线"
        />
        <p v-else class="chart-empty">训练负荷记录还不够画出这条曲线。</p>
        <p class="chart-note">
          急慢比 = 7 天负荷之和 ÷（28 天负荷之和 ÷ 4）。28 天窗口覆盖不足 21 天时不给比值，
          曲线在那里会断开——这是没算，不是等于零。
        </p>
      </section>

      <HeartRateZonePicker :days="Math.max(30, rangeDays)" :revision="dataRevision" />
    </template>
  </section>
</template>

<style scoped>
.training-page.page { display: grid; gap: var(--space-4); align-content: start; }
.range-switch { display: flex; gap: var(--space-1); padding: 4px; border-radius: var(--radius-sm); background: var(--surface-raised); }
.range-pill {
  min-height: 30px;
  padding: 5px 12px;
  border: 1px solid transparent;
  border-radius: var(--radius-sm);
  background: transparent;
  color: var(--muted);
  font-size: 12px;
  cursor: pointer;
}
.range-pill:hover { color: var(--ink); }
.range-pill.is-on { background: var(--accent); color: var(--accent-ink); font-weight: 600; }
.card-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(320px, 1fr)); gap: var(--space-4); }

.chart-card {
  display: flex;
  flex-direction: column;
  min-width: 0;
  padding: var(--space-4);
  border: 1px solid var(--line);
  border-radius: var(--radius-md);
  background: var(--surface);
}
.chart-card.wide { padding: var(--space-4) var(--space-6); }
.chart-head { display: flex; align-items: flex-start; justify-content: space-between; gap: var(--space-3); }
.chart-title { display: grid; gap: 2px; min-width: 0; }
.chart-title strong { color: var(--ink); font-size: 13px; font-weight: 700; }
.chart-title small { color: var(--subtle); font-size: 11px; }
.chart-latest { display: flex; align-items: baseline; gap: 4px; white-space: nowrap; }
.chart-latest b { color: var(--ink); font-family: var(--font-mono); font-size: 18px; font-variant-numeric: tabular-nums; }
.chart-latest i { margin-right: 6px; color: var(--subtle); font-size: 10px; font-style: normal; }
.chart-body { width: 100%; height: 172px; margin-top: var(--space-2); }
.chart-body.tall { height: 236px; }
.chart-empty {
  display: flex;
  align-items: center;
  min-height: 172px;
  margin: var(--space-2) 0 0;
  color: var(--subtle);
  font-size: 12px;
}
.chart-note { margin: var(--space-2) 0 0; color: var(--subtle); font-size: 11px; line-height: 1.7; }
.inline-alert {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  margin: 0;
  padding: 9px 13px;
  border: 1px solid var(--line);
  border-radius: var(--radius-md);
  background: var(--surface);
  color: var(--danger);
  font-size: 12px;
}
.retry { margin-left: auto; }
@media (max-width: 720px) {
  .card-grid { grid-template-columns: minmax(0, 1fr); }
  .chart-card.wide { padding: var(--space-4); }
}
</style>
