<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import { CHART_THEME, VChart, chartPalette } from '../lib/echartsSetup';
import Icon from '../components/Icon.vue';
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
    grid: { left: 34, right: 12, top: 24, bottom: 24, containLabel: false },
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
      axisPointer: { type: 'shadow', animation: false },
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
        barWidth: 20,
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

      <!-- 睡眠时长周堆叠图 -->
      <section v-if="weeklyChartOption" class="surface-card chart-card" :aria-label="t.weeklyAria">
        <div class="stage-head">
          <h2>{{ t.weeklyTitle }}</h2>
          <p>{{ t.weeklySub }}</p>
        </div>
        <VChart class="weekly-sleep-chart" :key="CHART_THEME" :theme="CHART_THEME" :option="weeklyChartOption" autoresize role="img" :aria-label="t.weeklyChartAria" />
      </section>

      <!-- 元数据与设备 -->
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
      <p class="note">{{ t.footnote }}</p>
    </template>
  </section>
</template>

<style scoped>
.sleep-page { width: 100%; display: grid; gap: 16px; align-content: start; }
.back-link {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  color: var(--muted);
  font-size: var(--fs-sm);
  text-decoration: none;
}
.back-link:hover { color: var(--accent); }
.page-heading { margin: 0; }
.page-heading h1 {
  margin: 0;
  color: var(--ink);
  font-size: 24px;
  font-weight: 700;
  letter-spacing: -0.02em;
}
.page-heading p {
  margin: 4px 0 0;
  color: var(--muted);
  font-size: var(--fs-sm);
}
.muted-line { color: var(--muted); }
.sleep-hero {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: center;
  gap: 24px;
  min-width: 0;
  padding: 18px 20px;
  overflow: hidden;
  border: 1px solid var(--line);
  border-radius: var(--radius-md);
  background: var(--surface);
}
.hero-duration, .hero-score { min-width: 0; }
.hero-score {
  display: flex;
  align-items: center;
  gap: 14px;
}
.score-copy { display: grid; gap: 2px; min-width: 0; }
.score-num {
  margin: 0;
  color: var(--ink);
  font-size: 24px;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
}
.score-num small { color: var(--muted); font-size: var(--fs-md); font-weight: 600; }
.score-note { margin: 2px 0 0; color: var(--muted); font-size: var(--fs-xs); line-height: 1.45; }
.kicker {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 0;
  color: var(--muted);
  font-size: var(--fs-sm);
}
.mark {
  display: grid;
  width: 28px;
  height: 28px;
  place-items: center;
  border-radius: 999px;
  color: var(--sleep);
  background: var(--sleep-wash);
}
.value {
  margin: 10px 0 0;
  color: var(--ink);
  font-size: clamp(32px, 4vw, 42px);
  font-variant-numeric: tabular-nums;
  font-weight: 600;
  letter-spacing: -0.03em;
  line-height: 1.1;
}
.meta {
  margin: 8px 0 0;
  color: var(--muted);
  font-size: var(--fs-sm);
}
.score-empty {
  color: var(--ink);
  font-size: 31px;
  font-weight: 600;
}
.stage-card, .chart-card { margin: 0; padding: 16px 18px; background: var(--surface); border: 1px solid var(--line); border-radius: var(--radius-md); }
.weekly-sleep-chart { width: 100%; height: 180px; }
.stage-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 12px;
}
.stage-head h2 { margin: 0; color: var(--ink); font-size: var(--fs-xl); font-weight: 700; }
.stage-head p { margin: 0; color: var(--muted); font-size: var(--fs-sm); }
.stage-actions { display: flex; align-items: center; gap: 10px; }
.stage-help-button {
  border: 1px solid var(--line);
  border-radius: 999px;
  background: transparent;
  color: var(--muted);
  font-size: var(--fs-sm);
  padding: 4px 10px;
  cursor: pointer;
}
.stage-help-anchor { position: relative; display: inline-flex; }
.stage-card { overflow: visible; }
.stage-help { position: absolute; z-index: 30; top: calc(100% + 8px); right: 0; width: min(340px, calc(100vw - 48px)); padding: 12px 14px; border: 1px solid var(--line-control); border-radius: var(--radius-md); background: var(--surface-raised); box-shadow: 0 14px 32px rgba(0,0,0,.28); color: var(--muted); font-size: var(--fs-sm); line-height: 1.55; opacity: 0; visibility: hidden; transform: translateY(-4px); pointer-events: none; transition: opacity 150ms ease, transform 150ms ease, visibility 150ms; }
.stage-help-anchor:hover .stage-help, .stage-help-anchor:focus-within .stage-help { opacity: 1; visibility: visible; transform: translateY(0); }
@media (prefers-reduced-motion: reduce) { .stage-help { transition: none; } }
.meta-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 16px;
  margin: 0;
}
.meta-card { padding: 16px 18px; background: var(--surface); border: 1px solid var(--line); border-radius: var(--radius-md); }
.meta-title {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 0 0 10px;
  color: var(--ink);
  font-size: var(--fs-md);
  font-weight: 700;
}
.meta-title svg { color: var(--sleep); }
.meta-card dl { display: grid; gap: 8px; margin: 0; }
.meta-card dt { color: var(--muted); font-size: var(--fs-sm); }
.meta-card dd {
  margin: 3px 0 0;
  color: var(--ink);
  overflow-wrap: anywhere;
  font-size: var(--fs-md);
}
.note { margin: 0; color: var(--muted); font-size: var(--fs-sm); }
@media (max-width: 760px) {
  .sleep-hero, .meta-grid { grid-template-columns: 1fr; }
  .hero-score { justify-content: flex-start; }
}
</style>
