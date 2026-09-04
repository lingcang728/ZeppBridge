<script setup lang="ts">
defineOptions({ name: 'BodyStatus' });
import { computed, onMounted, ref, watch } from 'vue';
import { VChart } from '../lib/echartsSetup';
import MetricTrendCard from '../components/MetricTrendCard.vue';
import PageHeader from '../components/PageHeader.vue';
import CoverageNotice from '../components/CoverageNotice.vue';
import SkeletonBlock from '../components/SkeletonBlock.vue';
import Icon from '../components/Icon.vue';
import { useSyncController } from '../composables/useSyncController';
import { backend, isDesktop, toUserMessage } from '../lib/bridge';
import { zeppSemanticColors } from '../lib/echartsTheme';
import { indexSeries, seriesRanges, type SeriesRangeDays } from '../lib/metricSeries';
import { isFiniteNumber } from '../lib/format';
import {
  bodyHeightUnitLabel,
  bodyMassUnitLabel,
  distanceUnit,
  toBodyHeight,
  toBodyMass,
} from '../lib/units';
import type { MetricSeries, MetricSeriesPoint, StressPoint } from '../types';
import { defineMessages, intlLocale, useMessages } from '../i18n';

const messages = defineMessages(
  {
    backToOverview: '返回概览',
    eyebrow: '身体状态',
    title: '身体状态',
    intro: '恢复、压力、血氧、HRV、呼吸率、静息心率与体重体成分的本机趋势。全部读自已同步的记录，没有推算。',
    rangeAria: '时间范围',
    desktopOnly: '请使用桌面应用；浏览器预览不会读取账户数据。',
    loadFailed: '身体状态数据暂时不可用',
    retry: '重试',
    loadingAria: '正在加载身体状态',
    noneInRange: '这段范围没有身体状态记录。换个更长的范围，或先完成一次同步。',
    emptyCard: '这段范围没有记录。',
    readinessLabel: '恢复状态',
    readinessHint: '手表综合睡眠、HRV 与静息心率给出的准备度',
    stressLabel: '压力',
    stressHint: '全天压力平均值，阴影是当日实测区间',
    curveCardAria: '24 小时压力',
    curveTitle: '最近 24 小时压力',
    curveSub: '手表五分钟测一次，逐条读数按时间排列',
    curveChartAria: '最近 24 小时压力曲线',
    curveNoSamples: '最近 24 小时没有压力读数，所以这里不画曲线。手表没戴、或者没开全天压力监测时就是这样。',
    curveNote: '区间划分（放松 1–39、正常 40–59、中等 60–79、高 80–100）是 Zepp 自己的口径，不是我们算的。没有采样的时间不画线，也不补 0。',
    statLatest: '最新',
    statAverage: '平均',
    statLowest: '最低',
    statHighest: '最高',
    stressTooltip: (clock: string, value: number) => `${clock}　<b>${value}</b> 分`,
    spo2Label: '血氧',
    spo2Hint: '逐条血氧读数按天平均，阴影是当日实测区间',
    spo2Empty: '这段范围没有逐条血氧读数。',
    odiLabel: '夜间血氧 ODI',
    odiHint: '每小时血氧下降次数，越低越好',
    hrvHint: '心率变异性，逐次测量按天平均',
    rmssdHint: '夜间高频心率变异性，按天平均',
    respiratoryLabel: '呼吸率',
    respiratoryHint: '睡眠期间呼吸频率，阴影是当日实测区间',
    restingLabel: '静息心率',
    restingHint: 'ZeppBridge 按天统计的静息心率',
    unitScore: '分',
    unitPerHour: '次/时',
    unitBreathsPerMinute: '次/分',
    weightLabel: '体重',
    weightHint: '每次称重的读数，按天取平均；阴影是当日的实测区间',
    bmiLabel: 'BMI',
    bmiHint: '身体质量指数，由云端随体重一起给出',
    fatLabel: '体脂率',
    fatHint: '需要体脂秤。手表和手动录入的体重不带这一项',
    muscleLabel: '肌肉量',
    muscleHint: '需要体脂秤',
    waterLabel: '体水分率',
    waterHint: '需要体脂秤',
    boneLabel: '骨量',
    boneHint: '需要体脂秤',
    visceralLabel: '内脏脂肪',
    visceralHint: '等级而非百分比，Zepp 的口径是 1–30',
    bmrLabel: '基础代谢',
    bmrHint: '需要体脂秤',
    heightLabel: '身高',
    heightHint: '资料值，随每条称重记录一起回传，不是当次测量',
    unitGrade: '级',
    unitKcalPerDay: '千卡/天',
    scaleEmpty: '这段范围没有称重记录。体重秤的数据会在同步后出现在这里。',
  },
  {
    backToOverview: 'Back to overview',
    eyebrow: 'Body status',
    title: 'Body status',
    intro: 'Local trends for readiness, stress, blood oxygen, HRV, respiratory rate, resting heart rate and body composition. All read from synced records, nothing extrapolated.',
    rangeAria: 'Time range',
    desktopOnly: 'Use the desktop app. This browser preview reads no account data.',
    loadFailed: 'Body status data is unavailable right now',
    retry: 'Try again',
    loadingAria: 'Loading body status',
    noneInRange: 'No body status records in this range. Try a longer range, or run a sync first.',
    emptyCard: 'Nothing recorded in this range.',
    readinessLabel: 'Readiness',
    readinessHint: 'The watch weighs sleep, HRV and resting heart rate into one score',
    stressLabel: 'Stress',
    stressHint: 'All-day average; the shaded band is that day\'s measured range',
    curveCardAria: '24-hour stress',
    curveTitle: 'Last 24 hours',
    curveSub: 'The watch measures every five minutes; individual readings in time order',
    curveChartAria: 'Stress over the last 24 hours',
    curveNoSamples: 'No stress readings in the last 24 hours, so there is no curve to draw. That is what an unworn watch, or all-day monitoring switched off, looks like.',
    curveNote: 'The bands (relaxed 1-39, normal 40-59, medium 60-79, high 80-100) are Zepp’s own, not ours. Time with no readings is left blank rather than filled with zeros.',
    statLatest: 'Latest',
    statAverage: 'Average',
    statLowest: 'Lowest',
    statHighest: 'Highest',
    stressTooltip: (clock: string, value: number) => `${clock}　<b>${value}</b>`,
    spo2Label: 'Blood oxygen',
    spo2Hint: 'Individual SpO2 readings averaged per day; the band is that day\'s measured range',
    spo2Empty: 'No individual SpO2 readings in this range.',
    odiLabel: 'Nighttime SpO2 ODI',
    odiHint: 'Desaturations per hour; lower is better',
    hrvHint: 'Heart rate variability, individual measurements averaged per day',
    rmssdHint: 'Nighttime high-frequency variability, averaged per day',
    respiratoryLabel: 'Respiratory rate',
    respiratoryHint: 'Breathing rate during sleep; the band is that day\'s measured range',
    restingLabel: 'Resting heart rate',
    restingHint: 'Resting heart rate as ZeppBridge computes it per day',
    unitScore: 'pts',
    unitPerHour: '/hr',
    unitBreathsPerMinute: 'br/min',
    weightLabel: 'Weight',
    weightHint: 'Each weigh-in, averaged per day; the band is that day\'s measured range',
    bmiLabel: 'BMI',
    bmiHint: 'Body mass index, sent by the cloud alongside the weight',
    fatLabel: 'Body fat',
    fatHint: 'Needs a body-composition scale. Watch and hand-entered weights carry no fat reading',
    muscleLabel: 'Muscle mass',
    muscleHint: 'Needs a body-composition scale',
    waterLabel: 'Body water',
    waterHint: 'Needs a body-composition scale',
    boneLabel: 'Bone mass',
    boneHint: 'Needs a body-composition scale',
    visceralLabel: 'Visceral fat',
    visceralHint: 'A grade, not a percentage. Zepp scores it 1-30',
    bmrLabel: 'Basal metabolism',
    bmrHint: 'Needs a body-composition scale',
    heightLabel: 'Height',
    heightHint: 'Profile data echoed back with every weigh-in, not a measurement of the day',
    unitGrade: 'grade',
    unitKcalPerDay: 'kcal/day',
    scaleEmpty: 'No weigh-ins in this range. Scale readings show up here after a sync.',
  },
);
const t = useMessages(messages);

