<script setup lang="ts">
import LifeEventShortcut from '../components/LifeEventShortcut.vue';
import { useFirstLoad } from '../composables/useFirstLoad';

defineOptions({ name: 'BodyStatus' });
import { computed, onMounted, ref, watch } from 'vue';
import { CHART_THEME, VChart } from '../lib/echartsSetup';
import { createLoadSeq } from '../lib/loadSeq';
import MetricTrendCard from '../components/MetricTrendCard.vue';
import FoldDeck from '../components/deck/FoldDeck.vue';
import PageHeader from '../components/PageHeader.vue';
import CoverageNotice from '../components/CoverageNotice.vue';
import SkeletonBlock from '../components/SkeletonBlock.vue';
import Icon from '../components/Icon.vue';
import SegmentTrack from '../components/SegmentTrack.vue';
import { useSyncController } from '../composables/useSyncController';
import { backend, isDesktop, toUserMessage } from '../lib/bridge';
import { indexSeries, seriesRanges, type SeriesRangeDays } from '../lib/metricSeries';
import { distanceUnit } from '../lib/units';
import type { MetricSeries } from '../types';
import { useMessages } from '../i18n';
import { bodyStatusMessages as messages } from './BodyStatus.i18n';
import { METRICS, buildBodyCards, convertSeries, groupOf, type CardGroup } from './body/bodyCards';
import { useBodyCharts } from '../composables/useBodyCharts';

const t = useMessages(messages);

const { dataRevision } = useSyncController();

const ranges = computed(() => seriesRanges());
const rangeDays = ref<SeriesRangeDays>(30);
const series = ref<Record<string, MetricSeries>>({});
const loading = ref(true);
const initialLoading = useFirstLoad(loading);
const loadSeq = createLoadSeq();
const error = ref<string | null>(null);

const CARDS = computed(() => buildBodyCards(t.value));
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

const {
  macroSplit, macroChartOption, stressPoints, curve, curveLatest, curveLowest, curveHighest, curveAverage, curveChartOption,
} = useBodyCharts(series);


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

const labelsOf = (list: { label: string }[], empty: string) => list.map((card) => card.label).join(' · ') || empty;
const foldCards = computed(() => [
  { id: 'vitals', title: t.value.vitalsGroupTitle, summary: labelsOf(vitalsCards.value, t.value.noneInRange), icon: 'recovery' as const, tone: 'heart' as const, framed: true },
  { id: 'body', title: t.value.bodyGroupTitle, summary: labelsOf(bodyCards.value, t.value.bodyGroupEmpty), icon: 'body-activity' as const, tone: 'activity' as const, framed: true },
  { id: 'intake', title: t.value.intakeGroupTitle, summary: labelsOf(intakeCards.value, t.value.intakeGroupEmpty), icon: 'manual-entry' as const, tone: 'training' as const, framed: true },
]);
</script>

<template>
  <section class="page body-page" aria-labelledby="body-title">
    <PageHeader
      back="/"
      :back-label="t.backToOverview"
      title-id="body-title"
      :title="t.title"
      :intro="t.intro"
    />

    <LifeEventShortcut :days="rangeDays" />

    <div v-if="error" class="inline-alert" role="alert">
      <Icon name="warning" :size="14" />{{ error }}
      <button v-if="isDesktop()" class="button button-secondary retry" type="button" @click="load">{{ t.retry }}</button>
    </div>

    <div v-if="initialLoading" class="card-grid" aria-live="polite" :aria-label="t.loadingAria">
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

      <!-- 首屏只留 24 小时压力曲线和范围开关；生命体征、体重体成分、饮食摄入收进卡包，点开飞出来。 -->
      <FoldDeck :cards="foldCards" :label="t.title">
        <template #vitals>
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
        </template>
        <template #body>
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
        </template>
        <template #intake>
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
      </FoldDeck>


    </template>
  </section>
</template>

<style scoped src="./BodyStatus.css"></style>
