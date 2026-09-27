<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import { CHART_THEME, VChart, chartPalette } from '../lib/echartsSetup';
import Icon from '../components/Icon.vue';
import FoldDeck from '../components/deck/FoldDeck.vue';
import CircularProgress from '../components/CircularProgress.vue';
import StageBar from '../components/StageBar.vue';
import { sleepStageLabel, sleepStageLabels } from '../lib/sleepStages';
import { useMessages } from '../i18n';

const t = useMessages(messages);
import EmptyState from '../components/EmptyState.vue';
import { useSyncController } from '../composables/useSyncController';
import { useDevices } from '../composables/useDevices';
import { dataProviderLabel, dataScopeLabel } from '../lib/labels';
import { isTauri, tauriApi, toUserMessage } from '../composables/useTauriApi';
import { formatDate, formatDateTime, formatDuration, formatTime, isFiniteNumber } from '../lib/format';
import { minutesToHours } from '../lib/missingValues';
import type { DeviceProfile, SleepSession } from '../types';
import { sleepDetailMessages as messages } from './SleepDetail.i18n';

const route = useRoute();
const { appStatus, dataRevision } = useSyncController();
const { maskIdentifier } = useDevices();
const session = ref<SleepSession | null>(null);
const weekSessions = ref<SleepSession[]>([]);
const device = ref<DeviceProfile>({});
const loading = ref(true);
const error = ref<string | null>(null);
const sleepId = computed(() => String(route.params.sleepId || ''));

const stages = computed(() => session.value ? [
  { label: sleepStageLabel('deep'), minutes: session.value.deep_minutes, tone: 'deep' as const },
  { label: sleepStageLabel('light'), minutes: session.value.light_minutes, tone: 'light' as const },
  { label: sleepStageLabel('rem'), minutes: session.value.rem_minutes, tone: 'rem' as const },
  { label: sleepStageLabel('awake'), minutes: session.value.awake_minutes, tone: 'awake' as const },
] : []);

const score = computed(() => {
  const value = session.value?.score;
  return isFiniteNumber(value) ? value : null;
});

const timeInBedLabel = computed(() => {
  const minutes = session.value?.time_in_bed_minutes;
  return isFiniteNumber(minutes) ? formatDuration(minutes, t.value.notProvided) : t.value.notProvided;
});

const syncTimeLabel = computed(() => {
  if (session.value?.synced_at) return formatDateTime(session.value.synced_at, t.value.syncTimeMissing);
  if (appStatus.value?.last_cloud_sync_at) {
    return t.value.lastCloudSync(formatDateTime(appStatus.value.last_cloud_sync_at, t.value.syncTimeMissing));
  }
  return t.value.syncTimeMissing;
});

const timezoneLabel = computed(() => device.value.timezone || t.value.notProvided);
const deviceIdentifier = computed(() => maskIdentifier(device.value.device_id || session.value?.device_id));

