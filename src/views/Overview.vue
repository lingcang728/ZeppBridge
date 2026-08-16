<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { RouterLink } from 'vue-router';
import { graphic } from 'echarts/core';
import VChart from 'vue-echarts';
import { openUrl } from '@tauri-apps/plugin-opener';
import CircularProgress from '../components/CircularProgress.vue';
import DeviceVisual from '../components/DeviceVisual.vue';
import Icon from '../components/Icon.vue';
import RecordRow from '../components/RecordRow.vue';
import SkeletonBlock from '../components/SkeletonBlock.vue';
import { useDevices } from '../composables/useDevices';
import { useSyncController } from '../composables/useSyncController';
import { exportTypeOptions, useExport } from '../composables/useExport';
import { backend, isDesktop, isTauri, toUserMessage } from '../lib/bridge';
import { AI_PROVIDERS, isFixedAiProviderUrl, type AiProvider, type AiProviderId } from '../lib/aiProviders';
import { formatDistance, formatDuration, formatMetric, formatTime, isFiniteNumber, localDateString } from '../lib/format';
import { workoutLabel } from '../lib/labels';
import { displayableWorkouts, workoutDurationMinutes } from '../lib/workouts';
import type { ExportDataType, HealthOverview, HeartRatePoint, SleepSession, Workout } from '../types';

const { dataRevision } = useSyncController();
const { models: deviceModels, error: deviceError, load: loadDevices } = useDevices();
const {
  exportStartDate,
  exportEndDate,
  exportDataTypes,
  exportBusy,
  exportError,
  exportMessage,
  applyExportRange,
  copyExportJson,
  saveExportFile,
  publishAiFeed,
} = useExport();

const overview = ref<HealthOverview | null>(null);
const heartRateSeries = ref<HeartRatePoint[]>([]);
const recentSleep = ref<SleepSession[]>([]);
const recentWorkouts = ref<Workout[]>([]);
const loading = ref(true);
const error = ref<string | null>(null);
const partialWarning = ref<string | null>(null);

const num = (value: unknown) => isFiniteNumber(value) ? formatMetric(value) : '—';
const hm = (minutes?: number | null) => {
  if (!isFiniteNumber(minutes) || minutes < 0) return '—';
  const total = Math.round(minutes);
  const hours = Math.floor(total / 60);
  const remainder = total % 60;
  return hours > 0 ? `${hours} 小时 ${remainder} 分` : `${remainder} 分`;
};

/* ── Hero：设备 → AI 大脑示意 ─────────────── */
// 图示跟随真实识别到的设备（最多两台），未识别时使用通用穿戴设备剪影。
const heroDevices = computed(() => {
  const real = deviceModels.value.slice(0, 2).map((model) => ({
    key: model.profile.device_id || model.canonicalName,
    name: model.canonicalName,
    image: model.image,
    kind: model.kind,
  }));
  const fallbacks = [
    { key: 'fallback-watch', name: '智能手表', image: '', kind: 'watch' },
    { key: 'fallback-strap', name: '运动手环', image: '', kind: 'strap' },
  ];
  return [...real, ...fallbacks].slice(0, 2);
});

/* ── 24 小时心率 ─────────────────────────── */
const hrPoints = computed(() =>
  heartRateSeries.value
    .map((point) => ({ ts: new Date(point.timestamp).getTime(), value: point.value }))
    .filter((point) => Number.isFinite(point.ts) && isFiniteNumber(point.value)),
);
const hrLatest = computed(() => {
  if (isFiniteNumber(overview.value?.current_hr)) return overview.value.current_hr;
  const last = hrPoints.value[hrPoints.value.length - 1];
  return last ? last.value : null;
});
const hrChartOption = computed(() => {
  const data = hrPoints.value.map((point) => [point.ts, point.value]);
  const last = data[data.length - 1];
  const clock = (value: number) => {
    const date = new Date(value);
    return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
  };
  return {
    grid: { left: 38, right: 16, top: 14, bottom: 24 },
    tooltip: {
      trigger: 'axis',
      valueFormatter: (value: number) => `${value} 次/分`,
    },
    xAxis: {
      type: 'time',
      min: data[0]?.[0],
      max: last?.[0],
      axisLabel: { formatter: clock, hideOverlap: true },
      splitLine: { show: false },
    },
    yAxis: { type: 'value', scale: true, splitNumber: 3 },
    series: [
      {
        type: 'line',
        data,
        smooth: 0.25,
        showSymbol: false,
        lineStyle: { width: 2.5, color: '#A6E22E' },
        areaStyle: {
          color: new graphic.LinearGradient(0, 0, 0, 1, [
            { offset: 0, color: 'rgba(166, 226, 46, .26)' },
            { offset: 1, color: 'rgba(166, 226, 46, 0)' },
          ]),
        },
      },
      // 末端高亮点，呼应参考图的呼吸光点
      {
        type: 'line',
        data: last ? [last] : [],
        symbol: 'circle',
        symbolSize: 8,
        itemStyle: { color: '#A6E22E', borderColor: '#161B08', borderWidth: 2 },
        lineStyle: { opacity: 0 },
        tooltip: { show: false },
        z: 5,
      },
    ],
  };
});

