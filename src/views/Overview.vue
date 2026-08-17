<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { RouterLink } from 'vue-router';
import { graphic } from 'echarts/core';
import VChart from 'vue-echarts';
import CircularProgress from '../components/CircularProgress.vue';
import DesignIcon, { type DesignIconName } from '../components/DesignIcon.vue';
import DeviceVisual from '../components/DeviceVisual.vue';
import Icon from '../components/Icon.vue';
import RecordRow from '../components/RecordRow.vue';
import SkeletonBlock from '../components/SkeletonBlock.vue';
import helioFallback from '../assets/devices/amazfit-helio-strap.webp';
import trexFallback from '../assets/devices/amazfit-t-rex-3.webp';
import { useDevices } from '../composables/useDevices';
import { useSyncController } from '../composables/useSyncController';
import { backend, isDesktop, toUserMessage } from '../lib/bridge';
import { formatDistance, formatDuration, formatMetric, formatTime, isFiniteNumber, type HealthCategory } from '../lib/format';
import { workoutLabel } from '../lib/labels';
import { displayableWorkouts, workoutDurationMinutes, workoutTypeKey } from '../lib/workouts';
import type { HealthOverview, HeartRatePoint, SleepSession, Workout } from '../types';

const { dataRevision } = useSyncController();
const { models: deviceModels, error: deviceError, load: loadDevices } = useDevices();

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

const fallbackDevices = [
  { key: 't-rex-3', name: 'Amazfit T-Rex 3', image: trexFallback, kind: 'watch' },
  { key: 'helio-strap', name: 'Amazfit Helio Strap', image: helioFallback, kind: 'strap' },
];
const heroDevices = computed(() => {
  const real = deviceModels.value.slice(0, 2).map((model) => ({
    key: model.profile.device_id || model.canonicalName,
    name: model.canonicalName,
    image: model.image,
    kind: model.kind,
  }));
  const usedKinds = new Set(real.map((device) => device.kind));
  const fillers = fallbackDevices.filter((device) => !usedKinds.has(device.kind));
  return [...real, ...fillers, ...fallbackDevices]
    .filter((device, index, all) => all.findIndex((item) => item.key === device.key) === index)
    .slice(0, 2);
});

const hrPoints = computed(() => heartRateSeries.value
  .map((point) => ({ ts: new Date(point.timestamp).getTime(), value: point.value }))
  .filter((point) => Number.isFinite(point.ts) && isFiniteNumber(point.value)));
