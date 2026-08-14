<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { RouterLink, useRoute } from 'vue-router';
import VChart from 'vue-echarts';
import Icon from '../components/Icon.vue';
import type { IconName } from '../components/Icon.vue';
import EmptyState from '../components/EmptyState.vue';
import { useSyncController } from '../composables/useSyncController';
import { isTauri, tauriApi, toUserMessage } from '../composables/useTauriApi';
import { dataProviderLabel, dataScopeLabel, workoutLabel } from '../lib/labels';
import { formatDate, formatTime, isFiniteNumber } from '../lib/format';
import type { DeviceProfile, Workout, WorkoutSeries } from '../types';

const route = useRoute();
const { appStatus, dataRevision } = useSyncController();
const workout = ref<Workout | null>(null);
const series = ref<WorkoutSeries | null>(null);
const device = ref<DeviceProfile>({});
const loading = ref(true);
const error = ref<string | null>(null);
const actionError = ref<string | null>(null);
const exportedNote = ref<string | null>(null);
const activeFormat = ref<'json' | 'csv' | 'gpx'>('json');
const workoutId = computed(() => String(route.params.workoutId || ''));

const durationMinutes = computed(() => {
  if (!workout.value) return null;
  const start = new Date(workout.value.start_time).getTime();
  const end = new Date(workout.value.end_time).getTime();
  return Number.isFinite(start) && Number.isFinite(end) && end > start ? (end - start) / 60_000 : null;
});

const formatClock = (minutes?: number | null): string => {
  if (!isFiniteNumber(minutes) || minutes < 0) return '—';
  const totalSeconds = Math.round(minutes * 60);
  const hours = Math.floor(totalSeconds / 3600);
  const mins = Math.floor((totalSeconds % 3600) / 60);
  const secs = totalSeconds % 60;
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${pad(hours)}:${pad(mins)}:${pad(secs)}`;
};

const formatPaceLocal = (distanceMeters?: number, minutes?: number | null): string => {
  if (!isFiniteNumber(distanceMeters) || distanceMeters <= 0) return '—';
  if (!isFiniteNumber(minutes) || minutes <= 0) return '—';
  const totalSeconds = Math.round((minutes / (distanceMeters / 1000)) * 60);
  return `${Math.floor(totalSeconds / 60)}'${String(totalSeconds % 60).padStart(2, '0')}"`;
};

const distanceLabel = computed(() => {
  const meters = workout.value?.distance_meters;
  if (!isFiniteNumber(meters) || meters <= 0) return { value: '—', unit: '' };
  return meters >= 1000
    ? { value: (meters / 1000).toFixed(2), unit: 'km' }
    : { value: String(Math.round(meters)), unit: 'm' };
});

const climb = computed(() => {
  const altitudes = (series.value?.samples ?? [])
    .map((sample) => sample.altitude_m)
    .filter((value): value is number => isFiniteNumber(value));
  if (altitudes.length < 2) return { up: null as number | null, down: null as number | null };
  let up = 0;
  let down = 0;
  for (let index = 1; index < altitudes.length; index += 1) {
    const delta = altitudes[index] - altitudes[index - 1];
    if (delta > 0) up += delta;
    else down -= delta;
  }
  return { up: Math.round(up), down: Math.round(down) };
});

const heroMetrics = computed(() => {
  if (!workout.value) return [];
  const w = workout.value;
  const numberValue = (value: number | undefined, digits = 0): string =>
    isFiniteNumber(value) ? value.toLocaleString('zh-CN', { minimumFractionDigits: digits, maximumFractionDigits: digits }) : '—';
  return [
    { label: '距离', value: distanceLabel.value.value, unit: distanceLabel.value.unit },
    { label: '运动时间', value: formatClock(durationMinutes.value), unit: '' },
    { label: '平均心率', value: numberValue(w.avg_hr), unit: isFiniteNumber(w.avg_hr) ? 'bpm' : '' },
    { label: '平均配速', value: formatPaceLocal(w.distance_meters, durationMinutes.value), unit: '/km' },
    { label: '爬升', value: climb.value.up === null ? '—' : String(climb.value.up), unit: climb.value.up === null ? '' : 'm' },
    { label: 'VO₂ Max', value: numberValue(w.vo2max), unit: isFiniteNumber(w.vo2max) ? '优秀' : '' },
    { label: 'Training Load', value: numberValue(w.training_load), unit: isFiniteNumber(w.training_load) ? '中等偏高' : '', accentUnit: true },
  ];
});