/* ── 今日步数 ───────────────────────────── */
const STEP_GOAL = 10000;
const stepsToday = computed(() => isFiniteNumber(overview.value?.steps_today) ? overview.value.steps_today : null);
const stepsPercent = computed(() => stepsToday.value ? Math.min(100, Math.round((stepsToday.value / STEP_GOAL) * 100)) : 0);

/* ── 昨晚睡眠 ───────────────────────────── */
const lastSleep = computed(() => recentSleep.value[0] ?? null);
const sleepStages = computed(() => {
  const sleep = lastSleep.value;
  if (!sleep) return [];
  return [
    { key: 'deep', label: '深睡', minutes: sleep.deep_minutes, color: 'var(--sleep-deep)' },
    { key: 'light', label: '浅睡', minutes: sleep.light_minutes, color: 'var(--sleep-light)' },
    { key: 'rem', label: 'REM', minutes: sleep.rem_minutes ?? 0, color: 'var(--sleep-rem)' },
    { key: 'awake', label: '清醒', minutes: sleep.awake_minutes, color: 'var(--sleep-awake)' },
  ];
});

/* ── 静息心率 / 训练负荷 / VO₂max ─────────── */
const restingHr = computed(() => isFiniteNumber(overview.value?.resting_hr) ? overview.value.resting_hr : null);
const hrUpdatedAt = computed(() => {
  const at = overview.value?.latest_heart_rate_at;
  return at ? `最新测量 ${formatTime(at)}` : '等待同步';
});

const trainingLoad = computed(() => isFiniteNumber(overview.value?.training_load) ? overview.value.training_load : null);
const LOAD_ARC = Math.PI * 28;
const loadRatio = computed(() => trainingLoad.value === null ? 0 : Math.min(1, trainingLoad.value / 600));
const loadBand = computed(() => {
  if (trainingLoad.value === null) return null;
  if (trainingLoad.value < 100) return '偏低';
  if (trainingLoad.value < 300) return '中等';
  if (trainingLoad.value < 600) return '较高';
  return '很高';
});

const vo2max = computed(() => isFiniteNumber(overview.value?.vo2max) ? overview.value.vo2max : null);
const vo2Band = computed(() => {
  if (vo2max.value === null) return null;
  if (vo2max.value >= 49) return '优秀';
  if (vo2max.value >= 42) return '良好';
  if (vo2max.value >= 35) return '中等';
  return '待提升';
});

/* ── 最近记录 ───────────────────────────── */
interface RecentItem {
  key: string;
  to: string;
  category: 'sleep' | 'activity';
  icon: 'moon' | 'run';
  time: number;
  kicker: string;
  title: string;
  fact: string;
  factLabel?: string;
}
const shortDateTime = (value: string) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '时间未知';
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  return `${mm}/${dd} ${formatTime(value)}`;
};
const recentItems = computed<RecentItem[]>(() => {
  const items: RecentItem[] = [];
  for (const sleep of recentSleep.value) {
    items.push({
      key: `sleep-${sleep.sleep_id}`,
      to: `/sleep/${sleep.sleep_id}`,
      category: 'sleep',
      icon: 'moon',
      time: new Date(sleep.end_time || sleep.start_time).getTime(),
      kicker: shortDateTime(sleep.start_time),
      title: '睡眠',
      fact: formatDuration(sleep.duration_minutes, '—'),
      factLabel: isFiniteNumber(sleep.score) ? `睡眠评分 ${sleep.score}` : undefined,
    });
  }
  for (const workout of displayableWorkouts(recentWorkouts.value)) {
    items.push({
      key: `workout-${workout.workout_id}`,
      to: `/workouts/${workout.workout_id}`,
      category: 'activity',
      icon: 'run',
      time: new Date(workout.start_time).getTime(),
      kicker: shortDateTime(workout.start_time),
      title: workoutLabel(workout.workout_type),
      fact: isFiniteNumber(workout.distance_meters) && workout.distance_meters > 0
        ? formatDistance(workout.distance_meters)
        : formatDuration(workoutDurationMinutes(workout), '—'),
      factLabel: isFiniteNumber(workout.avg_hr) ? `均心率 ${Math.round(workout.avg_hr)}` : undefined,
    });
  }
  return items.sort((a, b) => b.time - a.time).slice(0, 5);
});

/* ── 交给 AI 面板 ────────────────────────── */
const rangePresets = [
  { days: 1, label: '今天' },
  { days: 7, label: '7 天' },
  { days: 30, label: '30 天' },
];
const activeRangeDays = computed(() => {
  for (const preset of rangePresets) {
    const end = new Date();
    const start = new Date(end);
    start.setDate(start.getDate() - Math.max(0, preset.days - 1));
    if (localDateString(start) === exportStartDate.value && localDateString(end) === exportEndDate.value) return preset.days;
  }
  return null;
});
const isTypeSelected = (type: ExportDataType) => exportDataTypes.value.includes(type);
const toggleType = (type: ExportDataType) => {
  const index = exportDataTypes.value.indexOf(type);
  if (index >= 0) exportDataTypes.value.splice(index, 1);
  else exportDataTypes.value.push(type);
};
const allTypesSelected = computed(() => exportDataTypes.value.length === exportTypeOptions.length);
const toggleAllTypes = () => {
  exportDataTypes.value = allTypesSelected.value ? [] : exportTypeOptions.map((option) => option.value);
};