const hrLatest = computed(() => {
  if (isFiniteNumber(overview.value?.current_hr)) return overview.value.current_hr;
  return hrPoints.value[hrPoints.value.length - 1]?.value ?? null;
});
const hrChartOption = computed(() => {
  const data = hrPoints.value.map((point) => [point.ts, point.value]);
  const last = data[data.length - 1];
  const clock = (value: number) => new Intl.DateTimeFormat('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(value));
  const lineGradient = new graphic.LinearGradient(0, 0, 1, 0, [
    { offset: 0, color: '#63C7FF' },
    { offset: .38, color: '#5FDEA2' },
    { offset: .7, color: '#F4C85C' },
    { offset: 1, color: '#FF6878' },
  ]);
  return {
    animationDuration: 900,
    animationEasing: 'cubicOut' as const,
    grid: { left: 38, right: 18, top: 16, bottom: 26 },
    tooltip: { trigger: 'axis', valueFormatter: (value: number) => `${value} 次/分` },
    xAxis: {
      type: 'time', min: data[0]?.[0], max: last?.[0],
      axisLabel: { formatter: clock, hideOverlap: true, color: '#78818C', fontSize: 10 },
      axisLine: { lineStyle: { color: 'rgba(232,238,244,.12)' } }, axisTick: { show: false }, splitLine: { show: false },
    },
    yAxis: {
      type: 'value', scale: true, splitNumber: 3,
      axisLabel: { color: '#78818C', fontSize: 10 }, axisLine: { show: false }, axisTick: { show: false },
      splitLine: { lineStyle: { color: 'rgba(232,238,244,.08)', type: 'dashed' } },
    },
    series: [{
      type: 'line', data, smooth: .18, showSymbol: false,
      lineStyle: { width: 3, color: lineGradient, cap: 'round', shadowBlur: 8, shadowColor: 'rgba(99,199,255,.18)' },
      areaStyle: { color: new graphic.LinearGradient(0, 0, 0, 1, [
        { offset: 0, color: 'rgba(82,191,186,.24)' },
        { offset: .62, color: 'rgba(61,129,115,.08)' },
        { offset: 1, color: 'rgba(24,28,34,0)' },
      ]) },
    }, {
      type: 'line', data: last ? [last] : [], symbol: 'circle', symbolSize: 10,
      itemStyle: { color: '#FF6878', borderColor: '#F7FAF3', borderWidth: 2 }, lineStyle: { opacity: 0 }, tooltip: { show: false }, z: 5,
    }],
  };
});

const STEP_GOAL = 10000;
const stepsToday = computed(() => isFiniteNumber(overview.value?.steps_today) ? overview.value.steps_today : null);
const stepsPercent = computed(() => stepsToday.value === null ? 0 : Math.min(100, Math.round((stepsToday.value / STEP_GOAL) * 100)));
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

const restingHr = computed(() => isFiniteNumber(overview.value?.resting_hr) ? overview.value.resting_hr : null);
const hrUpdatedAt = computed(() => overview.value?.latest_heart_rate_at ? `最新测量 ${formatTime(overview.value.latest_heart_rate_at)}` : '等待同步');
const trainingLoad = computed(() => isFiniteNumber(overview.value?.training_load) ? overview.value.training_load : null);
const loadRatio = computed(() => trainingLoad.value === null ? 0 : Math.min(1, trainingLoad.value / 600));
const loadAngle = computed(() => -90 + (180 * loadRatio.value));
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

interface RecentItem {
  key: string;
  to: string;
  category: HealthCategory;
  icon: 'moon' | 'run';
  designIcon: DesignIconName;
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
const workoutPresentation = (workout: Workout): Pick<RecentItem, 'category' | 'designIcon'> => {
  const key = workoutTypeKey(workout);
  const label = workoutLabel(workout.workout_type);
  if (/strength|weight|力量|健身|无氧/.test(`${key} ${label}`.toLowerCase())) return { category: 'heart', designIcon: 'body-activity' };
  if (/cycl|ride|骑行/.test(`${key} ${label}`.toLowerCase())) return { category: 'activity', designIcon: 'outdoor-cycling' };
  return { category: 'activity', designIcon: 'outdoor-run' };
};
const recentItems = computed<RecentItem[]>(() => {
  const items: RecentItem[] = recentSleep.value.map((sleep) => ({
    key: `sleep-${sleep.sleep_id}`, to: `/sleep/${sleep.sleep_id}`, category: 'sleep', icon: 'moon', designIcon: 'sleep',
    time: new Date(sleep.end_time || sleep.start_time).getTime(), kicker: shortDateTime(sleep.start_time), title: '睡眠',
    fact: formatDuration(sleep.duration_minutes, '—'), factLabel: isFiniteNumber(sleep.score) ? `睡眠评分 ${sleep.score}` : undefined,
  }));
  for (const workout of displayableWorkouts(recentWorkouts.value)) {
    const presentation = workoutPresentation(workout);
    items.push({
      key: `workout-${workout.workout_id}`, to: `/workouts/${workout.workout_id}`, ...presentation, icon: 'run',
      time: new Date(workout.start_time).getTime(), kicker: shortDateTime(workout.start_time), title: workoutLabel(workout.workout_type),
      fact: isFiniteNumber(workout.distance_meters) && workout.distance_meters > 0 ? formatDistance(workout.distance_meters) : formatDuration(workoutDurationMinutes(workout), '—'),
      factLabel: isFiniteNumber(workout.avg_hr) ? `均心率 ${Math.round(workout.avg_hr)}` : undefined,
    });
  }
  return items.sort((a, b) => b.time - a.time).slice(0, 5);
});

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
    backend.getHealthOverview(), backend.getHeartRateSeries(24), backend.getRecentSleep(3), backend.getRecentWorkouts(5),
  ]);
  const [health, heartRate, sleep, workouts] = results;
  overview.value = health.status === 'fulfilled' ? health.value : null;
  heartRateSeries.value = heartRate.status === 'fulfilled' ? heartRate.value : [];
  recentSleep.value = sleep.status === 'fulfilled' ? sleep.value : [];
  recentWorkouts.value = workouts.status === 'fulfilled' ? workouts.value : [];
  const rejected = results.filter((result) => result.status === 'rejected');
  if (rejected.length === results.length) error.value = toUserMessage(rejected[0].reason, '健康数据暂时不可用');
  else if (rejected.length) partialWarning.value = toUserMessage(rejected[0].reason, '部分数据流尚未获取');
  loading.value = false;
};

