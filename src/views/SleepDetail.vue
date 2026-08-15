<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { RouterLink, useRoute } from 'vue-router';
import VChart from 'vue-echarts';
import Icon from '../components/Icon.vue';
import CircularProgress from '../components/CircularProgress.vue';
import StageBar from '../components/StageBar.vue';
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
  { label: '深睡', minutes: session.value.deep_minutes, tone: 'deep' as const },
  { label: '浅睡', minutes: session.value.light_minutes, tone: 'light' as const },
  { label: 'REM', minutes: session.value.rem_minutes, tone: 'rem' as const },
  { label: '清醒', minutes: session.value.awake_minutes, tone: 'awake' as const },
] : []);

const score = computed(() => {
  const value = session.value?.score;
  return isFiniteNumber(value) ? value : null;
});

const timeInBedLabel = computed(() => {
  const minutes = session.value?.time_in_bed_minutes;
  return isFiniteNumber(minutes) ? formatDuration(minutes, '未提供') : '未提供';
});

const syncTimeLabel = computed(() => {
  if (session.value?.synced_at) return formatDateTime(session.value.synced_at, '同步时间未提供');
  if (appStatus.value?.last_cloud_sync_at) {
    return `最近云端同步 ${formatDateTime(appStatus.value.last_cloud_sync_at, '同步时间未提供')}`;
  }
  return '同步时间未提供';
});

const timezoneLabel = computed(() => device.value.timezone || '未提供');
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
      data: ['深睡', '浅睡', 'REM', '清醒'],
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
        let text = `<b>${name} 睡眠合计：${total.toFixed(1)} 小时</b><br/>`;
        params.forEach((p) => {
          text += `${p.seriesName}: ${p.value} 小时<br/>`;
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
        color: (_val: string, index: number) => index === currentIndex ? '#CDDC7C' : '#7E856D',
        fontSize: 11,
        fontWeight: (_val: string, index: number) => index === currentIndex ? 'bold' : 'normal',
      },
    },
    yAxis: {
      type: 'value',
      name: '小时',
      nameTextStyle: { color: '#7E856D', fontSize: 10, align: 'right' },
      axisLine: { show: false },
      axisTick: { show: false },
      axisLabel: { color: '#7E856D', fontSize: 10 },
      splitLine: { show: true, lineStyle: { color: 'rgba(228, 235, 208, 0.08)', type: 'dashed' } },
    },
    series: [
      {
        name: '深睡',
        type: 'bar',
        stack: 'sleep',
        data: deepData,
        itemStyle: { color: zeppSemanticColors.sleep.deep },
        barWidth: 20,
      },
      {
        name: '浅睡',
        type: 'bar',
        stack: 'sleep',
        data: lightData,
        itemStyle: { color: zeppSemanticColors.sleep.light },
      },
      {
        name: 'REM',
        type: 'bar',
        stack: 'sleep',
        data: remData,
        itemStyle: { color: zeppSemanticColors.sleep.rem },
      },
      {
        name: '清醒',
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
        }).catch(() => ({ name: '设备未确定' }))
      : {};
    if (seq !== detailSeq) return;
    session.value = detail;
    weekSessions.value = recent;
    device.value = profile;
  } catch (cause) {
    if (seq !== detailSeq) return;
    error.value = toUserMessage(cause, '睡眠详情暂时不可用');
  } finally {
    if (seq === detailSeq) loading.value = false;
  }
};

onMounted(() => void loadDetail());
watch([dataRevision, sleepId], () => void loadDetail());
</script>