const { dataRevision } = useSyncController();

interface BodyCard {
  metric: string;
  label: string;
  hint: string;
  color: string;
  unit: string;
  decimals?: number;
  showSpread?: boolean;
  emptyText?: string;
  /**
   * 显示前的换算。只有体重系需要：库里一律是千克和厘米（导出契约不变），
   * 界面按用户选的单位制显示。返回 `undefined` 表示不换算。
   */
  convert?: (value: number) => number;
}

/**
 * Everything on this screen already sits in the local library — this page is
 * presentation, not collection. The list is fixed so the backend can refuse
 * any name it does not have a unit for.
 */
const METRICS = [
  'readiness',
  'stress',
  'spo2',
  'spo2_odi',
  'hrv',
  'hrv_rmssd',
  'respiratory_rate',
  'resting_hr',
  // 体重与体成分。前三项在真实账号上核对过；后面几项要有体脂秤才会有值，
  // 没有秤的账号在这里看到的就是空卡片——那是事实，不是故障。
  'weight',
  'bmi',
  'body_fat_rate',
  'muscle_mass',
  'body_water_rate',
  'bone_mass',
  'visceral_fat',
  'bmr',
  'height',
];

const CARDS = computed<BodyCard[]>(() => [
  {
    metric: 'readiness',
    label: t.value.readinessLabel,
    hint: t.value.readinessHint,
    color: zeppSemanticColors.readiness,
    unit: t.value.unitScore,
  },
  {
    metric: 'stress',
    label: t.value.stressLabel,
    hint: t.value.stressHint,
    color: zeppSemanticColors.calories,
    unit: t.value.unitScore,
    showSpread: true,
  },
  {
    metric: 'spo2',
    label: t.value.spo2Label,
    hint: t.value.spo2Hint,
    color: zeppSemanticColors.pace,
    unit: '%',
    showSpread: true,
    emptyText: t.value.spo2Empty,
  },
  {
    metric: 'spo2_odi',
    label: t.value.odiLabel,
    hint: t.value.odiHint,
    color: zeppSemanticColors.altitude,
    unit: t.value.unitPerHour,
    decimals: 1,
  },
  {
    metric: 'hrv',
    label: 'HRV (SDNN)',
    hint: t.value.hrvHint,
    color: zeppSemanticColors.stride,
    unit: 'ms',
    showSpread: true,
  },
  {
    metric: 'hrv_rmssd',
    label: 'HRV (RMSSD)',
    hint: t.value.rmssdHint,
    color: zeppSemanticColors.sleep.light,
    unit: 'ms',
    showSpread: true,
  },
  {
    metric: 'respiratory_rate',
    label: t.value.respiratoryLabel,
    hint: t.value.respiratoryHint,
    color: zeppSemanticColors.sleep.rem,
    unit: t.value.unitBreathsPerMinute,
    decimals: 1,
    showSpread: true,
  },
  {
    metric: 'resting_hr',
    label: t.value.restingLabel,
    hint: t.value.restingHint,
    color: zeppSemanticColors.heart,
    unit: 'bpm',
  },
  {
    metric: 'weight',
    label: t.value.weightLabel,
    hint: t.value.weightHint,
    color: zeppSemanticColors.distance,
    unit: bodyMassUnitLabel(),
    decimals: 1,
    showSpread: true,
    emptyText: t.value.scaleEmpty,
    convert: toBodyMass,
  },
  {
    metric: 'bmi',
    label: t.value.bmiLabel,
    hint: t.value.bmiHint,
    color: zeppSemanticColors.distance,
    // BMI 是个比值，两种单位制下是同一个数，不换算。
    unit: '',
    decimals: 1,
    emptyText: t.value.scaleEmpty,
  },
  {
    metric: 'body_fat_rate',
    label: t.value.fatLabel,
    hint: t.value.fatHint,
    color: zeppSemanticColors.calories,
    unit: '%',
    decimals: 1,
    showSpread: true,
  },
  {
    metric: 'muscle_mass',
    label: t.value.muscleLabel,
    hint: t.value.muscleHint,
    color: zeppSemanticColors.stride,
    unit: bodyMassUnitLabel(),
    decimals: 1,
    convert: toBodyMass,
  },
  {
    metric: 'body_water_rate',
    label: t.value.waterLabel,
    hint: t.value.waterHint,
    color: zeppSemanticColors.pace,
    unit: '%',
    decimals: 1,
  },
  {
    metric: 'bone_mass',
    label: t.value.boneLabel,
    hint: t.value.boneHint,
    color: zeppSemanticColors.altitude,
    unit: bodyMassUnitLabel(),
    decimals: 2,
    convert: toBodyMass,
  },
  {
    metric: 'visceral_fat',
    label: t.value.visceralLabel,
    hint: t.value.visceralHint,
    color: zeppSemanticColors.calories,
    unit: t.value.unitGrade,
  },
  {
    metric: 'bmr',
    label: t.value.bmrLabel,
    hint: t.value.bmrHint,
    color: zeppSemanticColors.calories,
    unit: t.value.unitKcalPerDay,
  },
  {
    metric: 'height',
    label: t.value.heightLabel,
    hint: t.value.heightHint,
    color: zeppSemanticColors.altitude,
    unit: bodyHeightUnitLabel(),
    decimals: 1,
    convert: toBodyHeight,
  },
]);

