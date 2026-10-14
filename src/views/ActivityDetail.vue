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
import { useFirstLoad } from '../composables/useFirstLoad';
import MetricTrendCard from '../components/MetricTrendCard.vue';
import HourlyStepsCard from '../components/activity/HourlyStepsCard.vue';
import { trendGridStyle } from '../lib/trendGrid';
import PageHeader from '../components/PageHeader.vue';
import SkeletonBlock from '../components/SkeletonBlock.vue';
import Icon from '../components/Icon.vue';
import TrendRangeBar from '../components/TrendRangeBar.vue';
import MissingMetricsRow from '../components/MissingMetricsRow.vue';
import { useTrendRange } from '../composables/useTrendRange';
import { useSyncController } from '../composables/useSyncController';
import { isDesktop, toUserMessage } from '../lib/bridge';
import { activityPageQueries } from '../lib/pageQueries';
import { cached, peekAll } from '../lib/readCache';
import { afterMotion } from '../lib/motion/budget';
import { metricColor } from '../lib/metricTone';
import { metricInfo } from '../lib/metricInfo';
import { createLoadSeq } from '../lib/loadSeq';
import { indexSeries, sliceIndexed } from '../lib/metricSeries';
import { trackRangeSwap } from '../lib/chartSwap';
import { holdInPlace } from '../lib/motion/holdInPlace';
import type { MetricSeries } from '../types';
import { useMessages } from '../i18n';
import { activityDetailMessages } from './ActivityDetail.i18n';

const t = useMessages(activityDetailMessages);

const { dataRevision } = useSyncController();

interface ActivityCard {
  metric: string;
  label: string;
  color: string;
  unit: string;
  decimals?: number;
}


const CARDS = computed<ActivityCard[]>(() => [
  {
    metric: 'steps',
    label: t.value.stepsLabel,
    color: metricColor('steps'),
    unit: t.value.stepsUnit,
  },
  {
    metric: 'distance',
    label: t.value.distanceLabel,
    color: metricColor('distance'),
    unit: t.value.distanceUnit,
  },
  {
    metric: 'active_calories',
    label: t.value.caloriesLabel,
    color: metricColor('active_calories'),
    unit: t.value.caloriesUnit,
  },
  {
    metric: 'active_minutes',
    label: t.value.minutesLabel,
    color: metricColor('active_minutes'),
    unit: t.value.minutesUnit,
  },
]);

const rangeDays = useTrendRange();
/* 一次取最长那档，切范围只在本地切（lib/metricSeries.ts 的 sliceSeries）：点下去不用等查库。 */
const fullSeries = ref<Record<string, MetricSeries>>({});
const series = computed(() => sliceIndexed(fullSeries.value, rangeDays.value));
trackRangeSwap(rangeDays);
const loading = ref(true);
// 从概览点进来之前，这一页要的数据多半已经预先读好了（lib/pageQueries.ts）：第一帧就用它，不放骨架。
const preloaded = isDesktop() ? peekAll(activityPageQueries()) : null;
if (preloaded) {
  fullSeries.value = indexSeries(preloaded[0]);
  loading.value = false;
}
const initialLoading = useFirstLoad(loading);
const error = ref<string | null>(null);
const loadSeq = createLoadSeq();

const cards = computed(() => CARDS.value.map((card) => ({ ...card, series: series.value[card.metric] ?? null })));
const anyData = computed(() => cards.value.some((card) => (card.series?.points.length ?? 0) > 0));
/* 按整段（6 个月）有没有读数分两拨（U09）：有的照常画卡，一条都没有的收成一行。
   按整段而不是当前范围定，切 7 天时卡片不会增减、网格不会跳。 */
const everMeasured = (metric: string) => (fullSeries.value[metric]?.points.length ?? 0) > 0;
const shownCards = computed(() => cards.value.filter((card) => everMeasured(card.metric)));
const missingCards = computed(() => cards.value
  .filter((card) => !everMeasured(card.metric))
  .map((card) => ({ key: card.metric, label: card.label, detail: metricInfo(card.metric)?.what })));

const load = async () => {
  const seq = loadSeq.next();
  loading.value = true;
  error.value = null;
  if (!isDesktop()) {
    if (!loadSeq.isCurrent(seq)) return;
    fullSeries.value = {};
    loading.value = false;
    error.value = t.value.desktopOnly;
    return;
  }
  try {
    const next = indexSeries(
      await cached(activityPageQueries()[0]),
    );
    if (!loadSeq.isCurrent(seq)) return;
    fullSeries.value = next;
  } catch (cause) {
    if (!loadSeq.isCurrent(seq)) return;
    fullSeries.value = {};
    error.value = toUserMessage(cause, t.value.loadFailed);
  } finally {
    if (loadSeq.isCurrent(seq)) loading.value = false;
  }
};

// 第一帧用的是先前读好的数据：重读等形变放完再做，晚到的结果不在形变途中改页面（lib/motion/budget.ts）。
onMounted(() => { if (preloaded) afterMotion(() => { void load(); }); else void load(); });
watch(dataRevision, () => { void load(); });
</script>

<template>
  <section class="page metric-page" aria-labelledby="activity-title">
    <PageHeader
      title-id="activity-title"
      :title="t.title"
      :intro="t.intro"
    />

    <div v-if="error" class="inline-alert" role="alert">
      <Icon name="warning" :size="14" />{{ error }}
      <button v-if="isDesktop()" class="button button-secondary retry" type="button" @click="load">{{ t.retry }}</button>
    </div>

    <!-- 骨架换成内容时交叉淡化：骨架原地钉住淡掉，内容同时在底下出现（从卡展开进来时不等数据）。 -->
    <Transition name="skeleton-out" @before-leave="holdInPlace">
      <div v-if="initialLoading" class="trend-grid" aria-live="polite" :aria-label="t.loadingAria">
        <SkeletonBlock v-for="index in 4" :key="index" height="268px" />
      </div>
    </Transition>
    <template v-if="!initialLoading">
      <p v-if="!anyData && !error" class="inline-alert" role="status">
        <Icon name="info" :size="14" />
        {{ t.noneInRange }}
      </p>
      <TrendRangeBar />
      <!-- 每小时步数：旧通道的逐分钟记录为主（完整），官方授权的按小时汇总补缺。两边都没有时卡片自己说明。 -->
      <HourlyStepsCard :days="rangeDays" />
      <div v-if="shownCards.length" class="trend-grid" :style="trendGridStyle(shownCards.length)">
        <MetricTrendCard
          v-for="card in shownCards"
          :key="card.metric"
          :label="card.label"
          :info="card.metric"
          :series="card.series"
          :color="card.color"
          :unit="card.unit"
          :decimals="card.decimals ?? 0"
        />
      </div>
      <MissingMetricsRow :items="missingCards" />
    </template>
  </section>
</template>

<style scoped>
.metric-page.page { display: grid; gap: var(--space-4); align-content: start; }

/* 页面级的提示条：细线描边、无底无投影——卡片材质只给主信息区的卡。 */
.inline-alert { display: flex; align-items: center; gap: var(--space-2); margin: 0; padding: 9px 13px; border: 1px solid var(--mat-line); border-radius: var(--radius-md); color: var(--muted); font-size: var(--fs-sm); }
.inline-alert[role='alert'] { color: var(--danger); }
.retry { margin-left: auto; }
</style>
