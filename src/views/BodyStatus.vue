<script setup lang="ts">
defineOptions({ name: 'BodyStatus' });
import { computed, onMounted, ref, watch } from 'vue';
import MetricTrendCard from '../components/MetricTrendCard.vue';
import PageHeader from '../components/PageHeader.vue';
import SkeletonBlock from '../components/SkeletonBlock.vue';
import Icon from '../components/Icon.vue';
import { useSyncController } from '../composables/useSyncController';
import { backend, isDesktop, toUserMessage } from '../lib/bridge';
import { zeppSemanticColors } from '../lib/echartsTheme';
import { indexSeries, seriesRanges, type SeriesRangeDays } from '../lib/metricSeries';
import type { MetricSeries } from '../types';
import { defineMessages, useMessages } from '../i18n';

const messages = defineMessages(
  {
    backToOverview: '返回概览',
    eyebrow: '身体状态',
    title: '身体状态',
    intro: '恢复、压力、血氧、HRV、呼吸率与静息心率的本机趋势。全部读自已同步的记录，没有推算。',
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
  },
  {
    backToOverview: 'Back to overview',
    eyebrow: 'Body status',
    title: 'Body status',
    intro: 'Local trends for readiness, stress, blood oxygen, HRV, respiratory rate and resting heart rate. All read from synced records, nothing extrapolated.',
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
]);

const ranges = computed(() => seriesRanges());
const rangeDays = ref<SeriesRangeDays>(30);
const series = ref<Record<string, MetricSeries>>({});
const loading = ref(true);
const error = ref<string | null>(null);

const cards = computed(() => CARDS.value.map((card) => ({ ...card, series: series.value[card.metric] ?? null })));
const anyData = computed(() => cards.value.some((card) => (card.series?.points.length ?? 0) > 0));

const load = async () => {
  loading.value = true;
  error.value = null;
  if (!isDesktop()) {
    series.value = {};
    loading.value = false;
    error.value = t.value.desktopOnly;
    return;
  }
  try {
    series.value = indexSeries(
      await backend.getMetricSeries(METRICS, rangeDays.value),
    );
  } catch (cause) {
    series.value = {};
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
}
</style>