const providerNotice = ref<string | null>(null);
const providerIconFailed = ref<Partial<Record<AiProviderId, boolean>>>({});
const markProviderIconFailed = (id: AiProviderId) => {
  providerIconFailed.value[id] = true;
};
const openProvider = async (provider: AiProvider) => {
  providerNotice.value = null;
  if (!isTauri()) {
    providerNotice.value = '浏览器预览不会打开外部 AI 站点，请在桌面应用中使用。';
    return;
  }
  if (!isFixedAiProviderUrl(provider.url)) {
    providerNotice.value = '目标 AI 地址不在允许列表中。';
    return;
  }
  try {
    await openUrl(provider.url);
  } catch {
    providerNotice.value = `无法打开 ${provider.label}，请稍后重试。`;
  }
};

/* ── 数据加载 ───────────────────────────── */
const loadOverview = async () => {
  loading.value = true;
  error.value = null;
  partialWarning.value = null;
  if (!isDesktop()) {
    overview.value = null;
    heartRateSeries.value = [];
    recentSleep.value = [];
    recentWorkouts.value = [];
    loading.value = false;
    return;
  }
  const results = await Promise.allSettled([
    backend.getHealthOverview(),
    backend.getHeartRateSeries(24),
    backend.getRecentSleep(3),
    backend.getRecentWorkouts(3),
  ]);
  const [health, heartRate, sleep, workouts] = results;
  overview.value = health.status === 'fulfilled' ? health.value : null;
  heartRateSeries.value = heartRate.status === 'fulfilled' ? heartRate.value : [];
  recentSleep.value = sleep.status === 'fulfilled' ? sleep.value : [];
  recentWorkouts.value = workouts.status === 'fulfilled' ? workouts.value : [];

  const rejected = results.filter((result) => result.status === 'rejected');
  if (rejected.length === results.length) {
    error.value = toUserMessage(rejected[0].reason, '健康数据暂时不可用');
  } else if (rejected.length) {
    partialWarning.value = toUserMessage(rejected[0].reason, '部分数据流尚未获取');
  }
  loading.value = false;
};

onMounted(() => {
  void loadOverview();
  void loadDevices();
});
watch(dataRevision, () => {
  void loadOverview();
  void loadDevices();
});
</script>