// 周睡眠堆叠柱状图
const weeklyChartOption = computed(() => {
  if (!weekSessions.value.length) return null;
  const sorted = [...weekSessions.value].sort((a, b) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime());
  
  const dates = sorted.map((s) => formatDate(s.start_time));

  const deepData = sorted.map((s) => minutesToHours(s.deep_minutes));
  const lightData = sorted.map((s) => minutesToHours(s.light_minutes));
  const remData = sorted.map((s) => minutesToHours(s.rem_minutes));
  const awakeData = sorted.map((s) => minutesToHours(s.awake_minutes));

  // 标出当前日高亮
  const currentIndex = sorted.findIndex((s) => s.sleep_id === sleepId.value);
  const palette = chartPalette.value;

  return {
    animation: false,
    grid: { left: 34, right: 12, top: 46, bottom: 24, containLabel: false },
    legend: {
      data: sleepStageLabels(),
      top: 0,
      right: 0,
      textStyle: { color: palette.axis, fontSize: 14.5 },
      itemWidth: 8,
      itemHeight: 8,
      icon: 'circle',
    },
    tooltip: {
      trigger: 'axis', triggerOn: 'mousemove|click', showDelay: 0, hideDelay: 0, transitionDuration: 0,
      // 不画指示框：以前这里是一个灰色的阴影框，把整根柱子框起来，看着多余。
      // 悬停的那一天由 tooltip 说明，柱子本身不动。
      axisPointer: { type: 'none' },
      backgroundColor: palette.tooltipBg,
      borderColor: palette.tooltipBorder,
      borderWidth: 1,
      textStyle: { color: palette.tooltipText, fontSize: 15.5 },
      formatter: (params: Array<{ seriesName: string; value: number | null; name: string }>) => {
        if (!params || !params.length) return '';
        const name = params[0].name;
        const total = params.reduce((sum, p) => sum + (isFiniteNumber(p.value) ? p.value : 0), 0);
        let text = t.value.tooltipTotal(name, total.toFixed(1));
        params.forEach((p) => {
          text += isFiniteNumber(p.value)
            ? t.value.tooltipRow(p.seriesName, p.value)
            : t.value.tooltipRowMissing(p.seriesName);
        });
        return text;
      },
    },
    xAxis: {
      type: 'category',
      data: dates,
      axisLine: { lineStyle: { color: palette.gridSoft } },
      axisTick: { show: false },
      axisLabel: {
        color: (_val: string, index: number) => index === currentIndex ? palette.accent : palette.axis,
        fontSize: 14.5,
        fontWeight: (_val: string, index: number) => index === currentIndex ? 'bold' : 'normal',
      },
    },
    yAxis: {
      type: 'value',
      name: t.value.hoursAxis,
      nameTextStyle: { color: palette.axis, fontSize: 14.5, align: 'right' },
      axisLine: { show: false },
      axisTick: { show: false },
      axisLabel: { color: palette.axis, fontSize: 14.5 },
      splitLine: { show: true, lineStyle: { color: palette.gridSoft, type: 'dashed' } },
    },
    series: [
      {
        name: sleepStageLabel('deep'),
        type: 'bar',
        stack: 'sleep',
        data: deepData,
        itemStyle: { color: chartPalette.value.series.sleep.deep },
        barWidth: 22,
      },
      {
        name: sleepStageLabel('light'),
        type: 'bar',
        stack: 'sleep',
        data: lightData,
        itemStyle: { color: chartPalette.value.series.sleep.light },
      },
      {
        name: sleepStageLabel('rem'),
        type: 'bar',
        stack: 'sleep',
        data: remData,
        itemStyle: { color: chartPalette.value.series.sleep.rem },
      },
      {
        name: sleepStageLabel('awake'),
        type: 'bar',
        stack: 'sleep',
        data: awakeData,
        itemStyle: {
          color: chartPalette.value.series.sleep.awake,
          borderRadius: [4, 4, 0, 0],
        },
      },
    ],
  };
});

let detailSeq = 0;

const loadDetail = async () => {
  const seq = ++detailSeq;
  loading.value = true;
  error.value = null;
  if (!isTauri()) {
    loading.value = false;
    return;
  }
  try {
    const [detail, recent] = await Promise.all([
      tauriApi.getSleepDetail(sleepId.value),
      tauriApi.getRecentSleep(7).catch(() => []),
    ]);
    if (seq !== detailSeq) return;
    const profile = detail
      ? await tauriApi.getDeviceProfile({
          deviceId: detail.device_id,
          sourceScope: detail.source_scope,
        }).catch(() => ({ name: t.value.deviceUndetermined }))
      : {};
    if (seq !== detailSeq) return;
    session.value = detail;
    weekSessions.value = recent;
    device.value = profile;
  } catch (cause) {
    if (seq !== detailSeq) return;
    error.value = toUserMessage(cause, t.value.loadFailed);
  } finally {
    if (seq === detailSeq) loading.value = false;
  }
};

onMounted(() => void loadDetail());
watch([dataRevision, sleepId], () => void loadDetail());

const foldCards = computed(() => [
  ...(weeklyChartOption.value
    ? [{ id: 'weekly', title: t.value.weeklyTitle, summary: t.value.weeklySub, icon: 'sleep-waves' as const, tone: 'sleep' as const }]
    : []),
  {
    id: 'meta',
    title: t.value.metaAria,
    summary: [dataProviderLabel(), device.value.name].filter(Boolean).join(' · '),
    icon: 'health-watch' as const,
    tone: 'activity' as const,
    framed: true,
  },
]);
</script>

