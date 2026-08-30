<script setup lang="ts">
defineOptions({ name: 'TrainingStatus' });
import { computed, onMounted, ref, watch } from 'vue';
import { VChart } from '../lib/echartsSetup';
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
  seriesRanges,
  type SeriesRangeDays,
} from '../lib/metricSeries';
import type { MetricSeries, TrainingBalancePoint } from '../types';
import { defineMessages, useMessages } from '../i18n';

const messages = defineMessages(
  {
    backToOverview: '返回概览',
    eyebrow: '训练状态',
    title: '训练状态',
    intro: 'VO₂max、乳酸阈值、训练负荷与心率区间。全部读自已同步的记录，不做训练建议。',
    rangeAria: '时间范围',
    desktopOnly: '请使用桌面应用；浏览器预览不会读取账户数据。',
    loadFailed: '训练状态数据暂时不可用',
    retry: '重试',
    loadingAria: '正在加载训练状态',
    vo2Hint: '手表在户外跑步后估算的最大摄氧量',
    vo2Empty: '这段范围没有 VO₂max 记录；它只在户外跑步后更新。',
    loadLabel: '训练负荷',
    loadHint: '每天的运动负荷得分',
    loadEmpty: '这段范围没有训练负荷记录。',
    paiLabel: 'PAI 活力指数',
    paiHint: '滚动 7 天的个人活力指数',
    paiEmpty: '这段范围没有 PAI 记录。',
    thresholdLabel: '乳酸阈值',
    thresholdHint: '心率与配速，只在高强度跑步后更新',
    thresholdHr: '阈值心率',
    thresholdPace: '阈值配速',
    thresholdChartAria: '乳酸阈值心率与配速曲线',
    thresholdOnce: (date: string) => `这段范围只有 1 次阈值测量（${date}），画不出趋势。`,
    thresholdEmpty: '这段范围没有乳酸阈值测量记录。',
    thresholdPaceTooltip: (value: string) => `阈值配速 <b>${value}</b> /km`,
    thresholdHrTooltip: (value: number) => `阈值心率 <b>${value}</b> bpm`,
    balanceLabel: '运动负荷平衡',
    balanceHint: '7 天负荷相对 28 天周均，即急性／慢性负荷比',
    balanceChartAria: '7 天与 28 天训练负荷及急慢比曲线',
    balanceEmpty: '训练负荷记录还不够画出这条曲线。',
    balanceNote: '急慢比 = 7 天负荷之和 ÷（28 天负荷之和 ÷ 4）。28 天窗口覆盖不足 21 天时不给比值，曲线在那里会断开——这是没算，不是等于零。',
    acute7d: '7 天负荷',
    chronicWeekly: '28 天周均',
    acuteChronic: '急慢比',
    ratioMissing: (days: number) => `—（28 天窗口只有 ${days} 天有数据）`,
    acuteTooltip: (value: number, days: number) => `7 天负荷 <b>${value}</b>（${days}/7 天有数据）`,
    chronicTooltip: (value: number) => `28 天周均 <b>${value}</b>`,
    ratioTooltip: (value: string) => `急慢比 <b>${value}</b>`,
  },
  {
    backToOverview: 'Back to overview',
    eyebrow: 'Training status',
    title: 'Training status',
    intro: 'VO₂max, lactate threshold, training load and heart rate zones. All read from synced records; no coaching advice.',
    rangeAria: 'Time range',
    desktopOnly: 'Use the desktop app. This browser preview reads no account data.',
    loadFailed: 'Training status data is unavailable right now',
    retry: 'Try again',
    loadingAria: 'Loading training status',
    vo2Hint: 'Maximal oxygen uptake, estimated by the watch after outdoor runs',
    vo2Empty: 'No VO₂max records in this range; it only updates after an outdoor run.',
    loadLabel: 'Training load',
    loadHint: 'Daily training load score',
    loadEmpty: 'No training load records in this range.',
    paiLabel: 'PAI',
    paiHint: 'Personal Activity Intelligence over a rolling 7 days',
    paiEmpty: 'No PAI records in this range.',
    thresholdLabel: 'Lactate threshold',
    thresholdHint: 'Heart rate and pace; only updates after a hard run',
    thresholdHr: 'Threshold HR',
    thresholdPace: 'Threshold pace',
    thresholdChartAria: 'Lactate threshold heart rate and pace',
    thresholdOnce: (date: string) => `Only one threshold measurement in this range (${date}), so there is no trend to draw.`,
    thresholdEmpty: 'No lactate threshold measurements in this range.',
    thresholdPaceTooltip: (value: string) => `Threshold pace <b>${value}</b> /km`,
    thresholdHrTooltip: (value: number) => `Threshold HR <b>${value}</b> bpm`,
    balanceLabel: 'Training load balance',
    balanceHint: '7-day load against the 28-day weekly average, i.e. the acute-to-chronic ratio',
    balanceChartAria: '7-day and 28-day training load with the acute-to-chronic ratio',
    balanceEmpty: 'Not enough training load records to draw this line yet.',
    balanceNote: 'Acute:chronic = sum of the last 7 days ÷ (sum of the last 28 days ÷ 4). When the 28-day window covers fewer than 21 days, no ratio is given and the line breaks there. That is uncomputed, not zero.',
    acute7d: '7-day load',
    chronicWeekly: '28-day weekly avg',
    acuteChronic: 'Acute:chronic',
    ratioMissing: (days: number) => `— (only ${days} days of data in the 28-day window)`,
    acuteTooltip: (value: number, days: number) => `7-day load <b>${value}</b> (${days}/7 days with data)`,
    chronicTooltip: (value: number) => `28-day weekly avg <b>${value}</b>`,
    ratioTooltip: (value: string) => `Acute:chronic <b>${value}</b>`,
  },
);
const t = useMessages(messages);