onMounted(() => { void loadOverview(); void loadDevices(); });
watch(dataRevision, () => { void loadOverview(); void loadDevices(); });
</script>

<template>
  <section class="page overview-page" aria-labelledby="overview-title">
    <header class="hero-card">
      <div class="hero-copy">
        <p class="hero-kicker"><span></span> LOCAL HEALTH DATA BRIDGE</p>
        <h1 id="overview-title">你的穿戴数据，<br><em>已准备好交给 AI</em></h1>
        <p class="hero-intro">本地优先，保留数据来源，将 T-Rex 3 与 Helio Strap 的记录整理成清晰、可用的健康档案。</p>
        <ul class="hero-values">
          <li><DesignIcon name="secure" :size="46" /><span><strong>安全</strong><small>数据留在本机</small></span></li>
          <li><DesignIcon name="private" :size="46" /><span><strong>私密</strong><small>不上传原始记录</small></span></li>
          <li><DesignIcon name="ai-ready" :size="46" /><span><strong>AI-ready</strong><small>结构化再交付</small></span></li>
        </ul>
      </div>

      <div class="hero-visual" aria-label="T-Rex 3 与 Helio Strap 数据汇入本地 AI 数据桥">
        <div class="device-stack">
          <figure v-for="(device, index) in heroDevices" :key="device.key" :class="['hero-device', `device-${index + 1}`]">
            <span class="device-plinth"><DeviceVisual :src="device.image" :alt="device.name" :kind="device.kind" /></span>
            <figcaption>{{ device.name }}</figcaption>
          </figure>
        </div>
        <svg class="data-flow" viewBox="0 0 180 88" fill="none" preserveAspectRatio="none" aria-hidden="true">
          <path d="M0 22H142" /><path d="M0 44H142" /><path d="M0 66H142" />
          <path class="arrow" d="m142 17 18 5-18 5z" /><path class="arrow" d="m142 39 18 5-18 5z" /><path class="arrow" d="m142 61 18 5-18 5z" />
        </svg>
        <div class="ai-node"><DesignIcon name="ai-chip" :size="94" /><span>LOCAL AI</span></div>
      </div>
    </header>

    <div v-if="partialWarning" class="inline-alert warning" role="status"><Icon name="info" :size="15" />{{ partialWarning }}</div>
    <div v-if="deviceError" class="inline-alert warning" role="status"><Icon name="info" :size="15" />设备识别：{{ deviceError }}</div>

    <div v-if="loading" class="overview-skeleton" aria-live="polite" aria-label="正在加载概览">
      <SkeletonBlock height="270px" /><div class="skeleton-grid"><SkeletonBlock v-for="index in 6" :key="index" height="188px" /></div>
    </div>
    <div v-else-if="error" class="empty-wrap">
      <div class="empty-state" role="alert"><DesignIcon name="cloud-output" :size="72" /><strong>无法读取数据概览</strong><span>{{ error }}</span><button class="button button-secondary" type="button" @click="loadOverview">重试</button></div>
    </div>

    <div v-else class="dashboard-grid">
      <section class="metric-panel hr-panel" aria-label="24 小时心率">
        <div class="panel-head"><span class="panel-title"><DesignIcon name="heart-rate" :size="38" /><span><strong>24 小时心率</strong><small>全天波动</small></span></span><span class="latest-value">最新 <strong>{{ num(hrLatest) }}</strong><small>次/分</small></span></div>
        <VChart v-if="hrPoints.length > 1" class="hr-chart" :option="hrChartOption" autoresize role="img" aria-label="24 小时多彩心率曲线" />
        <div v-else class="panel-empty"><DesignIcon name="heart-rate" :size="56" /><span>同步后展示真实的 24 小时心率波动。</span></div>
      </section>

      <section class="metric-panel steps-panel" aria-label="今日步数">
        <div class="panel-head"><span class="panel-title"><DesignIcon name="steps" :size="38" /><span><strong>今日步数</strong><small>目标 {{ formatMetric(STEP_GOAL) }}</small></span></span></div>
        <div class="steps-content">
          <CircularProgress :value="stepsPercent" :size="132" :stroke-width="11" color="#66D77D" track-color="rgba(116, 216, 137, .12)">
            <div class="steps-center"><strong>{{ num(stepsToday) }}</strong><span>步</span></div>
          </CircularProgress>
          <p><strong>{{ stepsPercent }}%</strong><span>今日目标</span></p>
        </div>
      </section>

      <section class="metric-panel sleep-panel" aria-label="昨晚睡眠">
        <div class="panel-head"><span class="panel-title"><DesignIcon name="sleep" :size="38" /><span><strong>昨晚睡眠</strong><small>睡眠结构简介</small></span></span><span v-if="lastSleep && isFiniteNumber(lastSleep.score)" class="sleep-score">{{ lastSleep.score }}</span></div>
        <template v-if="lastSleep">
          <p class="sleep-total">{{ hm(lastSleep.duration_minutes) }}</p>
          <div class="sleep-bar" aria-label="睡眠阶段比例"><span v-for="stage in sleepStages" :key="stage.key" :style="{ flex: Math.max(1, stage.minutes || 0), background: stage.color }"></span></div>
          <ul class="sleep-stages"><li v-for="stage in sleepStages" :key="stage.key"><i :style="{ background: stage.color }"></i><span>{{ stage.label }}</span><strong>{{ hm(stage.minutes) }}</strong></li></ul>
        </template>
        <div v-else class="panel-empty compact"><DesignIcon name="sleep" :size="50" /><span>同步后展示昨晚睡眠。</span></div>
      </section>

      <section class="metric-panel mini-panel resting-panel" aria-label="静息心率">
        <div class="mini-icon"><DesignIcon name="resting-heart-rate" :size="68" /></div><div><p class="mini-label">静息心率</p><p class="mini-value"><strong>{{ num(restingHr) }}</strong><span>次/分</span></p><p class="mini-note">{{ hrUpdatedAt }}</p></div>
      </section>

      <section class="metric-panel mini-panel load-panel" aria-label="训练负荷">
        <div class="load-copy"><p class="mini-label">训练负荷</p><p class="mini-note">{{ loadBand ? `${loadBand} · 结合近期训练` : '等待同步' }}</p></div>
        <div class="load-gauge">
          <svg viewBox="0 0 140 82" fill="none" aria-hidden="true"><path d="M18 70 A52 52 0 0 1 49 22" class="load-low" /><path d="M49 22 A52 52 0 0 1 91 22" class="load-mid" /><path d="M91 22 A52 52 0 0 1 122 70" class="load-high" /><g class="needle" :style="{ transform: `rotate(${loadAngle}deg)` }"><path d="M70 68 70 28" /><circle cx="70" cy="68" r="5" /></g></svg>
          <strong>{{ num(trainingLoad) }}</strong>
        </div>
        <DesignIcon class="load-art" name="training-load" :size="60" />
      </section>

      <section class="metric-panel mini-panel vo2-panel" aria-label="VO2 Max">
        <div class="mini-icon"><DesignIcon name="vo2-max" :size="68" /></div><div><p class="mini-label">VO₂ Max</p><p class="mini-value"><strong>{{ num(vo2max) }}</strong></p><p class="mini-note">{{ vo2Band ?? '等待同步' }}</p></div>
      </section>

      <section class="metric-panel recent-panel" aria-label="最近记录">
        <div class="panel-head"><span class="panel-title"><DesignIcon name="document" :size="38" /><span><strong>最近记录</strong><small>睡眠、跑步与力量训练</small></span></span><RouterLink class="text-link" to="/recent">查看全部 <DesignIcon name="chevron-right" :size="22" /></RouterLink></div>
        <div v-if="recentItems.length" class="recent-list"><RecordRow v-for="item in recentItems" :key="item.key" :to="item.to" :category="item.category" :icon="item.icon" :design-icon="item.designIcon" :kicker="item.kicker" :title="item.title" :fact="item.fact" :fact-label="item.factLabel" /></div>
        <div v-else class="panel-empty recent-empty"><DesignIcon name="document" :size="58" /><span>暂无记录，完成一次同步后展示。</span></div>
      </section>
    </div>
  </section>