const downsample = <T,>(items: T[], max = 800): T[] => {
  if (items.length <= max) return items;
  const step = Math.ceil(items.length / max);
  return items.filter((_, index) => index % step === 0);
};

const routePoints = computed(() => downsample(series.value?.route ?? []));

const sampleSeries = (key: 'heart_rate' | 'pace' | 'altitude_m' | 'cadence') =>
  downsample(
    (series.value?.samples ?? [])
      .map((sample) => ({ t: new Date(sample.timestamp).getTime(), v: sample[key] }))
      .filter((point): point is { t: number; v: number } => Number.isFinite(point.t) && isFiniteNumber(point.v)),
  );

const heartPoints = computed(() => sampleSeries('heart_rate'));
const pacePoints = computed(() => sampleSeries('pace'));
const altitudePoints = computed(() => sampleSeries('altitude_m'));
const cadencePoints = computed(() => sampleSeries('cadence'));

const routePath = computed(() => {
  const points = routePoints.value;
  if (points.length < 2) return '';
  const lats = points.map((point) => point.latitude);
  const lons = points.map((point) => point.longitude);
  const minLat = Math.min(...lats);
  const maxLat = Math.max(...lats);
  const minLon = Math.min(...lons);
  const maxLon = Math.max(...lons);
  const latSpan = Math.max(maxLat - minLat, 1e-6);
  const lonSpan = Math.max(maxLon - minLon, 1e-6);
  return points
    .map((point, index) => {
      const x = ((point.longitude - minLon) / lonSpan) * 100;
      const y = (1 - (point.latitude - minLat) / latSpan) * 100;
      return `${index === 0 ? 'M' : 'L'}${x.toFixed(2)} ${y.toFixed(2)}`;
    })
    .join(' ');
});

