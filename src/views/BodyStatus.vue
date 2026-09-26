<script setup lang="ts">
import LifeEventShortcut from '../components/LifeEventShortcut.vue';
import { displayDateTimeFormatter } from '../lib/dateTime';

defineOptions({ name: 'BodyStatus' });
import { computed, onMounted, ref, watch } from 'vue';
import { CHART_THEME, VChart, chartPalette } from '../lib/echartsSetup';
import { createLoadSeq } from '../lib/loadSeq';
import MetricTrendCard from '../components/MetricTrendCard.vue';
import PageHeader from '../components/PageHeader.vue';
import CoverageNotice from '../components/CoverageNotice.vue';
import SkeletonBlock from '../components/SkeletonBlock.vue';
import Icon from '../components/Icon.vue';
import SegmentTrack from '../components/SegmentTrack.vue';
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
import { useMessages } from '../i18n';
import { bodyStatusMessages as messages } from './BodyStatus.i18n';

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
  chart?: 'line' | 'bar';
  calendarAxis?: boolean;
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
const VITALS_METRICS = [
  'readiness',
  'stress',
  'spo2',
  'spo2_odi',
  'hrv',
  'hrv_rmssd',
  'respiratory_rate',
  'resting_hr',
];

/**
 * 体重与体成分。前三项在真实账号上核对过；后面几项要有体脂秤才会有值。
 *
 * 没有秤的账号**不会**在这里看到九张空卡片。这一版之前是那样的，理由是
 * 「空卡片是事实，不是故障」——事实没错，但九张一模一样的「近 180 天无记录」
 * 只是噪音，把真正有数据的东西挤到了屏幕外。现在没有数据的卡片直接不渲染，
 * 整组都空时留一句话说明为什么。**这不是补 0，也不是隐藏缺失**：缺的值仍然
 * 是缺的，只是不再用一张卡片来复述一遍。
 */
const BODY_METRICS = [
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

/**
 * 饮食。手动记录，所以天然是稀疏的——同样遵守上面那条：没有就不显示。
 *
 * 字段名（`calories` / `protein` / `fat` / `carbohydrate`）来自生态而不是我们
 * 见过的真实报文，所以「一条都没有」在这里是常态，不代表出错。
 */
const INTAKE_METRICS = ['intake_calories', 'intake_protein_g', 'intake_fat_g', 'intake_carbs_g'];

const METRICS = [...VITALS_METRICS, ...BODY_METRICS, ...INTAKE_METRICS];

type CardGroup = 'vitals' | 'body' | 'intake';

const groupOf = (metric: string): CardGroup => {
  if (INTAKE_METRICS.includes(metric)) return 'intake';
  if (BODY_METRICS.includes(metric)) return 'body';
  return 'vitals';
};

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
  // 摄入。柱状而不是折线，而且轴上保留没记的日子：手动记录一周漏两天是常态，
  // 折线会把中间那两天连成一条看不出断点的线，读起来像天天都记了。
  {
    metric: 'intake_calories',
    label: t.value.intakeCaloriesLabel,
    hint: t.value.intakeCaloriesHint,
    color: zeppSemanticColors.calories,
    unit: t.value.unitKcal,
    chart: 'bar',
    calendarAxis: true,
  },
  {
    metric: 'intake_protein_g',
    label: t.value.proteinLabel,
    hint: t.value.macroHint,
    color: zeppSemanticColors.stride,
    unit: t.value.unitGram,
    chart: 'bar',
    calendarAxis: true,
  },
  {
    metric: 'intake_fat_g',
    label: t.value.fatIntakeLabel,
    hint: t.value.macroHint,
    color: zeppSemanticColors.altitude,
    unit: t.value.unitGram,
    chart: 'bar',
    calendarAxis: true,
  },
  {
    metric: 'intake_carbs_g',
    label: t.value.carbsLabel,
    hint: t.value.macroHint,
    color: zeppSemanticColors.pace,
    unit: t.value.unitGram,
    chart: 'bar',
    calendarAxis: true,
  },
]);