<template>
  <section class="page overview-page" aria-labelledby="overview-title">
    <!-- Hero：标题 + 价值卡 + 设备汇入 AI 大脑示意 -->
    <header class="hero-card">
      <div class="hero-copy">
        <h1 id="overview-title">你的穿戴数据，已准备好交给 AI</h1>
        <p class="hero-intro">本地优先，隐私安全，结构化数据，轻松对接 AI 助手。</p>
        <ul class="hero-values">
          <li>
            <span class="hv-icon"><Icon name="shield" :size="18" /></span>
            <span class="hv-text"><strong>安全 Secure</strong><small>数据仅存于本机</small></span>
          </li>
          <li>
            <span class="hv-icon"><Icon name="lock" :size="18" /></span>
            <span class="hv-text"><strong>私密 Private</strong><small>不上传，不泄露</small></span>
          </li>
          <li>
            <span class="hv-icon"><Icon name="spark" :size="18" /></span>
            <span class="hv-text"><strong>AI-ready</strong><small>结构化，易使用</small></span>
          </li>
        </ul>
      </div>

      <div class="hero-visual" aria-hidden="true">
        <figure
          v-for="(device, index) in heroDevices"
          :key="device.key"
          :class="['hv-device', index === 0 ? 'hv-a' : 'hv-b']"
        >
          <DeviceVisual :src="device.image" :alt="device.name" :kind="device.kind" />
          <figcaption>{{ device.name }}</figcaption>
        </figure>
        <svg class="hv-flow" viewBox="0 0 140 72" fill="none" preserveAspectRatio="none">
          <path class="flow-line" d="M2 18H108" />
          <path class="flow-line" d="M2 36H108" />
          <path class="flow-line" d="M2 54H108" />
          <path class="flow-head" d="M108 13l14 5-14 5z" />
          <path class="flow-head" d="M108 31l14 5-14 5z" />
          <path class="flow-head" d="M108 49l14 5-14 5z" />
        </svg>
        <div class="hv-brain">
          <svg viewBox="0 0 48 48" fill="none" class="brain-svg">
            <path d="M24 13v22" />
            <path d="M24 15c-4-5-12-4-12 2-3 1-4 6-1 8-2 4 3 8 7 6 .8 2.7 4.5 3.6 6 1.5" />
            <path d="M24 15c4-5 12-4 12 2 3 1 4 6 1 8 2 4-3 8-7 6-.8 2.7-4.5 3.6-6 1.5" />
            <path d="M14 21H9m5 7H9m30-7h5m-5 7h5" />
            <circle cx="8" cy="21" r="1.5" class="brain-dot" />
            <circle cx="8" cy="28" r="1.5" class="brain-dot" />
            <circle cx="40" cy="21" r="1.5" class="brain-dot" />
            <circle cx="40" cy="28" r="1.5" class="brain-dot" />
          </svg>
          <span class="hv-brain-label">AI</span>
        </div>
      </div>
    </header>

    <div v-if="partialWarning" class="inline-alert warning" role="status">
      <Icon name="info" :size="15" />{{ partialWarning }}
    </div>
    <div v-if="deviceError" class="inline-alert warning" role="status">
      <Icon name="info" :size="15" />设备识别：{{ deviceError }}
    </div>

    <!-- 加载骨架屏 -->
    <div v-if="loading" class="overview-skeleton" aria-live="polite" aria-label="正在加载概览">
      <div class="skeleton-row">
        <SkeletonBlock height="190px" />
        <SkeletonBlock height="190px" />
        <SkeletonBlock height="190px" />
      </div>
      <SkeletonBlock height="150px" />
    </div>

    <!-- 错误状态 -->
    <div v-else-if="error" class="empty-wrap">
      <div class="empty-state" role="alert">
        <Icon name="warning" :size="20" />
        <strong>无法读取数据概览</strong>
        <span>{{ error }}</span>
        <button class="button button-secondary" type="button" @click="loadOverview">重试</button>
      </div>
    </div>

    <!-- 正常内容 -->
    <div v-else class="dashboard-grid">
      <div class="dash-main">
        <div class="stat-row">
          <!-- 24 小时心率 -->
          <section class="surface-card stat-card hr-card" aria-label="24 小时心率">
            <div class="stat-head">
              <span class="stat-label">24 小时心率</span>
              <span class="hr-latest">最新 <strong>{{ num(hrLatest) }}</strong> 次/分</span>
            </div>
            <VChart
              v-if="hrPoints.length > 1"
              class="hr-chart"
              :option="hrChartOption"
              autoresize
              role="img"
              aria-label="24 小时心率曲线"
            />
            <div v-else class="stat-empty">
              <Icon name="info" :size="15" />完成一次同步后展示 24 小时心率曲线。
            </div>
          </section>

          <!-- 今日步数 -->
          <section class="surface-card stat-card steps-card" aria-label="今日步数">
            <div class="stat-head"><span class="stat-label">今日步数</span></div>
            <div class="steps-ring">
              <CircularProgress :value="stepsPercent" :size="104" :stroke-width="9" color="#A6E22E" track-color="rgba(226, 234, 242, .1)">
                <div class="steps-center">
                  <strong>{{ num(stepsToday) }}</strong>
                  <span>步</span>
                </div>
              </CircularProgress>
            </div>
            <p class="stat-foot">目标 {{ formatMetric(STEP_GOAL) }} · {{ stepsPercent }}%</p>
          </section>

          <!-- 昨晚睡眠 -->
          <section class="surface-card stat-card sleep-card" aria-label="昨晚睡眠">
            <div class="stat-head">
              <span class="stat-label">昨晚睡眠</span>
              <span v-if="lastSleep && isFiniteNumber(lastSleep.score)" class="sleep-score">{{ lastSleep.score }}</span>
            </div>
            <template v-if="lastSleep">
              <p class="sleep-main">
                <Icon name="moon" :size="16" class="sleep-moon" />
                <strong>{{ hm(lastSleep.duration_minutes) }}</strong>
              </p>
              <p class="sleep-sub">睡眠评分 <em>{{ isFiniteNumber(lastSleep.score) ? lastSleep.score : '—' }}</em></p>
              <ul class="sleep-stages">
                <li v-for="stage in sleepStages" :key="stage.key">
                  <i class="stage-dot" :style="{ background: stage.color }"></i>
                  <span>{{ stage.label }}</span>
                  <em>{{ hm(stage.minutes) }}</em>
                </li>
              </ul>
            </template>
            <div v-else class="stat-empty">
              <Icon name="info" :size="15" />完成一次同步后展示昨晚睡眠。
            </div>
          </section>
        </div>

        <div class="trio-row">
          <!-- 静息心率 -->
          <section class="surface-card stat-card mini-card" aria-label="静息心率">
            <span class="stat-label"><Icon name="heart" :size="14" class="tone-heart" />静息心率</span>
            <p class="mini-main"><strong class="num">{{ num(restingHr) }}</strong><span class="unit">次/分</span></p>
            <p class="mini-sub">{{ hrUpdatedAt }}</p>
          </section>

          <!-- 训练负荷 -->
          <section class="surface-card stat-card mini-card" aria-label="训练负荷">
            <span class="stat-label">训练负荷</span>
            <div class="load-gauge">
              <svg viewBox="0 0 72 42" fill="none">
                <path d="M8 38 A 28 28 0 0 1 64 38" class="gauge-track" />
                <path
                  d="M8 38 A 28 28 0 0 1 64 38"
                  class="gauge-fill"
                  :stroke-dasharray="LOAD_ARC"
                  :stroke-dashoffset="LOAD_ARC * (1 - loadRatio)"
                />
              </svg>
              <strong class="num">{{ num(trainingLoad) }}</strong>
            </div>
            <p class="mini-sub">{{ loadBand ? `${loadBand} · 建议保持` : '等待同步' }}</p>
          </section>

          <!-- VO₂max -->
          <section class="surface-card stat-card mini-card" aria-label="VO2 max">
            <span class="stat-label"><Icon name="vo2" :size="14" class="tone-mint" />VO₂ max</span>
            <p class="mini-main"><strong class="num">{{ num(vo2max) }}</strong></p>
            <p class="mini-sub">{{ vo2Band ?? '等待同步' }}</p>
          </section>
        </div>

        <!-- 最近记录 -->
        <section class="surface-card recent-card" aria-label="最近记录">
          <div class="stat-head">
            <span class="stat-label">最近记录</span>
            <RouterLink class="text-link" to="/recent">查看全部记录 <Icon name="arrow-right" :size="12" /></RouterLink>
          </div>
          <div v-if="recentItems.length" class="recent-list">
            <RecordRow
              v-for="item in recentItems"
              :key="item.key"
              :to="item.to"
              :category="item.category"
              :icon="item.icon"
              :kicker="item.kicker"
              :title="item.title"
              :fact="item.fact"
              :fact-label="item.factLabel"
            />
          </div>
          <div v-else class="stat-empty">
            <Icon name="info" :size="15" />暂无记录，完成一次同步后展示。
          </div>
        </section>

        <!-- 底部安全保证 -->
        <footer class="security-guarantees-bar">
          <div class="guarantee-item"><Icon name="shield" :size="14" /><span>本地优先</span></div>
          <div class="guarantee-divider"></div>
          <div class="guarantee-item"><Icon name="lock" :size="14" /><span>隐私安全</span></div>
          <div class="guarantee-divider"></div>
          <div class="guarantee-item"><Icon name="braces" :size="14" /><span>结构化数据</span></div>
          <div class="guarantee-divider"></div>
          <div class="guarantee-item"><Icon name="spark" :size="14" /><span>AI-ready</span></div>
        </footer>
      </div>

      <!-- 交给 AI 面板 -->
      <aside class="surface-card ai-panel" aria-label="交给 AI">
        <div class="stat-head">
          <span class="stat-label ai-title"><Icon name="send" :size="14" />交给 AI</span>
          <RouterLink class="text-link" to="/explore">工作台 <Icon name="arrow-right" :size="12" /></RouterLink>
        </div>

        <div class="range-pills" role="group" aria-label="快捷时间范围">
          <button
            v-for="preset in rangePresets"
            :key="preset.days"
            type="button"
            :class="['range-pill', { 'is-on': activeRangeDays === preset.days }]"
            @click="applyExportRange(preset.days)"
          >{{ preset.label }}</button>
        </div>

        <div class="date-range-row">
          <span class="date-field">
            <small>开始</small>
            <span class="date-box"><Icon name="clock" :size="12" />{{ exportStartDate }}</span>
          </span>
          <span class="range-sep">–</span>
          <span class="date-field">
            <small>结束</small>
            <span class="date-box"><Icon name="clock" :size="12" />{{ exportEndDate }}</span>
          </span>
        </div>

        <div class="type-head">
          <span class="group-label">数据类型</span>
          <button class="select-all" type="button" @click="toggleAllTypes">{{ allTypesSelected ? '清空' : '全选' }}</button>
        </div>
        <div class="type-grid" role="group" aria-label="数据类型">
          <button
            v-for="option in exportTypeOptions"
            :key="option.value"
            type="button"
            :class="['type-item', { 'is-on': isTypeSelected(option.value) }]"
            :aria-pressed="isTypeSelected(option.value)"
            @click="toggleType(option.value)"
          >
            <span class="type-box"><Icon v-if="isTypeSelected(option.value)" name="check" :size="11" /></span>
            <span>{{ option.label }}</span>
          </button>
        </div>

        <div class="ai-actions">
          <button class="ai-btn ghost" type="button" :disabled="exportBusy !== null" @click="copyExportJson">
            <Icon name="copy" :size="14" />{{ exportBusy === 'copy' ? '复制中…' : '复制 JSON' }}
          </button>
          <button class="ai-btn solid" type="button" :disabled="exportBusy !== null" @click="saveExportFile">
            <Icon name="export" :size="14" />{{ exportBusy === 'save' ? '保存中…' : '保存文件' }}
          </button>
          <button class="ai-btn solid wide" type="button" :disabled="exportBusy !== null" @click="publishAiFeed">
            <Icon name="database" :size="14" />{{ exportBusy === 'publish' ? '更新中…' : '更新本机 AI 数据源' }}
          </button>
        </div>

        <p v-if="exportMessage" class="ai-note ok" role="status"><Icon name="circle-check" :size="13" />{{ exportMessage }}</p>
        <p v-if="exportError" class="ai-note bad" role="alert"><Icon name="warning" :size="13" />{{ exportError }}</p>
        <p v-if="providerNotice" class="ai-note" role="status"><Icon name="info" :size="13" />{{ providerNotice }}</p>

        <div class="ai-targets">
          <span class="group-label">目标 AI 工具</span>
          <div class="tool-grid">
            <button
              v-for="tool in AI_PROVIDERS"
              :key="tool.id"
              type="button"
              class="tool-pill"
              :title="`打开 ${tool.label}`"
              @click="openProvider(tool)"
            >
              <img
                v-if="!providerIconFailed[tool.id]"
                :src="tool.localIcon"
                :alt="`${tool.label} 图标`"
                @error="markProviderIconFailed(tool.id)"
              />
              <span v-else class="tool-fallback" aria-hidden="true">{{ tool.fallback }}</span>
              <span>{{ tool.label }}</span>
            </button>
          </div>
        </div>

        <p class="ai-footnote"><Icon name="info" :size="12" />导出的 JSON 结构化，便于 AI 理解与分析。</p>
      </aside>
    </div>
  </section>
