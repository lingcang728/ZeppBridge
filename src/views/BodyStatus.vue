<script setup lang="ts">
import LifeEventShortcut from '../components/LifeEventShortcut.vue';
import { useFirstLoad } from '../composables/useFirstLoad';

defineOptions({ name: 'BodyStatus' });
import { computed, onMounted, ref } from 'vue';
import { CHART_THEME, VChart } from '../lib/echartsSetup';
import { createLoadSeq } from '../lib/loadSeq';
import MetricTrendCard from '../components/MetricTrendCard.vue';
import { trendGridStyle } from '../lib/trendGrid';
import SectionGroup from '../components/SectionGroup.vue';
import PageHeader from '../components/PageHeader.vue';
import CoverageNotice from '../components/CoverageNotice.vue';
import OfficialOnlyNote from '../components/OfficialOnlyNote.vue';
import SkeletonBlock from '../components/SkeletonBlock.vue';
import Icon from '../components/Icon.vue';
import TrendRangeBar from '../components/TrendRangeBar.vue';
import MissingMetricsRow from '../components/MissingMetricsRow.vue';
import { useTrendRange } from '../composables/useTrendRange';
import { useRevisionReload } from '../composables/useRevisionReload';
import { backend, isDesktop, toUserMessage } from '../lib/bridge';
import { SERIES_FETCH_DAYS, indexSeries, sliceIndexed } from '../lib/metricSeries';
import { trackRangeSwap } from '../lib/chartSwap';
import { distanceUnit } from '../lib/units';
import { holdInPlace } from '../lib/motion/holdInPlace';
import type { MetricSeries } from '../types';
import { useMessages } from '../i18n';
import { bodyStatusMessages as messages } from './BodyStatus.i18n';
import { METRICS, buildBodyCards, convertSeries, groupOf, type CardGroup } from './body/bodyCards';
import { useBodyCharts } from '../composables/useBodyCharts';

const t = useMessages(messages);


const rangeDays = useTrendRange();
/** 一次取最长那档（6 个月），切范围只在本地从尾部切（sliceIndexed）——不再每切一次查一次库。 */
const fullSeries = ref<Record<string, MetricSeries>>({});
const series = computed(() => sliceIndexed(fullSeries.value, rangeDays.value));
trackRangeSwap(rangeDays);
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
  // 按整段（6 个月）有没有读数来定，而不是按当前范围：否则切到 7 天时有的卡消失、网格列数
  // 一变，剩下的卡整排瞬移。这段范围里没有读数的卡留着，自己说「近 7 天无记录」。
  .filter((card) => groupOf(card.metric) === group && (fullSeries.value[card.metric]?.points.length ?? 0) > 0);

const vitalsCards = computed(() => withData('vitals'));
/* 整组里有的有数、有的没有：没有的收成一行列出来（U09），不再悄悄消失，也不再占一整张空卡。
   整组都空时仍由组里那一句说明为什么。 */
const missingIn = (group: CardGroup, shown: number) => (shown === 0 && group !== 'vitals' ? [] : cards.value
  .filter((card) => groupOf(card.metric) === group && (fullSeries.value[card.metric]?.points.length ?? 0) === 0)
  .map((card) => ({ key: card.metric, label: card.label, detail: card.emptyText ?? card.hint })));
const missingVitals = computed(() => missingIn('vitals', vitalsCards.value.length));
const missingBody = computed(() => missingIn('body', bodyCards.value.length));
const missingIntake = computed(() => missingIn('intake', intakeCards.value.length));
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
    fullSeries.value = {};
    stressPoints.value = [];
    loading.value = false;
    error.value = t.value.desktopOnly;
    return;
  }
  // 一次拉两样：按天的趋势，和最近 24 小时的压力曲线。曲线的时间窗
  // 固定 24 小时，不跟着上面的范围切换器走——「最近一天」和「最近半年
  // 的趋势」问的不是同一个问题。
  // 两样互不依赖：24 小时压力取失败不能连带清掉半年趋势；失败的那一样保留
  // 上一次的结果，只在页头说一句。
  const [daily, stress] = await Promise.allSettled([
    backend.getMetricSeries(METRICS, SERIES_FETCH_DAYS),
    backend.getStressSeries(24),
  ]);
  if (!loadSeq.isCurrent(seq)) return;
  if (daily.status === 'fulfilled') fullSeries.value = indexSeries(daily.value);
  if (stress.status === 'fulfilled') stressPoints.value = stress.value;
  const rejected = [daily, stress].find((result) => result.status === 'rejected');
  if (rejected && rejected.status === 'rejected') error.value = toUserMessage(rejected.reason, t.value.loadFailed);
  loading.value = false;
};