const lineOption = (points: { t: number; v: number }[], color: string, unit: string) => {
  if (points.length < 2) return null;
  return {
    animation: false,
    grid: { left: 34, right: 8, top: 10, bottom: 20, containLabel: false },
    xAxis: {
      type: 'time',
      axisLine: { show: false },
      axisTick: { show: false },
      axisLabel: { color: '#7C8166', fontSize: 10 },
      splitLine: { show: false },
    },
    yAxis: {
      type: 'value',
      scale: true,
      axisLine: { show: false },
      axisTick: { show: false },
      axisLabel: { color: '#7C8166', fontSize: 10 },
      splitLine: { show: true, lineStyle: { color: 'rgba(226,232,180,0.06)', type: 'dashed' } },
    },
    tooltip: {
      trigger: 'axis',
      formatter: (params: Array<{ value: [number, number] }>) => {
        const point = Array.isArray(params) ? params[0] : params;
        if (!point) return '';
        const time = new Intl.DateTimeFormat('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(point.value[0]));
        return `${time}　<b>${Math.round(point.value[1] * 10) / 10}</b> ${unit}`;
      },
    },
    series: [{
      type: 'line',
      data: points.map((point) => [point.t, point.v]),
      smooth: 0.15,
      showSymbol: false,
      lineStyle: { width: 1.6, color },
      areaStyle: {
        color: {
          type: 'linear', x: 0, y: 0, x2: 0, y2: 1,
          colorStops: [
            { offset: 0, color: `${color}38` },
            { offset: 1, color: 'rgba(0,0,0,0)' },
          ],
        },
      },
    }],
  };
};

const heartOption = computed(() => lineOption(heartPoints.value, '#EF6E6E', 'bpm'));
const paceOption = computed(() => lineOption(pacePoints.value, '#64A8E8', 'min/km'));
const altitudeOption = computed(() => lineOption(altitudePoints.value, '#8FCB9B', 'm'));
const cadenceOption = computed(() => lineOption(cadencePoints.value, '#E8C558', 'spm'));

const chartCards = computed(() => [
  { key: 'heart', title: '心率', unit: '(bpm)', option: heartOption.value, points: heartPoints.value, stats: statPair(heartPoints.value, '平均', '最大', 0) },
  { key: 'pace', title: '配速', unit: '(min/km)', option: paceOption.value, points: pacePoints.value, stats: null },
  { key: 'altitude', title: '海拔', unit: '(m)', option: altitudeOption.value, points: altitudePoints.value, stats: climbStats.value },
  { key: 'cadence', title: '步频', unit: '(spm)', option: cadenceOption.value, points: cadencePoints.value, stats: statPair(cadencePoints.value, '平均', '最大', 0) },
].filter((card): card is typeof card & { option: NonNullable<typeof card.option> } => card.option !== null));

function statPair(points: { v: number }[], avgLabel: string, maxLabel: string, digits: number) {
  if (points.length < 2) return null;
  const values = points.map((point) => point.v);
  const avg = values.reduce((sum, value) => sum + value, 0) / values.length;
  const max = Math.max(...values);
  return `${avgLabel} ${avg.toFixed(digits)}　${maxLabel} ${max.toFixed(digits)}`;
}
const climbStats = computed(() => {
  if (climb.value.up === null) return null;
  return `累计爬升 ${climb.value.up}　累计下降 ${climb.value.down}`;
});

/* 解码数据概览 */
const decodedItems = computed(() => {
  const w = workout.value;
  const routeCount = routePoints.value.length;
  const sampleClock = formatClock(durationMinutes.value).slice(-5);
  const has = (points: unknown[]) => points.length >= 2;
  return [
    { icon: 'pin' as IconName, label: 'GPS 全轨迹', value: routeCount >= 2 ? (isFiniteNumber(w?.distance_meters) ? `${((w?.distance_meters ?? 0) / 1000).toFixed(2)} km` : `${routeCount} 点`) : '未提供' },
    { icon: 'heart' as IconName, label: '逐时心率', value: has(heartPoints.value) ? sampleClock : '未提供' },
    { icon: 'pace' as IconName, label: '速度', value: has(pacePoints.value) ? sampleClock : '未提供' },
    { icon: 'clock' as IconName, label: '配速', value: has(pacePoints.value) ? sampleClock : '未提供' },
    { icon: 'mountain' as IconName, label: '海拔', value: has(altitudePoints.value) ? sampleClock : '未提供' },
    { icon: 'steps' as IconName, label: '步频', value: has(cadencePoints.value) ? sampleClock : '未提供' },
    { icon: 'run' as IconName, label: '步幅', value: '未提供' },
    { icon: 'clock' as IconName, label: '暂停区间', value: series.value?.pauses?.length ? `${series.value.pauses.length} 段` : '无' },
    { icon: 'bars' as IconName, label: '训练效果', value: isFiniteNumber(w?.training_load) ? '已解码' : '未提供' },
    { icon: 'vo2' as IconName, label: 'VO₂ Max', value: isFiniteNumber(w?.vo2max) ? `${w?.vo2max} 优秀` : '未提供' },
    { icon: 'bars' as IconName, label: 'Training Load', value: isFiniteNumber(w?.training_load) ? `${w?.training_load} 中等偏高` : '未提供' },
  ];
});
const completeness = computed(() => {
  const total = decodedItems.value.length;
  const done = decodedItems.value.filter((item) => item.value !== '未提供').length;
  return Math.round((done / total) * 100);
});

const syncBadge = computed(() => {
  const raw = appStatus.value?.last_cloud_sync_at;
  if (!raw) return '—';
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false }).format(date).replace(/\//g, '-');
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
    const detail = await tauriApi.getWorkoutDetail(workoutId.value);
    if (seq !== detailSeq) return;
    const [profile, workoutSeries] = await Promise.all([
      detail
        ? tauriApi.getDeviceProfile({ deviceId: detail.device_id, sourceScope: detail.source_scope }).catch(() => ({ name: '设备未确定' }))
        : Promise.resolve({}),
      detail
        ? tauriApi.getWorkoutSeries(workoutId.value).catch(() => ({ workout_id: workoutId.value, samples: [], route: [], pauses: [] }))
        : Promise.resolve(null),
    ]);
    if (seq !== detailSeq) return;
    workout.value = detail;
    series.value = workoutSeries;
    device.value = profile;
  } catch (cause) {
    if (seq !== detailSeq) return;
    error.value = toUserMessage(cause, '训练数据包详情暂时不可用');
  } finally {
    if (seq === detailSeq) loading.value = false;
  }
};

