<script setup lang="ts">
defineOptions({ name: 'ActivityDetail' });
/**
 * 日常活动二级界面（首页「今日步数」点进来的地方）。
 *
 * 首页只说了今天走了多少步，看不出「今天算多还是算少」。这一页把步数、距离、
 * 活动热量和活动时长按天摊开，和你自己此前的记录比，不和任何人群基准比。
 *
 * 没有记录的日期就是没有记录：曲线断开，不用 0 冒充「那天没动」。
 */
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

interface ActivityCard {
  metric: string;
  label: string;
  hint: string;
  color: string;
  unit: string;
  decimals?: number;
}

const CARDS: ActivityCard[] = [
  {
    metric: 'steps',
    label: '步数',
    hint: '手表按天汇总的步数',
    color: zeppSemanticColors.brand,
    unit: '步',
  },
  {
    metric: 'distance',
    label: '距离',
    hint: '当天累计移动距离',
    color: zeppSemanticColors.distance,
    unit: '米',
  },
  {
    metric: 'active_calories',
    label: '活动热量',
    hint: '不含基础代谢，只算活动消耗',
    color: zeppSemanticColors.calories,
    unit: '千卡',
  },
  {
    metric: 'active_minutes',
    label: '活动时长',
    hint: '手表判定为「在活动」的分钟数',
    color: zeppSemanticColors.readiness,
    unit: '分钟',
  },
];

const rangeDays = ref<SeriesRangeDays>(SERIES_RANGES[0].days);
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
    error.value = toUserMessage(cause, '日常活动数据暂时不可用');
  } finally {
    loading.value = false;
  }
};

onMounted(() => { void load(); });
watch(rangeDays, () => { void load(); });
watch(dataRevision, () => { void load(); });
</script>

<template>
  <section class="page metric-page" aria-labelledby="activity-title">
    <PageHeader
      back="/"
      back-label="返回概览"
      title-id="activity-title"
      eyebrow="日常活动"
      title="日常活动"
      intro="步数、距离、活动热量与活动时长的按天趋势。只和你自己此前的记录比较，没有记录的日期不补 0。"
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

    <div v-if="loading" class="card-grid" aria-live="polite" aria-label="正在加载日常活动">
      <SkeletonBlock v-for="index in 4" :key="index" height="268px" />
    </div>
    <template v-else>
      <p v-if="!anyData && !error" class="inline-alert" role="status">
        <Icon name="info" :size="14" />
        这段范围没有日常活动记录。换个更长的范围，或先完成一次同步。
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
          empty-text="这段范围没有记录。"
        />
      </div>
    </template>
  </section>
</template>

<style scoped>
.metric-page.page { display: grid; gap: var(--space-4); align-content: start; }
.range-switch { display: flex; gap: var(--space-1); padding: 4px; border-radius: var(--radius-sm); background: var(--surface-raised); }
.range-pill { min-height: 30px; padding: 5px 12px; border: 1px solid transparent; border-radius: var(--radius-sm); background: transparent; color: var(--muted); font-size: 12px; cursor: pointer; }
.range-pill:hover { color: var(--ink); }
.range-pill.is-on { background: var(--accent); color: var(--accent-ink); font-weight: 600; }
.card-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(320px, 1fr)); gap: var(--space-4); }
.inline-alert { display: flex; align-items: center; gap: var(--space-2); margin: 0; padding: 9px 13px; border: 1px solid var(--line); border-radius: var(--radius-md); background: var(--surface); color: var(--muted); font-size: 12px; }
.inline-alert[role='alert'] { color: var(--danger); }
.retry { margin-left: auto; }
@media (max-width: 720px) {
  .card-grid { grid-template-columns: minmax(0, 1fr); }
}
</style>