const ranges = computed(() => seriesRanges());
const rangeDays = ref<SeriesRangeDays>(30);
const series = ref<Record<string, MetricSeries>>({});
const loading = ref(true);
const loadSeq = createLoadSeq();
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

/**
 * 只留这段范围里真的有读数的卡片。
 *
 * 没有体脂秤的账号以前会看到九张「近 180 天无记录」，没记过饮食的账号会再看到
 * 四张——十三张说着同一句话的卡片。缺失仍然是缺失，只是不再逐张复述：整组都
 * 空时下面用一句话说明为什么，而不是把它伪装成有内容。
 */
const withData = (group: CardGroup) => cards.value
  .filter((card) => groupOf(card.metric) === group && (card.series?.points.length ?? 0) > 0);

const vitalsCards = computed(() => cards.value.filter((card) => groupOf(card.metric) === 'vitals'));
const bodyCards = computed(() => withData('body'));
const intakeCards = computed(() => withData('intake'));

/**
 * 三大营养素各自贡献了多少热量。
 *
 * Zepp App 的「Food Trend Report」第一张卡就是这个环形图（碳水 / 蛋白质 /
 * 脂肪的百分比），所以这里跟着画。但那边的百分比是华米自己算的，这里的是
 * **我们**用 4/9/4（阿特沃特系数）从克数换算的——两边可能差一两个点，这不是
 * 谁错了，是两套算法。卡片上如实写明是推算。
 *
 * 三项克数缺任何一项就不画：拿两项算百分比会得到一个看着像真的、其实没有
 * 意义的数。
 */
const ENERGY_PER_GRAM = { protein: 4, fat: 9, carbs: 4 } as const;

const macroSplit = computed(() => {
  const average = (metric: string): number | null => {
    const value = series.value[metric]?.average;
    return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null;
  };
  const protein = average('intake_protein_g');
  const fat = average('intake_fat_g');
  const carbs = average('intake_carbs_g');
  if (protein === null || fat === null || carbs === null) return null;
  const energy = {
    carbs: carbs * ENERGY_PER_GRAM.carbs,
    protein: protein * ENERGY_PER_GRAM.protein,
    fat: fat * ENERGY_PER_GRAM.fat,
  };
  const total = energy.carbs + energy.protein + energy.fat;
  if (!(total > 0)) return null;
  return {
    total,
    slices: [
      { key: 'carbs', label: t.value.carbsLabel, value: energy.carbs, grams: carbs, color: zeppSemanticColors.pace },
      { key: 'protein', label: t.value.proteinLabel, value: energy.protein, grams: protein, color: zeppSemanticColors.stride },
      { key: 'fat', label: t.value.fatIntakeLabel, value: energy.fat, grams: fat, color: zeppSemanticColors.altitude },
    ].map((slice) => ({ ...slice, percent: Math.round((slice.value / total) * 100) })),
  };
});

const macroChartOption = computed(() => {
  const split = macroSplit.value;
  if (!split) return null;
  return {
    animationDuration: 600,
    tooltip: {
      trigger: 'item',
      formatter: (params: { name: string; percent: number; data: { grams: number } }) =>
        `${params.name}<br><b>${params.percent}%</b>　${t.value.gramsPerDay(Math.round(params.data.grams))}`,
    },
    series: [
      {
        type: 'pie',
        radius: ['58%', '82%'],
        avoidLabelOverlap: false,
        label: { show: false },
        labelLine: { show: false },
        data: split.slices.map((slice) => ({
          name: slice.label,
          value: slice.value,
          grams: slice.grams,
          itemStyle: { color: slice.color },
        })),
      },
    ],
  };
});

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