</template>

<style scoped>
.overview-page { display: grid; gap: 16px; align-content: start; }

/* ── Hero ───────────────────────────────── */
.hero-card {
  display: grid;
  grid-template-columns: minmax(0, 1.15fr) minmax(300px, .85fr);
  gap: 24px;
  align-items: center;
  padding: 26px 28px;
  border: 1px solid var(--line);
  border-radius: var(--radius-md);
  background: var(--surface);
  overflow: hidden;
}
.hero-copy { min-width: 0; }
.hero-copy h1 { margin: 0 0 8px; font-size: 24px; font-weight: 700; color: var(--ink); letter-spacing: -.01em; line-height: 1.25; }
.hero-intro { margin: 0 0 18px; color: var(--muted); font-size: 13px; }
.hero-values { display: flex; flex-wrap: wrap; gap: 12px; margin: 0; padding: 0; list-style: none; }
.hero-values li { display: flex; align-items: center; gap: 10px; min-width: 0; padding: 10px 14px; border: 1px solid var(--line); border-radius: var(--radius-sm); background: var(--surface-raised); }
.hv-icon { display: grid; place-items: center; width: 30px; height: 30px; flex: 0 0 30px; border-radius: 8px; background: var(--accent-soft); color: var(--accent); }
.hv-text { display: grid; gap: 1px; min-width: 0; }
.hv-text strong { color: var(--ink); font-size: 12px; font-weight: 600; white-space: nowrap; }
.hv-text small { color: var(--subtle); font-size: 11px; white-space: nowrap; }