const ranges = computed(() => seriesRanges());
const rangeDays = ref<SeriesRangeDays>(30);
const series = ref<Record<string, MetricSeries>>({});
const loading = ref(true);
const error = ref<string | null>(null);

/**
 * 换算整条序列，包括 min/max/latest 和那三个汇总值。
 *
 * 漏掉其中任何一个都会出现「曲线是磅、下面的平均值还是千克」这种同一张卡上
 * 自相矛盾的读数，而那比只有公制要糟得多——用户不会怀疑它，只会照着用。
 */
const convertSeries = (
  source: MetricSeries | null,
  convert?: (value: number) => number,
): MetricSeries | null => {
  if (!source || !convert) return source;
  const num = (value: number | null | undefined): number | null | undefined =>
    isFiniteNumber(value) ? convert(value) : value;
  const point = (item: MetricSeriesPoint): MetricSeriesPoint => ({
    ...item,
    value: convert(item.value),
    min: num(item.min),
    max: num(item.max),
  });
  return {
    ...source,
    points: source.points.map(point),
    latest: source.latest ? point(source.latest) : source.latest,
    average: num(source.average) ?? null,
    minimum: num(source.minimum) ?? null,
    maximum: num(source.maximum) ?? null,
  };
};

const cards = computed(() => {
  // 单位制切换要让卡片重算：`toBodyMass` 读的是模块级的状态，Vue 看不见
  // 它变了，所以在这里显式依赖一次。
  void distanceUnit.value;
  return CARDS.value.map((card) => ({
    ...card,
    series: convertSeries(series.value[card.metric] ?? null, card.convert),
  }));
});
const anyData = computed(() => cards.value.some((card) => (card.series?.points.length ?? 0) > 0));