const clock = (value: number) => displayDateTimeFormatter({
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
      backgroundColor: chartPalette.value.tooltipBg,
      borderColor: chartPalette.value.tooltipBorder,
      borderWidth: 1,
      padding: [8, 12],
      textStyle: { color: chartPalette.value.tooltipText, fontSize: 15.5 },
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
      axisLabel: { formatter: clock, hideOverlap: true, color: chartPalette.value.axis, fontSize: 14.5 },
      axisLine: { lineStyle: { color: chartPalette.value.grid } },
      axisTick: { show: false },
      splitLine: { show: false },
    },
    // 量程钉死在 0–100。压力分数只有放在整条刻度上才有意义：自动缩放会
    // 把一个安稳的下午画成剧烈起伏的锯齿。
    yAxis: {
      type: 'value', min: 0, max: 100, splitNumber: 4,
      axisLabel: { color: chartPalette.value.axis, fontSize: 14.5 },
      axisLine: { show: false }, axisTick: { show: false },
      splitLine: { lineStyle: { color: chartPalette.value.gridSoft, type: 'dashed' } },
    },
    series: [{
      type: 'line',
      data,
      smooth: 0.18,
      showSymbol: false,
      lineStyle: { width: 1.6, color: zeppSemanticColors.calories },
      areaStyle: { color: `${chartPalette.value.series.calories}1F` },
      connectNulls: false,
    }],
  };
});