/* 设备 → AI 大脑 图示 */
.hero-visual {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  min-height: 150px;
  padding: 8px 4px;
}
.hv-device { position: relative; z-index: 1; display: grid; justify-items: center; gap: 6px; margin: 0; }
.hv-device :deep(.device-visual) { width: 64px; height: 64px; flex-basis: 64px; border-radius: 14px; }
.hv-device figcaption { max-width: 92px; overflow: hidden; color: var(--subtle); font-size: 10px; text-overflow: ellipsis; white-space: nowrap; }
.hv-a { transform: translateY(-10px); }
.hv-b { transform: translateY(14px); }
.hv-devices { display: flex; gap: 6px; }
.hv-flow { flex: 1; min-width: 60px; height: 72px; color: var(--accent); opacity: .85; }
.flow-line { stroke: currentColor; stroke-width: 2; stroke-dasharray: 5 7; animation: flowdash 1.6s linear infinite; }
.flow-head { fill: currentColor; }
@keyframes flowdash { to { stroke-dashoffset: -12; } }
.hv-brain {
  position: relative;
  z-index: 1;
  display: grid;
  justify-items: center;
  place-items: center;
  gap: 4px;
  width: 76px;
  height: 76px;
  flex: 0 0 76px;
  border: 1px solid color-mix(in srgb, var(--accent) 42%, transparent);
  border-radius: 18px;
  background: var(--accent-soft);
  color: var(--accent);
  box-shadow: 0 0 24px rgba(166, 226, 46, .16);
}
.brain-svg { width: 38px; height: 38px; stroke: currentColor; stroke-width: 2; stroke-linecap: round; stroke-linejoin: round; }
.brain-dot { fill: currentColor; stroke: none; }
.hv-brain-label { font-size: 10px; font-weight: 700; letter-spacing: .14em; }

/* ── 提示 / 骨架 / 空态 ──────────────────── */
.inline-alert { display: flex; align-items: flex-start; gap: 8px; padding: 9px 12px; border: 1px solid var(--line); border-radius: var(--radius-sm); background: var(--surface); color: var(--muted); font-size: 12px; }
.inline-alert.warning { color: var(--warning); }
.overview-skeleton { display: grid; gap: 14px; }
.skeleton-row { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 14px; }
.empty-wrap { display: grid; place-items: center; min-height: 240px; }
.empty-state { display: grid; justify-items: center; gap: 8px; max-width: 340px; padding: 28px; border: 1px dashed var(--line-strong); border-radius: var(--radius-md); color: var(--muted); font-size: 12px; text-align: center; }
.empty-state strong { color: var(--ink); font-size: 14px; }
.empty-state svg { color: var(--warning); }