<template>
  <section class="page sleep-page" aria-labelledby="sleep-detail-title">
    <RouterLink class="back-link" to="/recent"><Icon name="arrow-left" :size="14" />返回最近记录</RouterLink>
    <header class="page-heading">
      <h1 id="sleep-detail-title">睡眠记录详情</h1>
      <p v-if="session">{{ formatDate(session.start_time, 'long') }}</p>
    </header>

    <div v-if="loading" class="muted-line" aria-live="polite">正在读取睡眠详情…</div>
    <EmptyState v-else-if="error" tone="error" icon="warning" title="无法读取这条睡眠" :message="error">
      <button class="button button-secondary" type="button" @click="loadDetail">重试</button>
    </EmptyState>
    <EmptyState v-else-if="!session" icon="moon" title="找不到这条睡眠记录" message="它可能已被清理，或尚未同步到本机。" />

    <template v-else>
      <article class="sleep-hero" aria-label="睡眠时长与评分">
        <div class="hero-duration">
          <p class="kicker"><span class="mark"><Icon name="moon" :size="16" /></span>睡眠时长</p>
          <p class="value">{{ formatDuration(session.duration_minutes, '未提供') }}</p>
          <p class="meta">{{ formatTime(session.start_time) }} 入睡 · {{ formatTime(session.end_time) }} 醒来</p>
          <p class="meta">在床时长 {{ timeInBedLabel }}</p>
        </div>
        <div class="hero-score">
          <p class="kicker">睡眠评分</p>
          <div class="score-row">
            <CircularProgress
              v-if="score !== null"
              :value="score"
              :size="92"
              :stroke-width="7"
              color="var(--sleep)"
              track-color="var(--line)"
              unit=""
            />
            <strong v-else class="score-empty">未提供</strong>
            <small>/ 100</small>
          </div>
          <p v-if="score !== null" class="score-note">设备提供的评分，仅作记录展示。</p>
        </div>
      </article>

      <!-- 睡眠阶段 -->
      <section class="surface-card stage-card" aria-label="睡眠阶段">
        <div class="stage-head">
          <h2>睡眠阶段</h2>
          <div class="stage-actions">
            <p>{{ formatTime(session.start_time) }} – {{ formatTime(session.end_time) }}</p>
            <button class="stage-help-button" type="button" @click="stageHelpOpen = !stageHelpOpen">阶段说明</button>
          </div>
        </div>
        <p v-if="stageHelpOpen" class="stage-help">
          深睡：恢复体力的深度睡眠。浅睡：占比较高的过渡阶段。REM：快速眼动期，多与记忆和梦境有关。清醒：夜间醒来或清醒片段。以上为阶段含义说明，不是健康诊断。
        </p>
        <StageBar
          :stages="stages"
          :slices="session.stages"
          :range-start="session.start_time"
          :range-end="session.end_time"
        />
      </section>

      <!-- 睡眠时长周堆叠图 -->
      <section v-if="weeklyChartOption" class="surface-card chart-card" aria-label="近7天睡眠趋势">
        <div class="stage-head">
          <h2>近 7 天睡眠结构</h2>
          <p>每日分期堆叠</p>
        </div>
        <VChart class="weekly-sleep-chart" :option="weeklyChartOption" autoresize role="img" aria-label="近7天睡眠结构柱状图" />
      </section>

      <!-- 元数据与设备 -->
      <section class="meta-grid" aria-label="来源与设备">
        <article class="surface-card meta-card">
          <p class="meta-title"><Icon name="cloud" :size="15" />来源</p>
          <dl>
            <div>
              <dt>数据来源</dt>
              <dd>{{ dataProviderLabel() }}</dd>
            </div>
            <div>
              <dt>数据范围</dt>
              <dd>{{ dataScopeLabel(session.source_scope) }}</dd>
            </div>
            <div>
              <dt>同步时间</dt>
              <dd>{{ syncTimeLabel }}</dd>
            </div>
            <div>
              <dt>时区</dt>
              <dd>{{ timezoneLabel }}</dd>
            </div>
          </dl>
        </article>
        <article class="surface-card meta-card">
          <p class="meta-title"><Icon name="watch" :size="15" />设备</p>
          <dl>
            <div>
              <dt>设备名称</dt>
              <dd>{{ device.name || '未提供' }}</dd>
            </div>
            <div>
              <dt>固件版本</dt>
              <dd>{{ device.firmware || '未提供' }}</dd>
            </div>
            <div>
              <dt>设备 ID</dt>
              <dd>{{ deviceIdentifier }}</dd>
            </div>
          </dl>
        </article>
      </section>
      <p class="note">只展示云端给出的阶段汇总。没有 REM 字段时显示「未提供」，不会用减法编造，也不绘制未提供的时间轴。</p>
    </template>
  </section>
</template>

<style scoped>
.sleep-page { width: 100%; }
.back-link {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 8px;
  color: var(--muted);
  font-size: 12px;
  text-decoration: none;
}
.back-link:hover { color: var(--accent); }
.page-heading { margin-bottom: 12px; }
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
  grid-template-columns: minmax(0, 1.4fr) minmax(220px, 0.8fr);
  align-items: start;
  gap: 0;
  overflow: hidden;
  border: 1px solid var(--line);
  border-radius: var(--radius-md);
  background: var(--surface);
}
.score-note { margin: 10px 0 0; color: var(--muted); font-size: 11px; line-height: 1.55; }
.hero-duration, .hero-score { min-width: 0; padding: 18px 20px 16px; }
.hero-score {
  border-left: 1px solid var(--line);
  background: var(--surface-raised);
}
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
  margin: 12px 0 0;
  color: var(--ink);
  font-family: 'Inter', var(--font-sans);
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
.score-row {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-top: 12px;
}
.score-empty {
  color: var(--ink);
  font-family: 'Inter', var(--font-sans);
  font-size: 36px;
  font-weight: 600;
}
.score-row small {
  color: var(--muted);
  font-family: 'Inter', var(--font-sans);
  font-size: 13px;
}
.stage-card, .chart-card { margin-top: 12px; padding: 14px 16px 16px; background: var(--surface); border: 1px solid var(--line); border-radius: var(--radius-md); }
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
  gap: 12px;
  margin-top: 12px;
}
.meta-card { padding: 12px 14px 14px; background: var(--surface); border: 1px solid var(--line); border-radius: var(--radius-md); }
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
.note { margin: 12px 0 0; color: var(--muted); font-size: 12px; }
@media (max-width: 760px) {
  .sleep-hero, .meta-grid { grid-template-columns: 1fr; }
  .hero-score { border-left: 0; border-top: 1px solid var(--line); }
}
</style>