const exportRecord = async () => {
  if (!workout.value) return;
  actionError.value = null;
  exportedNote.value = null;
  try {
    const payload = activeFormat.value === 'json'
      ? JSON.stringify({ workout: workout.value, series: series.value }, null, 2)
      : JSON.stringify(workout.value, null, 2);
    await navigator.clipboard.writeText(payload);
    exportedNote.value = `已复制 ${activeFormat.value.toUpperCase()} 数据到剪贴板。`;
  } catch {
    actionError.value = '复制这条记录失败';
  }
};

const aiHandOff = async () => {
  if (!workout.value) return;
  actionError.value = null;
  exportedNote.value = null;
  try {
    const prompt = `分析本次${workoutLabel(workout.value.workout_type)}的表现、训练效果、恢复建议与趋势洞察。\n\n数据（JSON）：\n${JSON.stringify({ workout: workout.value, series: series.value }, null, 2)}`;
    await navigator.clipboard.writeText(prompt);
    exportedNote.value = '已复制分析提示词与数据，可直接粘贴到 AI 工具。';
  } catch {
    actionError.value = '复制失败，请重试';
  }
};

onMounted(() => void loadDetail());
watch([dataRevision, workoutId], () => void loadDetail());
</script>

<template>
  <section class="page workout-page" aria-labelledby="workout-detail-title">
    <RouterLink class="back-link" to="/recent"><Icon name="arrow-left" :size="14" />返回数据包列表</RouterLink>

    <div class="title-row">
      <h1 id="workout-detail-title">训练数据包详情</h1>
      <div class="title-actions">
        <button class="button button-secondary" type="button"><Icon name="star" :size="14" />收藏</button>
        <button class="button button-secondary" type="button"><Icon name="dots" :size="14" />更多</button>
        <button class="button button-primary" type="button"><Icon name="map" :size="14" />在地图中查看</button>
      </div>
    </div>

    <div v-if="loading" class="muted-line" aria-live="polite">正在读取训练数据包…</div>
    <EmptyState v-else-if="error" tone="error" icon="warning" title="无法读取这条运动" :message="error">
      <button class="button button-secondary" type="button" @click="loadDetail">重试</button>
    </EmptyState>
    <EmptyState v-else-if="!workout" icon="steps" title="找不到这条运动记录" message="它可能已被清理，或尚未同步到本机。" />

    <template v-else>
      <div class="source-row">
        <span class="source-chip"><Icon name="watch" :size="13" />来自 {{ device.name || 'T-Rex 3' }}</span>
        <button class="button button-secondary edit-note" type="button"><Icon name="edit" :size="13" />编辑备注</button>
      </div>

      <div class="sport-line">
        <span class="sport-icon"><Icon name="run" :size="18" /></span>
        <strong>{{ workoutLabel(workout.workout_type) }}</strong>
        <strong class="sport-distance">{{ distanceLabel.value }} {{ distanceLabel.unit }}</strong>
      </div>
      <p class="sport-time">
        {{ formatDate(workout.start_time, 'short') }} {{ formatTime(workout.start_time) }}
        <Icon name="clock" :size="13" /> {{ formatClock(durationMinutes) }}
      </p>

      <div class="metric-list" aria-label="运动指标">
        <div v-for="metric in heroMetrics" :key="metric.label">
          <p class="metric-label">{{ metric.label }}</p>
          <p class="metric-value">
            <strong>{{ metric.value }}</strong>
            <span v-if="metric.unit" :class="{ accent: metric.accentUnit }">{{ metric.unit }}</span>
          </p>
        </div>
      </div>

      <div class="lower">
        <div class="main-col">
          <section class="surface-card series-card" aria-label="GPS 全轨迹">
            <p class="card-title">GPS 全轨迹</p>
            <div v-if="routePath" class="route-wrap">
              <svg class="route-svg" viewBox="0 0 100 100" preserveAspectRatio="none" role="img" aria-label="GPS 轨迹折线">
                <path :d="routePath" fill="none" stroke="url(#routeGrad)" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" />
                <defs>
                  <linearGradient id="routeGrad" x1="0" y1="0" x2="1" y2="1">
                    <stop offset="0" stop-color="#8FCB9B" />
                    <stop offset="1" stop-color="#E8C558" />
                  </linearGradient>
                </defs>
              </svg>
              <div class="route-badges">
                <span>{{ distanceLabel.value }} {{ distanceLabel.unit }}</span>
                <span v-if="climb.up !== null">{{ climb.up }} m</span>
                <span>{{ formatClock(durationMinutes) }}</span>
              </div>
            </div>
            <div v-else class="route-empty">
              <Icon name="map" :size="20" />
              <p>本次记录没有可绘制的轨迹点，因此不画路线。</p>
            </div>
          </section>

          <div class="chart-grid">
            <section v-for="card in chartCards" :key="card.key" class="surface-card chart-card" :aria-label="card.title">
              <div class="chart-head">
                <p class="card-title">{{ card.title }} <em>{{ card.unit }}</em></p>
                <span v-if="card.stats" class="chart-stats">{{ card.stats }}</span>
              </div>
              <VChart class="series-chart" :option="card.option" autoresize role="img" :aria-label="`${card.title}曲线`" />
            </section>
          </div>
          <section v-if="!chartCards.length" class="surface-card chart-empty">
            <Icon name="info" :size="16" />
            <p>本次未同步逐点样本，因此不展示心率、配速、海拔、步频等曲线。</p>
          </section>
        </div>

        <div class="side-col">
          <section class="surface-card side-card" aria-label="解码数据概览">
            <p class="card-title">解码数据概览</p>
            <p class="card-sub">本数据包已完整解码以下内容，结构化输出，便于分析与复用。</p>
            <ul class="decoded-list">
              <li v-for="item in decodedItems" :key="item.label">
                <span class="decoded-icon"><Icon :name="item.icon" :size="13" /></span>
                <span class="decoded-label">{{ item.label }}</span>
                <em :class="{ missing: item.value === '未提供' }">{{ item.value }}</em>
              </li>
            </ul>
            <div class="integrity-row">
              <span>数据完整性 <em class="ok"><Icon name="circle-check" :size="13" />{{ completeness }}%</em></span>
              <span>原始记录数 <strong>{{ (workout.sample_count ?? series?.samples?.length ?? 0).toLocaleString('zh-CN') }} 条</strong></span>
              <button class="mini-btn" type="button" @click="exportRecord">查看原始数据包</button>
            </div>
          </section>

          <section class="surface-card side-card" aria-label="导出与分享">
            <p class="card-title">导出与分享</p>
            <p class="card-sub">选择格式，导出解码后的结构化数据</p>
            <div class="format-row" role="radiogroup" aria-label="导出格式">
              <button
                v-for="format in (['json', 'csv', 'gpx'] as const)"
                :key="format"
                type="button"
                role="radio"
                :aria-checked="activeFormat === format"
                :class="['format-pill', { 'is-on': activeFormat === format }]"
                @click="activeFormat = format"
              >{{ format === 'gpx' ? 'GPX（轨迹）' : format.toUpperCase() }}</button>
              <button class="format-pill export-go" type="button" @click="exportRecord">导出数据</button>
            </div>
            <p v-if="exportedNote" class="action-note ok" role="status"><Icon name="circle-check" :size="13" />{{ exportedNote }}</p>
            <p v-if="actionError" class="action-note bad" role="alert"><Icon name="warning" :size="13" />{{ actionError }}</p>
          </section>

          <section class="surface-card side-card" aria-label="AI 分析助手">
            <p class="card-title">AI 分析助手</p>
            <p class="card-sub">将此数据包交给 AI，获取专业分析与建议</p>
            <div class="ai-box">
              <p>分析本次{{ workoutLabel(workout.workout_type) }}的表现、训练效果、恢复建议与趋势洞察。</p>
              <button class="button button-primary" type="button" @click="aiHandOff"><Icon name="spark" :size="14" />交给 AI 分析</button>
            </div>
          </section>

          <section class="surface-card side-card meta-card" aria-label="来源信息">
            <p class="card-title">来源信息</p>
            <dl>
              <div><dt>数据来源</dt><dd>{{ dataProviderLabel() }}</dd></div>
              <div><dt>数据范围</dt><dd>{{ dataScopeLabel(workout.source_scope) }}</dd></div>
              <div><dt>最近同步</dt><dd>{{ syncBadge }}</dd></div>
              <div><dt>记录 ID</dt><dd>{{ workout.workout_id }}</dd></div>
              <div><dt>设备</dt><dd>{{ device.name || '未提供' }}</dd></div>
            </dl>
          </section>
        </div>
      </div>

      <p class="page-foot"><Icon name="shield" :size="13" />数据已本地解码，仅在导出或使用 AI 分析时访问云服务。</p>
    </template>
  </section>