/* ── 仪表盘网格 ─────────────────────────── */
.dashboard-grid {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 316px;
  gap: 16px;
  align-items: start;
  min-width: 0;
}
.dash-main { display: grid; gap: 16px; min-width: 0; align-content: start; }
.stat-row { display: grid; grid-template-columns: minmax(0, 1.45fr) minmax(0, .72fr) minmax(0, 1.05fr); gap: 16px; }
.trio-row { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 16px; }

.stat-card { display: grid; gap: 10px; align-content: start; padding: 16px 18px; min-width: 0; }
.stat-head { display: flex; align-items: center; justify-content: space-between; gap: 10px; min-width: 0; }
.stat-label { display: inline-flex; align-items: center; gap: 6px; color: var(--muted); font-size: 12px; font-weight: 600; }
.stat-foot { margin: 0; color: var(--subtle); font-size: 11px; text-align: center; font-variant-numeric: tabular-nums; }
.stat-empty { display: flex; align-items: center; justify-content: center; gap: 8px; min-height: 96px; border: 1px dashed var(--line-strong); border-radius: var(--radius-sm); color: var(--subtle); font-size: 12px; text-align: center; padding: 12px; }
.num { font-variant-numeric: tabular-nums; }

/* 24 小时心率 */
.hr-latest { color: var(--muted); font-size: 12px; }
.hr-latest strong { margin: 0 2px; color: var(--accent); font-size: 22px; font-weight: 700; font-variant-numeric: tabular-nums; }
.hr-chart { width: 100%; height: 148px; }

/* 今日步数 */
.steps-card { justify-items: center; }
.steps-card .stat-head { width: 100%; }
.steps-ring { display: grid; place-items: center; padding: 2px 0; }
.steps-center { display: grid; justify-items: center; }
.steps-center strong { color: var(--ink); font-size: 20px; font-weight: 700; font-variant-numeric: tabular-nums; }
.steps-center span { color: var(--subtle); font-size: 10px; }

/* 昨晚睡眠 */
.sleep-score { padding: 2px 9px; border-radius: 999px; background: var(--accent-soft); color: var(--accent); font-size: 12px; font-weight: 700; font-variant-numeric: tabular-nums; }
.sleep-main { display: flex; align-items: baseline; gap: 8px; margin: 0; }
.sleep-moon { align-self: center; color: var(--sleep-light); }
.sleep-main strong { color: var(--ink); font-size: 20px; font-weight: 700; font-variant-numeric: tabular-nums; }
.sleep-sub { margin: -4px 0 0; color: var(--subtle); font-size: 11px; }
.sleep-sub em { font-style: normal; color: var(--muted); font-variant-numeric: tabular-nums; }
.sleep-stages { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 6px 12px; margin: 0; padding: 10px 0 0; border-top: 1px solid var(--line); list-style: none; }
.sleep-stages li { display: flex; align-items: center; gap: 6px; min-width: 0; font-size: 11px; color: var(--muted); }
.stage-dot { width: 7px; height: 7px; flex: 0 0 7px; border-radius: 50%; }
.sleep-stages em { margin-left: auto; font-style: normal; color: var(--subtle); font-variant-numeric: tabular-nums; white-space: nowrap; }

/* 小指标卡 */
.mini-card { gap: 8px; }
.tone-heart { color: var(--heart); }
.tone-mint { color: var(--readiness); }
.mini-main { display: flex; align-items: baseline; gap: 6px; margin: 0; }
.mini-main .num { color: var(--ink); font-size: 26px; font-weight: 700; }
.mini-main .unit { color: var(--subtle); font-size: 11px; }
.mini-sub { margin: 0; color: var(--subtle); font-size: 11px; }
.load-gauge { position: relative; display: grid; justify-items: center; }
.load-gauge svg { width: 108px; height: auto; }
.gauge-track { stroke: rgba(226, 234, 242, .1); stroke-width: 7; stroke-linecap: round; }
.gauge-fill { stroke: var(--accent); stroke-width: 7; stroke-linecap: round; transition: stroke-dashoffset 300ms ease; }
.load-gauge .num { position: absolute; bottom: -2px; color: var(--ink); font-size: 20px; font-weight: 700; }

/* 最近记录 */
.recent-card { padding: 8px 8px 10px; }
.recent-card .stat-head { padding: 8px 12px 4px; }
.recent-list { display: grid; }
.text-link { display: inline-flex; align-items: center; gap: 4px; color: var(--accent); font-size: 12px; text-decoration: none; white-space: nowrap; }
.text-link:hover { text-decoration: underline; }

/* 底部安全保证 */
.security-guarantees-bar { display: flex; align-items: center; justify-content: center; gap: 16px; padding: 11px 16px; border: 1px solid var(--line); border-radius: var(--radius-sm); background: var(--surface); color: var(--subtle); font-size: 11px; }
.guarantee-item { display: inline-flex; align-items: center; gap: 6px; }
.guarantee-item svg { color: var(--accent); }
.guarantee-divider { width: 1px; height: 12px; background: var(--line); }