/*
 * 全天压力曲线。
 *
 * `all_day_stress` 每天都带着一条五分钟一个点的曲线，以前整条被丢掉，界面上
 * 只剩一天一个平均值——有用户因此报「压力不是 24/7」。这里画的就是那条曲线。
 */
const stressPoints = ref<StressPoint[]>([]);

const curve = computed(() => stressPoints.value
  .map((point) => ({ ts: new Date(point.timestamp).getTime(), value: point.value }))
  .filter((point) => Number.isFinite(point.ts) && isFiniteNumber(point.value)));

const curveLatest = computed(() => curve.value[curve.value.length - 1]?.value ?? null);
const curveLowest = computed(() => (curve.value.length
  ? Math.min(...curve.value.map((point) => point.value))
  : null));
const curveHighest = computed(() => (curve.value.length
  ? Math.max(...curve.value.map((point) => point.value))
  : null));
const curveAverage = computed(() => (curve.value.length
  ? Math.round(curve.value.reduce((total, point) => total + point.value, 0) / curve.value.length)
  : null));

const clock = (value: number) => new Intl.DateTimeFormat(intlLocale(), {
  hour: '2-digit', minute: '2-digit', hour12: false,
}).format(new Date(value));

/*
 * 曲线断开的阈值。
 *
 * 手表每五分钟测一次。没戴、关了全天监测、或者补拉没覆盖到的那几个小时，
 * 序列里就是没有点 —— 直接把缺口两端连起来，会画出一条从来没测过的直线。
 * 卡片脚注写的是「没采样的时段留空」，那就得真的留空：超过三个采样间隔就
 * 插一个 null，`connectNulls: false` 会让线在那里断开。
 *
 * 三个间隔而不是一个：五分钟一次只是标称值，实测相邻两点差 5–8 分钟很常见，
 * 卡到一个间隔会把正常曲线打成虚线。
 */