onMounted(() => { void load(); });
useRevisionReload(() => { void load(); });

const labelsOf = (list: { label: string }[], empty: string) => list.map((card) => card.label).join(' · ') || empty;
const groups = computed(() => ({
  vitals: { title: t.value.vitalsGroupTitle, summary: labelsOf(vitalsCards.value, t.value.noneInRange) },
  // 空组下面已经有一句说明为什么空，标题下面就不再重复一遍。
  body: { title: t.value.bodyGroupTitle, summary: labelsOf(bodyCards.value, '') || undefined },
  intake: { title: t.value.intakeGroupTitle, summary: labelsOf(intakeCards.value, '') || undefined },
}));
</script>

<template>
  <section class="page body-page" aria-labelledby="body-title">
    <PageHeader
      title-id="body-title"
      :title="t.title"
      :intro="t.intro"
    />

    <OfficialOnlyNote />
    <LifeEventShortcut :days="rangeDays" />

    <div v-if="error" class="inline-alert" role="alert">
      <Icon name="warning" :size="14" />{{ error }}
      <button v-if="isDesktop()" class="button button-secondary retry" type="button" @click="() => load()">{{ t.retry }}</button>
    </div>

    <!-- 骨架换成内容时交叉淡化：骨架原地钉住淡掉，内容同时在底下出现（从卡展开进来时不等数据）。 -->
    <Transition name="skeleton-out" @before-leave="holdInPlace">
      <div v-if="initialLoading" class="trend-grid" aria-live="polite" :aria-label="t.loadingAria">
        <SkeletonBlock v-for="index in 6" :key="index" height="268px" />
      </div>
    </Transition>
    <template v-if="!initialLoading">
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
      <TrendRangeBar />
      <CoverageNotice :requested-days="rangeDays" />
      <p v-if="!anyData && !error" class="inline-alert" role="status">
        <Icon name="info" :size="14" />
        {{ t.noneInRange }}
      </p>

      <!-- 生命体征、体重体成分、饮食摄入三组直接摊开：点进这一页就是来看它们的。 -->
      <SectionGroup :title="groups.vitals.title" :summary="groups.vitals.summary" icon="recovery" tone="heart">
          <div v-if="vitalsCards.length" class="trend-grid" :style="trendGridStyle(vitalsCards.length)">
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
              :empty-text="card.emptyText"
            />
          </div>
          <MissingMetricsRow :items="missingVitals" />
      </SectionGroup>
      <SectionGroup :title="groups.body.title" :summary="groups.body.summary" icon="body-activity" tone="activity">
          <p v-if="!bodyCards.length" class="inline-alert" role="status">
            <Icon name="info" :size="14" />{{ t.bodyGroupEmpty }}
          </p>
          <div v-else class="trend-grid" :style="trendGridStyle(bodyCards.length)">
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
              :empty-text="card.emptyText"
            />
          </div>
          <MissingMetricsRow :items="missingBody" />
      </SectionGroup>
      <SectionGroup :title="groups.intake.title" :summary="groups.intake.summary" icon="manual-entry" tone="training">
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
            <div class="trend-grid" :style="trendGridStyle(intakeCards.length)">
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
                :empty-text="card.emptyText"
              />
            </div>
          </template>
          <MissingMetricsRow :items="missingIntake" />
      </SectionGroup>


    </template>
  </section>
</template>

<style scoped src="./dayPanel.css"></style>
<style scoped src="./BodyStatus.css"></style>
