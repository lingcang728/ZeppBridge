<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { RouterLink, useRoute } from 'vue-router';
import { VChart } from '../lib/echartsSetup';
import Icon from '../components/Icon.vue';
import CircularProgress from '../components/CircularProgress.vue';
import StageBar from '../components/StageBar.vue';
import { sleepStageLabel, sleepStageLabels } from '../lib/sleepStages';
import { defineMessages, useMessages } from '../i18n';

const messages = defineMessages(
  {
    backToRecent: '返回最近记录',
    title: '睡眠记录详情',
    loadingDetail: '正在读取睡眠详情…',
    loadFailedTitle: '无法读取这条睡眠',
    loadFailed: '睡眠详情暂时不可用',
    retry: '重试',
    notFoundTitle: '找不到这条睡眠记录',
    notFoundMessage: '它可能已被清理，或尚未同步到本机。',
    heroAria: '睡眠时长与评分',
    durationKicker: '睡眠时长',
    heroMeta: (fellAsleep: string, wokeUp: string, inBed: string) =>
      `${fellAsleep} 入睡 · ${wokeUp} 醒来 · 在床 ${inBed}`,
    scoreKicker: '睡眠评分',
    scoreNote: '设备提供的评分，仅作记录展示。',
    stagesAria: '睡眠阶段',
    stagesTitle: '睡眠阶段',
    stageHelpButton: '阶段说明',
    stageHelp: '深睡：恢复体力的深度睡眠。浅睡：占比较高的过渡阶段。REM：快速眼动期，多与记忆和梦境有关。清醒：夜间醒来或清醒片段。以上为阶段含义说明，不是健康诊断。',
    weeklyAria: '近 7 天睡眠趋势',
    weeklyTitle: '近 7 天睡眠结构',
    weeklySub: '每日分期堆叠',
    weeklyChartAria: '近 7 天睡眠结构柱状图',
    metaAria: '来源与设备',
    sourceTitle: '来源',
    sourceProvider: '数据来源',
    sourceScope: '数据范围',
    syncedAt: '同步时间',
    timezone: '时区',
    deviceTitle: '设备',
    deviceName: '设备名称',
    deviceFirmware: '固件版本',
    deviceId: '设备 ID',
    footnote: '只展示云端给出的阶段汇总。没有 REM 字段时显示「未提供」，不会用减法编造，也不绘制未提供的时间轴。',
    notProvided: '未提供',
    syncTimeMissing: '同步时间未提供',
    lastCloudSync: (clock: string) => `最近云端同步 ${clock}`,
    deviceUndetermined: '设备未确定',
    hoursAxis: '小时',
    tooltipTotal: (date: string, hours: string) => `<b>${date} 睡眠合计：${hours} 小时</b><br/>`,
    tooltipRow: (name: string, hours: number) => `${name}: ${hours} 小时<br/>`,
  },
  {
    backToRecent: 'Back to recent records',
    title: 'Sleep record',
    loadingDetail: 'Reading the sleep record…',
    loadFailedTitle: 'Could not read this sleep record',
    loadFailed: 'Sleep detail is unavailable right now',
    retry: 'Try again',
    notFoundTitle: 'This sleep record is not here',
    notFoundMessage: 'It may have been cleaned up, or it has not been synced to this machine yet.',
    heroAria: 'Sleep duration and score',
    durationKicker: 'Time asleep',
    heroMeta: (fellAsleep: string, wokeUp: string, inBed: string) =>
      `Asleep ${fellAsleep} · awake ${wokeUp} · in bed ${inBed}`,
    scoreKicker: 'Sleep score',
    scoreNote: 'Reported by the device; shown as recorded, nothing more.',
    stagesAria: 'Sleep stages',
    stagesTitle: 'Sleep stages',
    stageHelpButton: 'What the stages mean',
    stageHelp: 'Deep: the restorative stretch. Light: the transitional stage that takes up most of the night. REM: rapid eye movement, tied to memory and dreaming. Awake: waking up or lying awake in the night. These are definitions, not a health diagnosis.',
    weeklyAria: 'Sleep over the last 7 days',
    weeklyTitle: 'Sleep structure, last 7 days',
    weeklySub: 'Stages stacked per night',
    weeklyChartAria: 'Stacked bar chart of sleep structure over the last 7 days',
    metaAria: 'Source and device',
    sourceTitle: 'Source',
    sourceProvider: 'Provider',
    sourceScope: 'Scope',
    syncedAt: 'Synced',
    timezone: 'Time zone',
    deviceTitle: 'Device',
    deviceName: 'Name',
    deviceFirmware: 'Firmware',
    deviceId: 'Device ID',
    footnote: 'Only the stage summary the cloud actually gave. When there is no REM field it reads "Not provided" — never back-computed by subtraction — and a timeline that was not provided is never drawn.',
    notProvided: 'Not provided',
    syncTimeMissing: 'Sync time not provided',
    lastCloudSync: (clock: string) => `Last cloud sync ${clock}`,
    deviceUndetermined: 'Device undetermined',
    hoursAxis: 'hours',
    tooltipTotal: (date: string, hours: string) => `<b>${date} — ${hours} h asleep in total</b><br/>`,
    tooltipRow: (name: string, hours: number) => `${name}: ${hours} h<br/>`,
  },
);
const t = useMessages(messages);
import EmptyState from '../components/EmptyState.vue';
import { useSyncController } from '../composables/useSyncController';
import { useDevices } from '../composables/useDevices';
import { dataProviderLabel, dataScopeLabel } from '../lib/labels';
import { isTauri, tauriApi, toUserMessage } from '../composables/useTauriApi';
import { formatDate, formatDateTime, formatDuration, formatTime, isFiniteNumber } from '../lib/format';
import { zeppSemanticColors } from '../lib/echartsTheme';
import type { DeviceProfile, SleepSession } from '../types';