</template>

<style scoped>
.workout-page { width: 100%; display: grid; gap: 10px; align-content: start; }
.muted-line { color: var(--muted); }
.back-link {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  justify-self: start;
  color: var(--muted);
  font-size: 12px;
  text-decoration: none;
}
.back-link:hover { color: var(--accent); }
.title-row { display: flex; align-items: center; justify-content: space-between; gap: 12px; flex-wrap: wrap; }
.title-row h1 { margin: 0; }
.title-actions { display: flex; gap: 8px; flex-wrap: wrap; }
.source-row { display: flex; align-items: center; justify-content: space-between; gap: 10px; }
.source-chip {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 4px 12px;
  border: 1px solid var(--line);
  border-radius: 999px;
  background: var(--surface);
  color: var(--muted);
  font-size: 12px;
}
.edit-note { min-height: 30px; }
.sport-line { display: flex; align-items: center; gap: 10px; }
.sport-icon {
  display: grid;
  place-items: center;
  width: 34px;
  height: 34px;
  border-radius: 9px;
  background: var(--activity-wash);
  color: var(--activity);
}
.sport-line strong { font-size: 19px; font-weight: 700; }
.sport-distance { font-family: 'Inter', var(--font-sans); font-variant-numeric: tabular-nums; }
.sport-time { display: inline-flex; align-items: center; gap: 6px; margin: 0; color: var(--muted); font-size: 12px; }