</template>

<style scoped>
.overview-page { display: grid; gap: 18px; align-content: start; max-width: 1540px; margin: 0 auto; }
.hero-card { position: relative; display: grid; grid-template-columns: minmax(0, 1.08fr) minmax(440px, .92fr); min-height: 292px; overflow: hidden; border: 1px solid rgba(220,232,239,.1); border-radius: 26px; background: radial-gradient(700px 320px at 92% 20%, rgba(136,164,73,.13), transparent 68%), linear-gradient(135deg, #1C2026, #181C20 68%); box-shadow: inset 0 1px 0 rgba(255,255,255,.045), 0 20px 48px rgba(5,8,10,.15); }
.hero-card::before { position: absolute; inset: 0; pointer-events: none; content: ''; background-image: linear-gradient(rgba(255,255,255,.018) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.018) 1px, transparent 1px); background-size: 34px 34px; mask-image: linear-gradient(90deg, transparent 35%, black); }
.hero-copy { position: relative; padding: 34px 10px 30px 34px; align-self: center; }
.hero-kicker { display: flex; align-items: center; gap: 8px; margin: 0 0 12px; color: #A3BD69; font-family: var(--font-mono); font-size: 10px; letter-spacing: .12em; }.hero-kicker span { width: 26px; height: 1px; background: #9DBB58; }
.hero-copy h1 { margin: 0; color: #F5F7F0; font-size: clamp(27px, 2.3vw, 39px); font-weight: 700; letter-spacing: -.04em; line-height: 1.18; }.hero-copy h1 em { color: #C7DC80; font-style: normal; }
.hero-intro { max-width: 640px; margin: 13px 0 22px; color: #9AA3AD; font-size: 13px; line-height: 1.75; }
.hero-values { display: flex; flex-wrap: wrap; gap: 10px; margin: 0; padding: 0; list-style: none; }.hero-values li { display: flex; min-width: 148px; align-items: center; gap: 8px; padding: 6px 12px 6px 5px; border: 1px solid rgba(222,232,239,.09); border-radius: 15px; background: rgba(38,43,49,.72); box-shadow: inset 0 1px 0 rgba(255,255,255,.04); }.hero-values li > span { display: grid; gap: 1px; }.hero-values strong { color: #EEF2E7; font-size: 12px; }.hero-values small { color: #78818B; font-size: 10px; }
.hero-visual { position: relative; display: grid; grid-template-columns: 1fr minmax(100px, .8fr) auto; align-items: center; min-width: 0; padding: 26px 34px 26px 8px; }.device-stack { position: relative; min-width: 180px; height: 222px; }.hero-device { position: absolute; display: grid; justify-items: center; gap: 5px; margin: 0; }.device-1 { top: 4px; left: 0; }.device-2 { right: 0; bottom: 3px; }
.device-plinth { display: grid; width: 108px; height: 92px; place-items: center; border: 1px solid rgba(221,232,240,.09); border-radius: 22px; background: linear-gradient(145deg, rgba(45,50,58,.9), rgba(26,30,35,.78)); box-shadow: inset 0 1px 0 rgba(255,255,255,.055), 0 14px 30px rgba(3,5,7,.28); }.hero-device :deep(.device-visual) { width: 98px; height: 84px; flex-basis: 84px; border: 0; background: transparent; }.hero-device :deep(.device-visual img) { padding: 1px; filter: drop-shadow(0 9px 12px rgba(0,0,0,.28)); }.hero-device figcaption { max-width: 145px; overflow: hidden; color: #818A94; font-size: 10px; text-overflow: ellipsis; white-space: nowrap; }
.data-flow { width: 100%; height: 88px; color: #8FB348; overflow: visible; }.data-flow path:not(.arrow) { stroke: currentColor; stroke-width: 2; stroke-dasharray: 6 8; animation: flow 1.7s linear infinite; }.data-flow .arrow { fill: currentColor; }@keyframes flow { to { stroke-dashoffset: -28; } }
.ai-node { display: grid; justify-items: center; gap: 1px; min-width: 108px; color: #9CB965; font-family: var(--font-mono); font-size: 9px; letter-spacing: .15em; }.ai-node .design-icon { animation: float 3.4s ease-in-out infinite; filter: drop-shadow(0 16px 22px rgba(6,10,8,.36)); }@keyframes float { 50% { transform: translateY(-5px); } }
.inline-alert { display: flex; align-items: center; gap: 8px; padding: 9px 13px; border: 1px solid var(--line); border-radius: 12px; background: var(--surface); color: var(--muted); font-size: 12px; }.inline-alert.warning { color: var(--warning); }
.overview-skeleton { display: grid; gap: 16px; }.skeleton-grid { display: grid; grid-template-columns: repeat(3, minmax(0,1fr)); gap: 16px; }.empty-wrap { display: grid; min-height: 300px; place-items: center; }.empty-state { display: grid; max-width: 360px; justify-items: center; gap: 9px; padding: 32px; color: var(--muted); text-align: center; }.empty-state strong { color: var(--ink); font-size: 16px; }
.dashboard-grid { display: grid; grid-template-columns: repeat(12, minmax(0, 1fr)); gap: 16px; }.metric-panel { position: relative; min-width: 0; overflow: hidden; border: 1px solid rgba(221,231,239,.09); border-radius: 22px; background: linear-gradient(145deg, rgba(31,35,41,.98), rgba(27,31,36,.98)); box-shadow: inset 0 1px 0 rgba(255,255,255,.035); transition: transform .28s cubic-bezier(.16,1,.3,1), border-color .28s ease; }.metric-panel:hover { transform: translateY(-2px); border-color: rgba(221,231,239,.15); }
.hr-panel { grid-column: span 6; min-height: 286px; padding: 20px 20px 12px; }.steps-panel, .sleep-panel { grid-column: span 3; min-height: 286px; padding: 18px; }.mini-panel { grid-column: span 4; min-height: 166px; padding: 18px; }.recent-panel { grid-column: 1 / -1; padding: 18px; }
.panel-head { display: flex; min-width: 0; align-items: center; justify-content: space-between; gap: 12px; }.panel-title { display: flex; min-width: 0; align-items: center; gap: 8px; }.panel-title > span { display: grid; gap: 1px; }.panel-title strong { color: #EEF1EC; font-size: 13px; }.panel-title small { color: #737C86; font-size: 10px; }.latest-value { display: flex; align-items: baseline; gap: 5px; color: #78818B; font-size: 11px; }.latest-value strong { color: #F1F5EC; font-family: var(--font-mono); font-size: 26px; }.latest-value small { font-size: 10px; }
.hr-chart { width: 100%; height: 218px; }.panel-empty { display: flex; min-height: 190px; align-items: center; justify-content: center; gap: 12px; color: #717A84; font-size: 11px; text-align: center; }.panel-empty.compact { min-height: 170px; flex-direction: column; }.panel-empty .design-icon { opacity: .7; filter: saturate(.8); }
.steps-content { display: grid; min-height: 220px; place-items: center; align-content: center; gap: 10px; }.steps-center { display: grid; justify-items: center; }.steps-center strong { color: #F4F6EF; font-family: var(--font-mono); font-size: 22px; }.steps-center span { color: #74D889; font-size: 10px; }.steps-content > p { display: flex; gap: 8px; margin: 0; color: #747D87; font-size: 10px; }.steps-content > p strong { color: #6AD980; font-family: var(--font-mono); }
.sleep-panel { background: radial-gradient(380px 240px at 90% 0, rgba(104,87,217,.12), transparent 70%), linear-gradient(145deg, #20222C, #1C1F27); }.sleep-score { padding: 4px 10px; border-radius: 999px; background: rgba(131,109,235,.14); color: #A895FF; font-family: var(--font-mono); font-size: 12px; }.sleep-total { margin: 18px 0 10px; color: #F4F3FC; font-family: var(--font-mono); font-size: 21px; font-weight: 700; }.sleep-bar { display: flex; gap: 3px; height: 7px; overflow: hidden; border-radius: 999px; }.sleep-bar span { min-width: 3px; border-radius: 999px; }.sleep-stages { display: grid; grid-template-columns: repeat(2, minmax(0,1fr)); gap: 8px 12px; margin: 14px 0 0; padding: 0; list-style: none; }.sleep-stages li { display: grid; grid-template-columns: auto auto 1fr; align-items: center; gap: 5px; min-width: 0; color: #9299A4; font-size: 10px; }.sleep-stages i { width: 6px; height: 6px; border-radius: 50%; }.sleep-stages strong { overflow: hidden; color: #C4C8D0; font-family: var(--font-mono); font-size: 9px; font-weight: 500; text-align: right; text-overflow: ellipsis; white-space: nowrap; }
.mini-panel { display: grid; grid-template-columns: auto minmax(0,1fr); align-items: center; gap: 14px; }.mini-icon { display: grid; width: 76px; height: 76px; place-items: center; overflow: hidden; border-radius: 21px; }.mini-label { margin: 0; color: #A1A8B0; font-size: 12px; }.mini-value { display: flex; align-items: baseline; gap: 6px; margin: 4px 0; }.mini-value strong { color: #F5F6F2; font-family: var(--font-mono); font-size: 30px; line-height: 1; }.mini-value span { color: #858E98; font-size: 10px; }.mini-note { margin: 0; color: #747D87; font-size: 10px; }.resting-panel { background: radial-gradient(300px 180px at 0 100%, rgba(225,75,88,.1), transparent 72%), linear-gradient(145deg, #221E23, #1D2025); }
.load-panel { grid-template-columns: minmax(0,1fr) 150px auto; }.load-copy { align-self: start; }.load-gauge { position: relative; display: grid; width: 150px; height: 92px; place-items: center; }.load-gauge svg { position: absolute; inset: 0; width: 100%; height: 100%; }.load-gauge svg > path { fill: none; stroke-width: 10; stroke-linecap: round; }.load-low { stroke: #64D483; }.load-mid { stroke: #E5C04F; }.load-high { stroke: #EB6568; }.needle { transform-origin: 70px 68px; transition: transform 700ms cubic-bezier(.16,1,.3,1); }.needle path { stroke: #F2F5EC; stroke-width: 2; stroke-linecap: round; }.needle circle { fill: #F2F5EC; }.load-gauge strong { align-self: end; margin-bottom: 5px; color: #F5F6F2; font-family: var(--font-mono); font-size: 18px; }.load-art { opacity: .8; }.vo2-panel { background: radial-gradient(320px 190px at 0 100%, rgba(41,161,221,.09), transparent 70%), linear-gradient(145deg, #1C2328, #1D2025); }
.text-link { display: inline-flex; align-items: center; gap: 3px; color: #9DBA5D; font-size: 11px; text-decoration: none; }.text-link:hover { color: #C7DC80; }.recent-list { display: grid; grid-template-columns: repeat(2, minmax(0,1fr)); margin-top: 12px; overflow: hidden; border: 1px solid rgba(226,234,242,.07); border-radius: 16px; }.recent-list :deep(.record-row:nth-child(odd)) { border-right: 1px solid var(--line); }.recent-list :deep(.record-row) { min-height: 72px; transition: background .2s ease, transform .2s ease; }.recent-list :deep(.record-row:hover) { transform: translateX(2px); }.recent-empty { min-height: 120px; }
@media (max-width: 1180px) { .hero-card { grid-template-columns: minmax(0,1fr); }.hero-visual { min-height: 250px; padding: 0 34px 24px; }.hero-copy { padding-right: 34px; }.hr-panel { grid-column: span 8; }.steps-panel { grid-column: span 4; }.sleep-panel { grid-column: span 6; }.mini-panel { grid-column: span 6; }.vo2-panel { grid-column: span 6; } }
@media (max-width: 820px) { .overview-page { padding-inline: 16px; }.hero-card { border-radius: 20px; }.hero-copy { padding: 26px 22px 18px; }.hero-visual { grid-template-columns: 1fr 100px; padding: 0 20px 24px; }.data-flow { display: none; }.device-stack { height: 205px; }.hero-values li { min-width: calc(50% - 5px); }.dashboard-grid { grid-template-columns: minmax(0,1fr); }.hr-panel,.steps-panel,.sleep-panel,.mini-panel,.recent-panel { grid-column: 1; }.load-panel { grid-template-columns: minmax(0,1fr) 145px; }.load-art { display: none; }.recent-list { grid-template-columns: minmax(0,1fr); }.recent-list :deep(.record-row:nth-child(odd)) { border-right: 0; }.skeleton-grid { grid-template-columns: minmax(0,1fr); } }
@media (max-width: 520px) { .hero-visual { display: none; }.hero-values { display: grid; }.hero-values li { min-width: 0; }.sleep-stages { grid-template-columns: minmax(0,1fr); }.load-panel { grid-template-columns: minmax(0,1fr); }.load-gauge { justify-self: center; } }
@media (prefers-reduced-motion: reduce) { .data-flow path, .ai-node .design-icon { animation: none; }.metric-panel { transition: none; } }
</style>