const route = useRoute();
const { appStatus, dataRevision } = useSyncController();
const { maskIdentifier } = useDevices();
const session = ref<SleepSession | null>(null);
const weekSessions = ref<SleepSession[]>([]);
const device = ref<DeviceProfile>({});
const loading = ref(true);
const error = ref<string | null>(null);
const stageHelpOpen = ref(false);
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
  
  const dates = sorted.map((s) => {
    const d = new Date(s.start_time);
    return `${d.getMonth() + 1}/${d.getDate()}`;
  });

  const toHours = (mins?: number | null) => (isFiniteNumber(mins) && mins > 0 ? Math.round((mins / 60) * 10) / 10 : 0);

  const deepData = sorted.map((s) => toHours(s.deep_minutes));
  const lightData = sorted.map((s) => toHours(s.light_minutes));
  const remData = sorted.map((s) => toHours(s.rem_minutes));
  const awakeData = sorted.map((s) => toHours(s.awake_minutes));

  // 标出当前日高亮
  const currentIndex = sorted.findIndex((s) => s.sleep_id === sleepId.value);

  return {
    animation: false,
    grid: { left: 34, right: 12, top: 24, bottom: 24, containLabel: false },
    legend: {
      data: sleepStageLabels(),
      top: 0,
      right: 0,
      textStyle: { color: '#7E856D', fontSize: 11 },
      itemWidth: 8,
      itemHeight: 8,
      icon: 'circle',
    },
    tooltip: {
      trigger: 'axis',
      backgroundColor: '#22261A',
      borderColor: 'rgba(228, 235, 208, 0.16)',
      borderWidth: 1,
      textStyle: { color: '#F3F4EC', fontSize: 12 },
      formatter: (params: Array<{ seriesName: string; value: number; name: string }>) => {
        if (!params || !params.length) return '';
        const name = params[0].name;
        const total = params.reduce((sum, p) => sum + (Number(p.value) || 0), 0);
        let text = t.value.tooltipTotal(name, total.toFixed(1));
        params.forEach((p) => {
          text += t.value.tooltipRow(p.seriesName, p.value);
        });
        return text;
      },
    },
    xAxis: {
      type: 'category',
      data: dates,
      axisLine: { lineStyle: { color: 'rgba(228, 235, 208, 0.1)' } },
      axisTick: { show: false },
      axisLabel: {
        color: (_val: string, index: number) => index === currentIndex ? '#7DA33E' : '#7E856D',
        fontSize: 11,
        fontWeight: (_val: string, index: number) => index === currentIndex ? 'bold' : 'normal',
      },
    },
    yAxis: {
      type: 'value',
      name: t.value.hoursAxis,
      nameTextStyle: { color: '#7E856D', fontSize: 10, align: 'right' },
      axisLine: { show: false },
      axisTick: { show: false },
      axisLabel: { color: '#7E856D', fontSize: 10 },
      splitLine: { show: true, lineStyle: { color: 'rgba(228, 235, 208, 0.08)', type: 'dashed' } },
    },
    series: [
      {
        name: sleepStageLabel('deep'),
        type: 'bar',
        stack: 'sleep',
        data: deepData,
        itemStyle: { color: zeppSemanticColors.sleep.deep },
        barWidth: 20,
      },
      {
        name: sleepStageLabel('light'),
        type: 'bar',
        stack: 'sleep',
        data: lightData,
        itemStyle: { color: zeppSemanticColors.sleep.light },
      },
      {
        name: sleepStageLabel('rem'),
        type: 'bar',
        stack: 'sleep',
        data: remData,
        itemStyle: { color: zeppSemanticColors.sleep.rem },
      },
      {
        name: sleepStageLabel('awake'),
        type: 'bar',
        stack: 'sleep',
        data: awakeData,
        itemStyle: {
          color: zeppSemanticColors.sleep.awake,
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
    <RouterLink class="back-link" to="/recent"><Icon name="arrow-left" :size="14" />{{ t.backToRecent }}</RouterLink>
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
            <button class="stage-help-button" type="button" @click="stageHelpOpen = !stageHelpOpen">{{ t.stageHelpButton }}</button>
          </div>
        </div>
        <p v-if="stageHelpOpen" class="stage-help">{{ t.stageHelp }}</p>
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
        <VChart class="weekly-sleep-chart" :option="weeklyChartOption" autoresize role="img" :aria-label="t.weeklyChartAria" />
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
  font-size: 12px;
  text-decoration: none;
}
.back-link:hover { color: var(--accent); }
.page-heading { margin: 0; }
.page-heading h1 {
  margin: 0;
  color: var(--ink);
  font-size: 22px;
  font-weight: 700;
  letter-spacing: -0.02em;
}
.page-heading p {
  margin: 4px 0 0;
  color: var(--muted);
  font-size: 12px;
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
  font-size: 22px;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
}
.score-num small { color: var(--muted); font-size: 13px; font-weight: 500; }
.score-note { margin: 2px 0 0; color: var(--muted); font-size: 11px; line-height: 1.45; }
.kicker {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 0;
  color: var(--muted);
  font-size: 12px;
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
  font-size: 12px;
}
.score-empty {
  color: var(--ink);
  font-size: 28px;
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
.stage-head h2 { margin: 0; color: var(--ink); font-size: 15px; font-weight: 700; }
.stage-head p { margin: 0; color: var(--muted); font-size: 12px; }
.stage-actions { display: flex; align-items: center; gap: 10px; }
.stage-help-button {
  border: 1px solid var(--line);
  border-radius: 999px;
  background: transparent;
  color: var(--muted);
  font-size: 12px;
  padding: 4px 10px;
  cursor: pointer;
}
.stage-help { margin: 0 0 12px; color: var(--muted); font-size: 12px; line-height: 1.55; }
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
  font-size: 13px;
  font-weight: 700;
}
.meta-title svg { color: var(--sleep); }
.meta-card dl { display: grid; gap: 8px; margin: 0; }
.meta-card dt { color: var(--muted); font-size: 12px; }
.meta-card dd {
  margin: 3px 0 0;
  color: var(--ink);
  overflow-wrap: anywhere;
  font-size: 13px;
}
.note { margin: 0; color: var(--muted); font-size: 12px; }
@media (max-width: 760px) {
  .sleep-hero, .meta-grid { grid-template-columns: 1fr; }
  .hero-score { justify-content: flex-start; }
}
</style>