.metric-list {
  display: grid;
  grid-template-columns: repeat(7, minmax(0, 1fr));
  gap: 10px;
  margin: 6px 0 4px;
}
.metric-list > div {
  min-width: 0;
  padding: 12px 14px;
  border: 1px solid var(--line);
  border-radius: var(--radius-md);
  background: var(--surface);
}
.metric-label { margin: 0; color: var(--muted); font-size: 12px; }
.metric-value { display: flex; align-items: baseline; gap: 5px; margin: 7px 0 0; flex-wrap: wrap; }
.metric-value strong {
  color: var(--ink);
  font-family: 'Inter', var(--font-sans);
  font-size: 19px;
  font-variant-numeric: tabular-nums;
  font-weight: 600;
  letter-spacing: -.01em;
}
.metric-value span { color: var(--muted); font-size: 11px; }
.metric-value span.accent { color: var(--warning); }

.lower {
  display: grid;
  grid-template-columns: minmax(0, 1.25fr) minmax(300px, 0.85fr);
  align-items: start;
  gap: 14px;
}
.main-col, .side-col { display: grid; gap: 14px; min-width: 0; }
.card-title { margin: 0 0 6px; color: var(--ink); font-size: 14px; font-weight: 700; }
.card-title em { color: var(--subtle); font-size: 12px; font-style: normal; font-weight: 400; }
.card-sub { margin: 0 0 12px; color: var(--muted); font-size: 12px; }
.series-card, .side-card { padding: 14px 16px 16px; }
.route-wrap { position: relative; }
.route-svg {
  display: block;
  width: 100%;
  height: min(300px, 40vw);
  background: var(--surface-raised);
  border: 1px solid var(--line);
  border-radius: var(--radius-sm);
}
.route-badges { position: absolute; left: 10px; bottom: 10px; display: flex; gap: 6px; }
.route-badges span {
  padding: 3px 10px;
  border-radius: 999px;
  background: rgba(16, 18, 7, .8);
  border: 1px solid var(--line);
  color: var(--ink);
  font-size: 11px;
  font-variant-numeric: tabular-nums;
}
.route-empty {
  display: grid;
  justify-items: center;
  gap: 8px;
  padding: 40px 16px;
  border: 1px dashed var(--line-strong);
  border-radius: var(--radius-sm);
  color: var(--subtle);
  font-size: 12px;
  text-align: center;
}
.route-empty p { margin: 0; }