const load = async () => {
  const seq = loadSeq.next();
  loading.value = true;
  error.value = null;
  if (!isDesktop()) {
    if (!loadSeq.isCurrent(seq)) return;
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
    if (!loadSeq.isCurrent(seq)) return;
    series.value = indexSeries(daily);
    stressPoints.value = stress;
  } catch (cause) {
    if (!loadSeq.isCurrent(seq)) return;
    series.value = {};
    stressPoints.value = [];
    error.value = toUserMessage(cause, t.value.loadFailed);
  } finally {
    if (loadSeq.isCurrent(seq)) loading.value = false;
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
    />

    <LifeEventShortcut :days="rangeDays" />

    <div v-if="error" class="inline-alert" role="alert">
      <Icon name="warning" :size="14" />{{ error }}
      <button v-if="isDesktop()" class="button button-secondary retry" type="button" @click="load">{{ t.retry }}</button>
    </div>

    <div v-if="loading" class="card-grid" aria-live="polite" :aria-label="t.loadingAria">
      <SkeletonBlock v-for="index in 6" :key="index" height="268px" />
    </div>
    <template v-else>
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
          :key="CHART_THEME"
          :theme="CHART_THEME"
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

      <!-- 24 小时压力曲线不跟这个开关走。放在曲线下面，才不会让人以为
           切 7 天 / 1 个月会改那张大图。 -->
      <div class="range-toolbar">
        <p class="range-label">{{ t.trendRangeLabel }}</p>
        <SegmentTrack
          :items="ranges.map((range) => ({ value: range.days, label: range.label }))"
          :model-value="rangeDays"
          :aria-label="t.rangeAria"
          @update:model-value="(value) => rangeDays = Number(value) as SeriesRangeDays"
        />
      </div>
      <CoverageNotice :requested-days="rangeDays" />
      <p v-if="!anyData && !error" class="inline-alert" role="status">
        <Icon name="info" :size="14" />
        {{ t.noneInRange }}
      </p>

      <div class="card-grid">
        <MetricTrendCard
          v-for="card in vitalsCards"
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

      <!-- 体重与体成分。没有秤的账号这里只有一句话，而不是九张空卡片。 -->
      <h2 class="group-title">{{ t.bodyGroupTitle }}</h2>
      <p v-if="!bodyCards.length" class="inline-alert" role="status">
        <Icon name="info" :size="14" />{{ t.bodyGroupEmpty }}
      </p>
      <div v-else class="card-grid">
        <MetricTrendCard
          v-for="card in bodyCards"
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

      <!-- 摄入。同一条规则：没记过饮食就只有一句话。 -->
      <h2 class="group-title">{{ t.intakeGroupTitle }}</h2>
      <p v-if="!intakeCards.length" class="inline-alert" role="status">
        <Icon name="info" :size="14" />{{ t.intakeGroupEmpty }}
      </p>
      <template v-else>
        <section v-if="macroChartOption" class="surface-card day-card" :aria-label="t.macroTitle">
          <header class="day-head">
            <div>
              <h2>{{ t.macroTitle }}</h2>
              <p>{{ t.macroSub }}</p>
            </div>
            <dl class="day-stats">
              <div v-for="slice in macroSplit?.slices ?? []" :key="slice.key">
                <dt>{{ slice.label }}</dt>
                <dd :style="{ color: slice.color }">{{ slice.percent }}%</dd>
              </div>
            </dl>
          </header>
          <VChart
            class="macro-chart"
            :key="CHART_THEME"
            :theme="CHART_THEME"
            :option="macroChartOption"
            autoresize
            role="img"
            :aria-label="t.macroTitle"
          />
          <p class="curve-note">{{ t.macroNote }}</p>
        </section>
        <div class="card-grid">
          <MetricTrendCard
            v-for="card in intakeCards"
            :key="card.metric"
            :label="card.label"
            :hint="card.hint"
            :series="card.series"
            :color="card.color"
            :unit="card.unit"
            :decimals="card.decimals ?? 0"
            :chart="card.chart"
            :calendar-axis="card.calendarAxis ?? false"
            :empty-text="card.emptyText ?? t.emptyCard"
          />
        </div>
      </template>
    </template>
  </section>
</template>

<style scoped>
.body-page.page { display: grid; gap: var(--space-4); align-content: start; }
.range-toolbar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}
.range-label { margin: 0; color: var(--ink); font-size: var(--fs-sm); font-weight: 600; }

.day-card { padding: 18px 20px; border: 1px solid var(--mat-line); border-radius: var(--radius-md); background: var(--mat-card); box-shadow: var(--mat-rim), var(--mat-shadow); }
.day-head { display: flex; flex-wrap: wrap; align-items: flex-start; justify-content: space-between; gap: 14px; margin-bottom: 12px; }
.day-head h2 { margin: 0 0 2px; font-size: var(--fs-xl); font-weight: 700; color: var(--ink); }
.day-head p { margin: 0; color: var(--muted); font-size: var(--fs-sm); }
.day-stats { display: flex; gap: 18px; margin: 0; }
.day-stats div { display: grid; gap: 2px; }
.day-stats dt { color: var(--subtle); font-size: var(--fs-xs); }
.day-stats dd { margin: 0; color: var(--ink); font-size: var(--fs-3xl); font-weight: 700; font-family: var(--font-mono); }
.day-chart { width: 100%; height: 240px; }
/* 区间边界是手表给的，不是我们算的。不写清楚，它就会被当成又一套自选算法。 */
.curve-note { margin: 10px 0 0; color: var(--subtle); font-size: var(--fs-xs); line-height: 1.6; }
.card-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(320px, 1fr)); gap: var(--space-4); align-items: start; }
.group-title { margin: var(--space-6) 0 0; font-size: var(--fs-xl); font-weight: 700; color: var(--ink); }
.macro-chart { height: 200px; }
.inline-alert {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  margin: 0;
  padding: 9px 13px;
  border: 1px solid var(--mat-line);
  border-radius: var(--radius-md);
  background: var(--mat-card);
  color: var(--muted);
  font-size: var(--fs-sm); box-shadow: var(--mat-rim), var(--mat-shadow);
}
.inline-alert[role='alert'] { color: var(--danger); }
.retry { margin-left: auto; }
@media (max-width: 720px) {
  .card-grid { grid-template-columns: minmax(0, 1fr); }
  .day-stats { gap: 12px; }
}
</style>