const CURVE_GAP_MS = 15 * 60 * 1000;

const curveChartOption = computed(() => {
  const data: Array<[number, number | null]> = [];
  curve.value.forEach((point, index) => {
    const previous = curve.value[index - 1];
    if (previous && point.ts - previous.ts > CURVE_GAP_MS) {
      data.push([previous.ts + 1, null]);
    }
    data.push([point.ts, point.value]);
  });
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
      formatter: (params: Array<{ value: [number, number | null] }>) => {
        const point = Array.isArray(params) ? params[0] : params;
        // 断点上没有读数，就不要报一个数出来。
        if (!point || !isFiniteNumber(point.value?.[1])) return '';
        return t.value.stressTooltip(clock(point.value[0]), Math.round(point.value[1]));
      },
    },
    xAxis: {
      type: 'time',
      min: curve.value[0]?.ts,
      max: curve.value[curve.value.length - 1]?.ts,
      axisLabel: { formatter: clock, hideOverlap: true, color: '#78818C', fontSize: 10 },
      axisLine: { lineStyle: { color: 'rgba(232,238,244,.12)' } },
      axisTick: { show: false },
      splitLine: { show: false },
    },
    // 量程钉死在 0–100。压力分数只有放在整条刻度上才有意义：自动缩放会
    // 把一个安稳的下午画成剧烈起伏的锯齿。
    yAxis: {
      type: 'value', min: 0, max: 100, splitNumber: 4,
      axisLabel: { color: '#78818C', fontSize: 10 },
      axisLine: { show: false }, axisTick: { show: false },
      splitLine: { lineStyle: { color: 'rgba(232,238,244,.08)', type: 'dashed' } },
    },
    series: [{
      type: 'line',
      data,
      smooth: 0.18,
      showSymbol: false,
      lineStyle: { width: 1.6, color: zeppSemanticColors.calories },
      areaStyle: { color: 'rgba(240,168,74,.12)' },
      connectNulls: false,
    }],
  };
});

const load = async () => {
  loading.value = true;
  error.value = null;
  if (!isDesktop()) {
    series.value = {};
    stressPoints.value = [];
    loading.value = false;
    error.value = t.value.desktopOnly;
    return;
  }
  try {
    // 一次拉两样：按天的趋势，和最近 24 小时的压力曲线。曲线的时间窗
    // 固定 24 小时，不跟着上面的范围切换器走——「最近一天」和「最近半年
    // 的趋势」问的不是同一个问题。
    const [daily, stress] = await Promise.all([
      backend.getMetricSeries(METRICS, rangeDays.value),
      backend.getStressSeries(24),
    ]);
    series.value = indexSeries(daily);
    stressPoints.value = stress;
  } catch (cause) {
    series.value = {};
    stressPoints.value = [];
    error.value = toUserMessage(cause, t.value.loadFailed);
  } finally {
    loading.value = false;
  }
};

onMounted(() => { void load(); });
watch(rangeDays, () => { void load(); });
watch(dataRevision, () => { void load(); });
</script>