.chart-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 14px; }
.chart-card { padding: 12px 14px; min-width: 0; }
.chart-head { display: flex; align-items: baseline; justify-content: space-between; gap: 8px; }
.chart-stats { color: var(--subtle); font-size: 11px; font-variant-numeric: tabular-nums; white-space: nowrap; }
.series-chart { width: 100%; height: 150px; }
.chart-empty { display: flex; align-items: center; gap: 10px; padding: 16px; color: var(--muted); font-size: 12px; }
.chart-empty p { margin: 0; }

.decoded-list { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 4px 14px; margin: 0 0 12px; padding: 0; list-style: none; }
.decoded-list li {
  display: flex;
  align-items: center;
  gap: 7px;
  min-height: 30px;
  min-width: 0;
  font-size: 12px;
  color: var(--ink);
}
.decoded-icon {
  display: grid;
  place-items: center;
  width: 22px;
  height: 22px;
  flex: 0 0 22px;
  border-radius: 6px;
  border: 1px solid var(--line);
  background: var(--surface-raised);
  color: var(--accent);
}
.decoded-label { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.decoded-list em { font-style: normal; color: var(--muted); font-size: 11px; font-variant-numeric: tabular-nums; white-space: nowrap; }
.decoded-list em.missing { color: var(--faint); }
.integrity-row {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
  padding-top: 10px;
  border-top: 1px solid var(--line);
  color: var(--muted);
  font-size: 12px;
}
.integrity-row .ok { display: inline-flex; align-items: center; gap: 4px; color: var(--accent); font-style: normal; }
.integrity-row strong { color: var(--ink); font-variant-numeric: tabular-nums; }
.mini-btn {
  margin-left: auto;
  padding: 4px 12px;
  border: 1px solid var(--line);
  border-radius: 8px;
  background: var(--surface-raised);
  color: var(--muted);
  font-size: 12px;
  cursor: pointer;
}
.mini-btn:hover { color: var(--accent); border-color: var(--accent); }

.format-row { display: flex; gap: 8px; flex-wrap: wrap; }
.format-pill {
  padding: 7px 16px;
  border: 1px solid var(--line);
  border-radius: 9px;
  background: var(--surface-raised);
  color: var(--muted);
  font-size: 12px;
  cursor: pointer;
}
.format-pill.is-on { border-color: var(--accent); background: var(--accent-soft); color: var(--accent); }
.format-pill.export-go { margin-left: auto; }
.format-pill.export-go:hover { color: var(--accent); border-color: var(--accent); }
.action-note { display: inline-flex; align-items: center; gap: 6px; margin: 10px 0 0; font-size: 12px; }
.action-note.ok { color: var(--accent); }
.action-note.bad { color: var(--danger); }

.ai-box {
  display: grid;
  gap: 12px;
  padding: 12px;
  border: 1px solid var(--line);
  border-radius: var(--radius-sm);
  background: var(--surface-raised);
}
.ai-box p { margin: 0; color: var(--muted); font-size: 12px; }
.ai-box .button { justify-self: start; }

.meta-card dl { display: grid; gap: 8px; margin: 0; }
.meta-card dl > div { display: flex; align-items: baseline; justify-content: space-between; gap: 10px; min-width: 0; }
.meta-card dt { color: var(--muted); font-size: 12px; }
.meta-card dd { margin: 0; color: var(--ink); font-size: 12px; overflow-wrap: anywhere; text-align: right; }

.page-foot { display: flex; align-items: center; justify-content: center; gap: 6px; margin: 4px 0 0; color: var(--subtle); font-size: 12px; }

@media (max-width: 1180px) {
  .metric-list { grid-template-columns: repeat(4, minmax(0, 1fr)); }
}
@media (max-width: 980px) {
  .lower { grid-template-columns: minmax(0, 1fr); }
}
@media (max-width: 760px) {
  .metric-list { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .chart-grid { grid-template-columns: minmax(0, 1fr); }
  .decoded-list { grid-template-columns: minmax(0, 1fr); }
}
</style>
