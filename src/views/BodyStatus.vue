<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import MetricTrendCard from '../components/MetricTrendCard.vue';
import PageHeader from '../components/PageHeader.vue';
import SkeletonBlock from '../components/SkeletonBlock.vue';
import Icon from '../components/Icon.vue';
import { useSyncController } from '../composables/useSyncController';
import { backend, isDesktop, toUserMessage } from '../lib/bridge';
import { zeppSemanticColors } from '../lib/echartsTheme';
import { indexSeries, SERIES_RANGES, type SeriesRangeDays } from '../lib/metricSeries';
import type { MetricSeries } from '../types';

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
const CARDS: BodyCard[] = [
  {
    metric: 'readiness',
    label: '恢复状态',
    hint: '手表综合睡眠、HRV 与静息心率给出的准备度',
    color: zeppSemanticColors.readiness,
    unit: '分',
  },
  {
    metric: 'stress',
    label: '压力',
    hint: '全天压力平均值，阴影是当日实测区间',
    color: zeppSemanticColors.calories,
    unit: '分',
    showSpread: true,
  },
  {
    metric: 'spo2',
    label: '血氧',
    hint: '逐条血氧读数按天平均，阴影是当日实测区间',
    color: zeppSemanticColors.pace,
    unit: '%',
    showSpread: true,
    emptyText: '这段范围没有逐条血氧读数。',
  },
  {
    metric: 'spo2_odi',
    label: '夜间血氧 ODI',
    hint: '每小时血氧下降次数，越低越好',
    color: zeppSemanticColors.altitude,
    unit: '次/时',
    decimals: 1,
  },
  {
    metric: 'hrv',
    label: 'HRV (SDNN)',
    hint: '心率变异性，逐次测量按天平均',
    color: zeppSemanticColors.stride,
    unit: 'ms',
    showSpread: true,
  },
  {
    metric: 'hrv_rmssd',
    label: 'HRV (RMSSD)',
    hint: '夜间高频心率变异性，按天平均',
    color: zeppSemanticColors.sleep.light,
    unit: 'ms',
    showSpread: true,
  },
  {
    metric: 'respiratory_rate',
    label: '呼吸率',
    hint: '睡眠期间呼吸频率，阴影是当日实测区间',
    color: zeppSemanticColors.sleep.rem,
    unit: '次/分',
    decimals: 1,
    showSpread: true,
  },
  {
    metric: 'resting_hr',
    label: '静息心率',
    hint: 'ZeppBridge 按天统计的静息心率',
    color: zeppSemanticColors.heart,
    unit: 'bpm',
  },
];

const rangeDays = ref<SeriesRangeDays>(30);
const series = ref<Record<string, MetricSeries>>({});
const loading = ref(true);
const error = ref<string | null>(null);

const cards = computed(() => CARDS.map((card) => ({ ...card, series: series.value[card.metric] ?? null })));
const anyData = computed(() => cards.value.some((card) => (card.series?.points.length ?? 0) > 0));

const load = async () => {
  loading.value = true;
  error.value = null;
  if (!isDesktop()) {
    series.value = {};
    loading.value = false;
    error.value = '请使用桌面应用；浏览器预览不会读取账户数据。';
    return;
  }
  try {
    series.value = indexSeries(
      await backend.getMetricSeries(CARDS.map((card) => card.metric), rangeDays.value),
    );
  } catch (cause) {
    series.value = {};
    error.value = toUserMessage(cause, '身体状态数据暂时不可用');
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
      title-id="body-title"
      eyebrow="身体状态"
      title="身体状态"
      intro="恢复、压力、血氧、HRV、呼吸率与静息心率的本机趋势。全部读自已同步的记录，没有推算。"
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

    <div v-if="error" class="inline-alert" role="alert">
      <Icon name="warning" :size="14" />{{ error }}
      <button v-if="isDesktop()" class="button button-secondary retry" type="button" @click="load">重试</button>
    </div>

    <div v-if="loading" class="card-grid" aria-live="polite" aria-label="正在加载身体状态">
      <SkeletonBlock v-for="index in 6" :key="index" height="268px" />
    </div>
    <template v-else>
      <p v-if="!anyData && !error" class="inline-alert" role="status">
        <Icon name="info" :size="14" />
        这段范围没有身体状态记录。换个更长的范围，或先完成一次同步。
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
          :empty-text="card.emptyText ?? '这段范围没有记录。'"
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