<template>
  <section class="page sleep-page" aria-labelledby="sleep-detail-title">
    <header class="page-heading">
      <h1 id="sleep-detail-title">{{ t.title }}</h1>
      <p v-if="session">{{ formatDate(session.start_time, 'long') }}</p>
    </header>

    <div v-if="loading" class="muted-line" aria-live="polite">{{ t.loadingDetail }}</div>
    <EmptyState v-else-if="error" tone="error" icon="warning" :title="t.loadFailedTitle" :message="error">
      <button class="button button-secondary" type="button" @click="loadDetail">{{ t.retry }}</button>
    </EmptyState>
    <EmptyState v-else-if="!session" icon="moon" :title="t.notFoundTitle" :message="t.notFoundMessage" />

    <template v-else>
      <article class="sleep-hero" :aria-label="t.heroAria">
        <div class="hero-duration">
          <p class="kicker"><span class="mark"><Icon name="moon" :size="16" /></span>{{ t.durationKicker }}</p>
          <p class="value">{{ formatDuration(session.duration_minutes, t.notProvided) }}</p>
          <p class="meta">{{ t.heroMeta(formatTime(session.start_time), formatTime(session.end_time), timeInBedLabel) }}</p>
        </div>
        <div class="hero-score">
          <CircularProgress
            v-if="score !== null"
            :value="score"
            :size="88"
            :stroke-width="7"
            color="var(--sleep)"
            track-color="var(--line)"
            unit=""
          />
          <strong v-else class="score-empty">—</strong>
          <div class="score-copy">
            <p class="kicker">{{ t.scoreKicker }}</p>
            <p class="score-num">{{ score !== null ? score : t.notProvided }}<small v-if="score !== null"> / 100</small></p>
            <p v-if="score !== null" class="score-note">{{ t.scoreNote }}</p>
          </div>
        </div>
      </article>

      <!-- 睡眠阶段 -->
      <section class="surface-card stage-card" :aria-label="t.stagesAria">
        <div class="stage-head">
          <h2>{{ t.stagesTitle }}</h2>
          <div class="stage-actions">
            <p>{{ formatTime(session.start_time) }} – {{ formatTime(session.end_time) }}</p>
            <span class="stage-help-anchor">
              <button class="stage-help-button" type="button" aria-describedby="stage-help-note">{{ t.stageHelpButton }}</button>
              <span id="stage-help-note" class="stage-help" role="note">{{ t.stageHelp }}</span>
            </span>
          </div>
        </div>
        <StageBar
          :stages="stages"
          :slices="session.stages"
          :range-start="session.start_time"
          :range-end="session.end_time"
        />
      </section>

      <!-- 首屏只留这一夜的时长、评分和分期；近 7 天结构、来源与设备收进卡包，点开飞出来。 -->
      <FoldDeck :cards="foldCards" :label="t.metaAria">
        <template #weekly>
          <section v-if="weeklyChartOption" class="surface-card chart-card" :aria-label="t.weeklyAria">
            <div class="stage-head">
              <h2>{{ t.weeklyTitle }}</h2>
              <p>{{ t.weeklySub }}</p>
            </div>
            <VChart class="weekly-sleep-chart" :key="CHART_THEME" :theme="CHART_THEME" :option="weeklyChartOption" autoresize role="img" :aria-label="t.weeklyChartAria" />
          </section>
        </template>
        <template #meta>
          <section class="meta-grid" :aria-label="t.metaAria">
            <article class="surface-card meta-card">
              <p class="meta-title"><Icon name="cloud" :size="15" />{{ t.sourceTitle }}</p>
              <dl>
                <div>
                  <dt>{{ t.sourceProvider }}</dt>
                  <dd>{{ dataProviderLabel() }}</dd>
                </div>
                <div>
                  <dt>{{ t.sourceScope }}</dt>
                  <dd>{{ dataScopeLabel(session.source_scope) }}</dd>
                </div>
                <div>
                  <dt>{{ t.syncedAt }}</dt>
                  <dd>{{ syncTimeLabel }}</dd>
                </div>
                <div>
                  <dt>{{ t.timezone }}</dt>
                  <dd>{{ timezoneLabel }}</dd>
                </div>
              </dl>
            </article>
            <article class="surface-card meta-card">
              <p class="meta-title"><Icon name="watch" :size="15" />{{ t.deviceTitle }}</p>
              <dl>
                <div>
                  <dt>{{ t.deviceName }}</dt>
                  <dd>{{ device.name || t.notProvided }}</dd>
                </div>
                <div>
                  <dt>{{ t.deviceFirmware }}</dt>
                  <dd>{{ device.firmware || t.notProvided }}</dd>
                </div>
                <div>
                  <dt>{{ t.deviceId }}</dt>
                  <dd>{{ deviceIdentifier }}</dd>
                </div>
              </dl>
            </article>
          </section>
        </template>
      </FoldDeck>

      <p class="note">{{ t.footnote }}</p>
    </template>
  </section>
</template>

<style scoped src="./SleepDetail.css"></style>