const { dataRevision } = useSyncController();

const METRICS = [
  'vo2max',
  'training_load',
  'lactate_threshold_hr',
  'lactate_threshold_pace',
  'pai_daily',
];

const ranges = computed(() => seriesRanges());
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
      data: [t.value.thresholdHr, t.value.thresholdPace],
      top: 0,
      itemWidth: 14,
      itemHeight: 8,
      textStyle: { fontSize: 11 },
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
            ? t.value.thresholdPaceTooltip(formatPaceSeconds(item.value))
            : t.value.thresholdHrTooltip(Math.round(item.value as number))));
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
    animationDuration: 600,
    grid: { left: 46, right: 46, top: 24, bottom: 28 },
    legend: {
      data: [t.value.acute7d, t.value.chronicWeekly, t.value.acuteChronic],
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
          : t.value.ratioMissing(point.chronic_days_with_data);
        return [
          point.date,
          t.value.acuteTooltip(Math.round(point.acute_7d), point.acute_days_with_data),
          t.value.chronicTooltip(Math.round(point.chronic_28d / 4)),
          t.value.ratioTooltip(ratio),
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
        name: t.value.acute7d,
        type: 'line',
        data: balance.value.map((point) => point.acute_7d),
        showSymbol: false,
        smooth: 0.2,
        itemStyle: { color: zeppSemanticColors.training },
        lineStyle: { width: 2, color: zeppSemanticColors.training },
      },
      {
        name: t.value.chronicWeekly,
        type: 'line',
        data: balance.value.map((point) => Math.round((point.chronic_28d / 4) * 10) / 10),
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
  loading.value = true;
  error.value = null;
  if (!isDesktop()) {
    series.value = {};
    balance.value = [];
    loading.value = false;
    error.value = t.value.desktopOnly;
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
    error.value = toUserMessage(rejected.reason, t.value.loadFailed);
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
      back="/"
      :back-label="t.backToOverview"
      title-id="training-title"
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

    <p v-if="error" class="inline-alert" role="alert">
      <Icon name="warning" :size="14" />{{ error }}
      <button v-if="isDesktop()" class="button button-secondary retry" type="button" @click="load">{{ t.retry }}</button>
    </p>

    <div v-if="loading" class="card-grid" aria-live="polite" :aria-label="t.loadingAria">
      <SkeletonBlock v-for="index in 4" :key="index" height="268px" />
    </div>

    <template v-else>
      <div class="card-grid">
        <MetricTrendCard
          label="VO₂max"
          :hint="t.vo2Hint"
          :series="vo2max"
          :color="zeppSemanticColors.vo2"
          unit="ml/kg/min"
          :decimals="1"
          :empty-text="t.vo2Empty"
        />
        <MetricTrendCard
          :label="t.loadLabel"
          :hint="t.loadHint"
          :series="trainingLoad"
          :color="zeppSemanticColors.training"
          unit="load"
          :empty-text="t.loadEmpty"
        />
        <MetricTrendCard
          :label="t.paiLabel"
          :hint="t.paiHint"
          :series="pai"
          :color="zeppSemanticColors.calories"
          unit="PAI"
          :empty-text="t.paiEmpty"
        />

        <section class="chart-card" :aria-label="t.thresholdLabel">
          <header class="chart-head">
            <span class="chart-title">
              <strong>{{ t.thresholdLabel }}</strong>
              <small>{{ t.thresholdHint }}</small>
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
            :aria-label="t.thresholdChartAria"
          />
          <p v-else-if="hasThreshold" class="chart-empty">
            {{ t.thresholdOnce(thresholdDates[0]) }}
          </p>
          <p v-else class="chart-empty">{{ t.thresholdEmpty }}</p>
        </section>
      </div>

      <section class="chart-card wide" :aria-label="t.balanceLabel">
        <header class="chart-head">
          <span class="chart-title">
            <strong>{{ t.balanceLabel }}</strong>
            <small>{{ t.balanceHint }}</small>
          </span>
          <span v-if="latestBalance" class="chart-latest">
            <b>{{ latestBalance.acute_chronic_ratio?.toFixed(2) ?? '—' }}</b><i>{{ t.acuteChronic }}</i>
          </span>
        </header>
        <VChart
          v-if="balanceOption"
          class="chart-body tall"
          theme="zeppbridge-dark"
          :option="balanceOption"
          autoresize
          role="img"
          :aria-label="t.balanceChartAria"
        />
        <p v-else class="chart-empty">{{ t.balanceEmpty }}</p>
        <p class="chart-note">{{ t.balanceNote }}</p>
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