/* ── 交给 AI 面板 ────────────────────────── */
.ai-panel { display: grid; gap: 12px; align-content: start; padding: 16px 18px; }
.ai-title { color: var(--ink); font-size: 14px; }
.ai-title svg { color: var(--accent); }
.range-pills { display: flex; gap: 8px; }
.range-pill { flex: 1; min-height: 30px; padding: 4px 10px; border: 1px solid var(--line); border-radius: 8px; background: var(--surface-raised); color: var(--muted); font-size: 12px; cursor: pointer; transition: all 140ms ease; }
.range-pill:hover { border-color: var(--line-strong); color: var(--ink); }
.range-pill.is-on { border-color: color-mix(in srgb, var(--accent) 45%, transparent); background: var(--accent-soft); color: var(--accent); font-weight: 600; }
.date-range-row { display: flex; align-items: flex-end; gap: 8px; }
.date-field { display: grid; gap: 4px; flex: 1; min-width: 0; }
.date-field small { color: var(--subtle); font-size: 11px; }
.date-box { display: inline-flex; align-items: center; gap: 6px; min-height: 30px; padding: 4px 10px; border: 1px solid var(--line); border-radius: 8px; background: var(--surface-raised); color: var(--ink); font-size: 11px; font-family: var(--font-mono); white-space: nowrap; }
.date-box svg { color: var(--subtle); }
.range-sep { padding-bottom: 8px; color: var(--subtle); }
.group-label { color: var(--ink); font-size: 12px; font-weight: 700; }
.type-head { display: flex; align-items: center; justify-content: space-between; margin-top: 2px; }
.select-all { border: 0; background: transparent; color: var(--accent); font-size: 11px; cursor: pointer; padding: 2px 4px; }
.select-all:hover { text-decoration: underline; }
.type-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 6px; }
.type-item { display: flex; align-items: center; gap: 8px; min-height: 30px; padding: 5px 9px; border: 1px solid var(--line); border-radius: 8px; background: var(--surface-raised); color: var(--muted); font-size: 12px; cursor: pointer; text-align: left; transition: all 140ms ease; }
.type-item:hover { border-color: var(--line-strong); color: var(--ink); }
.type-item.is-on { border-color: color-mix(in srgb, var(--accent) 40%, transparent); color: var(--ink); }
.type-box { display: grid; place-items: center; width: 15px; height: 15px; flex: 0 0 15px; border: 1px solid var(--line-strong); border-radius: 4px; background: var(--surface); color: var(--accent-ink); }
.type-item.is-on .type-box { border-color: var(--accent); background: var(--accent); }
.ai-actions { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; }
.ai-btn { display: inline-flex; align-items: center; justify-content: center; gap: 6px; min-height: 36px; padding: 6px 10px; border: 1px solid transparent; border-radius: 9px; font-size: 12px; font-weight: 600; cursor: pointer; transition: all 140ms ease; }
.ai-btn:disabled { opacity: .55; cursor: not-allowed; }
.ai-btn.ghost { border-color: var(--line-strong); background: transparent; color: var(--muted); }
.ai-btn.ghost:hover:not(:disabled) { border-color: var(--accent); color: var(--accent); }
.ai-btn.solid { background: var(--action-green); color: #F2F8E8; }
.ai-btn.solid:hover:not(:disabled) { background: var(--action-green-hover); }
.ai-btn.wide { grid-column: 1 / -1; }
.ai-note { display: flex; align-items: flex-start; gap: 6px; margin: 0; font-size: 11px; line-height: 1.5; color: var(--muted); }
.ai-note.ok { color: var(--accent); }
.ai-note.bad { color: var(--danger); }
.ai-targets { display: grid; gap: 8px; padding-top: 4px; border-top: 1px solid var(--line); }
.tool-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(66px, 1fr)); gap: 6px; }
.tool-pill { display: flex; flex-direction: column; align-items: center; gap: 5px; min-height: 56px; padding: 8px 4px 6px; border: 1px solid var(--line); border-radius: 9px; background: var(--surface-raised); color: var(--muted); font-size: 11px; cursor: pointer; transition: all 140ms ease; }
.tool-pill:hover { border-color: var(--accent); color: var(--ink); }
.tool-pill img { width: 18px; height: 18px; object-fit: contain; }
.tool-fallback { display: grid; place-items: center; width: 18px; height: 18px; border-radius: 50%; background: var(--surface); color: var(--muted); font-size: 10px; }
.ai-footnote { display: flex; align-items: flex-start; gap: 6px; margin: 0; color: var(--subtle); font-size: 11px; line-height: 1.5; }
.ai-footnote svg { flex: 0 0 auto; margin-top: 1px; }

/* ── 响应式 ─────────────────────────────── */
@media (max-width: 1120px) {
  .dashboard-grid { grid-template-columns: 1fr; }
  .ai-panel { order: -1; }
}
@media (max-width: 920px) {
  .hero-card { grid-template-columns: 1fr; }
  .hero-visual { max-width: 420px; }
  .stat-row { grid-template-columns: 1fr 1fr; }
  .hr-card { grid-column: 1 / -1; }
  .trio-row { grid-template-columns: 1fr; }
  .security-guarantees-bar { flex-wrap: wrap; gap: 10px; }
  .guarantee-divider { display: none; }
}
@media (max-width: 560px) {
  .stat-row { grid-template-columns: 1fr; }
  .hero-values li { flex: 1 1 100%; }
}
</style>