<template>
  <section class="page body-page" aria-labelledby="body-title">
    <PageHeader
      back="/"
      :back-label="t.backToOverview"
      title-id="body-title"
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

    <CoverageNotice :requested-days="rangeDays" />

    <div v-if="error" class="inline-alert" role="alert">
      <Icon name="warning" :size="14" />{{ error }}
      <button v-if="isDesktop()" class="button button-secondary retry" type="button" @click="load">{{ t.retry }}</button>
    </div>

    <div v-if="loading" class="card-grid" aria-live="polite" :aria-label="t.loadingAria">
      <SkeletonBlock v-for="index in 6" :key="index" height="268px" />
    </div>
    <template v-else>
      <p v-if="!anyData && !error" class="inline-alert" role="status">
        <Icon name="info" :size="14" />
        {{ t.noneInRange }}
      </p>
      <section class="surface-card day-card" :aria-label="t.curveCardAria">
        <header class="day-head">
          <div>
            <h2>{{ t.curveTitle }}</h2>
            <p>{{ t.curveSub }}</p>
          </div>
          <dl class="day-stats">
            <div><dt>{{ t.statLatest }}</dt><dd>{{ curveLatest === null ? '—' : Math.round(curveLatest) }}</dd></div>
            <div><dt>{{ t.statAverage }}</dt><dd>{{ curveAverage === null ? '—' : curveAverage }}</dd></div>
            <div><dt>{{ t.statLowest }}</dt><dd>{{ curveLowest === null ? '—' : Math.round(curveLowest) }}</dd></div>
            <div><dt>{{ t.statHighest }}</dt><dd>{{ curveHighest === null ? '—' : Math.round(curveHighest) }}</dd></div>
          </dl>
        </header>
        <VChart
          v-if="curve.length"
          class="day-chart"
          :option="curveChartOption"
          autoresize
          role="img"
          :aria-label="t.curveChartAria"
        />
        <p v-else class="inline-alert" role="status">
          <Icon name="info" :size="14" />{{ t.curveNoSamples }}
        </p>
        <p class="curve-note">{{ t.curveNote }}</p>
      </section>

      <div class="card-grid">
        <MetricTrendCard
          v-for="card in cards"
          :key="card.metric"
          :label="card.label"
          :hint="card.hint"
          :series="card.series"
          :color="card.color"
          :unit="card.unit"
          :decimals="card.decimals ?? 0"
          :show-spread="card.showSpread ?? false"
          :empty-text="card.emptyText ?? t.emptyCard"
        />
      </div>
    </template>
  </section>
</template>

<style scoped>
.body-page.page { display: grid; gap: var(--space-4); align-content: start; }
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
.day-card { padding: 18px 20px; border: 1px solid var(--line); border-radius: var(--radius-md); background: var(--surface); }
.day-head { display: flex; flex-wrap: wrap; align-items: flex-start; justify-content: space-between; gap: 14px; margin-bottom: 12px; }
.day-head h2 { margin: 0 0 2px; font-size: 15px; font-weight: 700; color: var(--ink); }
.day-head p { margin: 0; color: var(--muted); font-size: 12px; }
.day-stats { display: flex; gap: 18px; margin: 0; }
.day-stats div { display: grid; gap: 2px; }
.day-stats dt { color: var(--subtle); font-size: 11px; }
.day-stats dd { margin: 0; color: var(--ink); font-size: 18px; font-weight: 700; font-family: var(--font-mono); }
.day-chart { width: 100%; height: 240px; }
/* 区间边界是手表给的，不是我们算的。不写清楚，它就会被当成又一套自选算法。 */
.curve-note { margin: 10px 0 0; color: var(--subtle); font-size: 11px; line-height: 1.6; }
.card-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(320px, 1fr)); gap: var(--space-4); }
.inline-alert {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  margin: 0;
  padding: 9px 13px;
  border: 1px solid var(--line);
  border-radius: var(--radius-md);
  background: var(--surface);
  color: var(--muted);
  font-size: 12px;
}
.inline-alert[role='alert'] { color: var(--danger); }
.retry { margin-left: auto; }
@media (max-width: 720px) {
  .card-grid { grid-template-columns: minmax(0, 1fr); }
  .day-stats { gap: 12px; }
}
</style>
