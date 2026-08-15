<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { RouterLink, useRoute } from 'vue-router';
import VChart from 'vue-echarts';
import EmptyState from '../components/EmptyState.vue';
import Icon from '../components/Icon.vue';
import SkeletonBlock from '../components/SkeletonBlock.vue';
import { useSyncController } from '../composables/useSyncController';
import { isTauri, tauriApi, toUserMessage } from '../composables/useTauriApi';
import { dataProviderLabel, dataScopeLabel, workoutLabel } from '../lib/labels';
import { formatDate, formatDistance, formatTime, isFiniteNumber } from '../lib/format';
import type { DeviceProfile, Workout, WorkoutSeries, WorkoutSeriesSample, WorkoutRoutePoint } from '../types';

type WorkoutMetrics = Workout & {
  pace?: number | string | null;
  duration_minutes?: number | null;
};

interface RouteCanvasPoint extends WorkoutRoutePoint {
  x: number;
  y: number;
  pace: number | null;
  paceDelta: number | null;
  paused: boolean;
}

interface RouteSegment {
  d: string;
  color: string;
  from: RouteCanvasPoint;
  to: RouteCanvasPoint;
}

const route = useRoute();
const { appStatus, dataRevision } = useSyncController();
const workout = ref<WorkoutMetrics | null>(null);
const series = ref<WorkoutSeries | null>(null);
const device = ref<DeviceProfile>({});
const loading = ref(true);
const error = ref<string | null>(null);
const actionError = ref<string | null>(null);
const exportedNote = ref<string | null>(null);
const activeFormat = ref<'json' | 'csv' | 'gpx'>('json');
const workoutId = computed(() => String(route.params.workoutId || ''));

const durationMinutes = computed(() => {
  const item = workout.value;
  if (!item) return null;
  if (isFiniteNumber(item.duration_minutes) && item.duration_minutes >= 0) return item.duration_minutes;
  const start = new Date(item.start_time).getTime();
  const end = new Date(item.end_time).getTime();
  return Number.isFinite(start) && Number.isFinite(end) && end > start ? (end - start) / 60_000 : null;
});

const formatClock = (minutes?: number | null): string => {
  if (!isFiniteNumber(minutes) || minutes < 0) return '未提供';
  const totalSeconds = Math.round(minutes * 60);
  const hours = Math.floor(totalSeconds / 3600);
  const mins = Math.floor((totalSeconds % 3600) / 60);
  const secs = totalSeconds % 60;
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${pad(hours)}:${pad(mins)}:${pad(secs)}`;
};

const paceText = (minutes?: number | null): string => {
  if (!isFiniteNumber(minutes) || minutes <= 0) return '未提供';
  const totalSeconds = Math.round(minutes * 60);
  return `${Math.floor(totalSeconds / 60)}'${String(totalSeconds % 60).padStart(2, '0')}" /km`;
};

const distanceLabel = computed(() => formatDistance(workout.value?.distance_meters, '未提供'));
const rawPace = computed(() => workout.value?.pace);
const paceLabel = computed(() => {
  if (typeof rawPace.value === 'string' && rawPace.value.trim()) return rawPace.value.trim();
  if (isFiniteNumber(rawPace.value)) return paceText(rawPace.value);
  return '未提供';
});

const numberValue = (value: unknown, digits = 0): string => isFiniteNumber(value)
  ? value.toLocaleString('zh-CN', { minimumFractionDigits: digits, maximumFractionDigits: digits })
  : '未提供';

const heroMetrics = computed(() => {
  const item = workout.value;
  if (!item) return [];
  const metrics: Array<{ label: string; value: string; unit?: string; tone: string }> = [];
  if (isFiniteNumber(item.distance_meters) && item.distance_meters > 0) metrics.push({ label: '距离', value: distanceLabel.value, unit: '', tone: 'distance' });
  if (durationMinutes.value !== null) metrics.push({ label: '运动时间', value: formatClock(durationMinutes.value), unit: '', tone: 'training' });
  if (paceLabel.value !== '未提供') metrics.push({ label: '平均配速', value: paceLabel.value, unit: '', tone: 'pace' });
  if (isFiniteNumber(item.avg_hr)) metrics.push({ label: '平均心率', value: numberValue(item.avg_hr), unit: 'bpm', tone: 'heart' });
  if (isFiniteNumber(item.calories)) metrics.push({ label: '消耗', value: numberValue(item.calories), unit: 'kcal', tone: 'calories' });
  if (isFiniteNumber(item.training_load)) metrics.push({ label: 'Training Load', value: numberValue(item.training_load), tone: 'training' });
  if (isFiniteNumber(item.vo2max)) metrics.push({ label: 'VO₂ Max', value: numberValue(item.vo2max), tone: 'training' });
  return metrics;
});

const downsample = <T,>(items: T[], max = 800): T[] => {
  if (items.length <= max) return items;
  const step = Math.ceil(items.length / max);
  const sampled = items.filter((_, index) => index % step === 0);
  const last = items[items.length - 1];
  if (sampled[sampled.length - 1] !== last) sampled.push(last);
  return sampled;
};

const rawRoute = computed(() => [...(series.value?.route ?? [])].sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()));
const routePoints = computed(() => downsample(rawRoute.value));

const samplesByTime = computed(() => [...(series.value?.samples ?? [])]
  .map((sample) => ({ sample, time: new Date(sample.timestamp).getTime() }))
  .filter((item) => Number.isFinite(item.time))
  .sort((a, b) => a.time - b.time));

const pauses = computed(() => (series.value?.pauses ?? []).map((pause) => ({
  start: new Date(pause.start_time).getTime(),
  end: new Date(pause.end_time).getTime(),
})).filter((pause) => Number.isFinite(pause.start) && Number.isFinite(pause.end) && pause.end > pause.start));

const nearestPace = (timestamp: number): { value: number | null; delta: number | null } => {
  let best: { value: number | null; delta: number | null } = { value: null, delta: null };
  for (const item of samplesByTime.value) {
    const delta = Math.abs(item.time - timestamp);
    if (best.delta !== null && delta > best.delta) continue;
    if (isFiniteNumber(item.sample.pace) && item.sample.pace > 0) best = { value: item.sample.pace, delta };
  }
  // A sample from a different part of a workout should not paint the route.
  return best.delta !== null && best.delta <= 45_000 ? best : { value: null, delta: best.delta };
};

const isPaused = (from: number, to: number): boolean => pauses.value.some((pause) => Math.max(from, pause.start) <= Math.min(to, pause.end));
const haversineMeters = (a: WorkoutRoutePoint, b: WorkoutRoutePoint): number => {
  const rad = Math.PI / 180;
  const dLat = (b.latitude - a.latitude) * rad;
  const dLon = (b.longitude - a.longitude) * rad;
  const lat1 = a.latitude * rad;
  const lat2 = b.latitude * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 6_371_000 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(Math.max(0, 1 - h)));
};

const percentile = (values: number[], ratio: number): number => {
  const sorted = [...values].sort((a, b) => a - b);
  if (!sorted.length) return 0;
  const index = Math.min(sorted.length - 1, Math.max(0, Math.floor((sorted.length - 1) * ratio)));
  return sorted[index];
};

const routeColor = (pace: number | null, low: number, high: number, enoughPace: boolean): string => {
  if (!enoughPace || pace === null) return 'var(--route-neutral)';
  const span = Math.max(high - low, 1e-6);
  const ratio = Math.max(0, Math.min(1, (pace - low) / span));
  if (ratio <= .2) return 'var(--route-mint)';
  if (ratio <= .45) return 'var(--route-cyan)';
  if (ratio <= .72) return 'var(--route-amber)';
  return 'var(--route-coral)';
};

const routeCanvas = computed(() => {
  const points = routePoints.value;
  if (points.length < 2) return null;
  const lats = points.map((point) => point.latitude);
  const lons = points.map((point) => point.longitude);
  const minLat = Math.min(...lats);
  const maxLat = Math.max(...lats);
  const minLon = Math.min(...lons);
  const maxLon = Math.max(...lons);
  const latSpan = Math.max(maxLat - minLat, 1e-7);
  const lonSpan = Math.max(maxLon - minLon, 1e-7);
  const canvasPoints: RouteCanvasPoint[] = points.map((point) => {
    const time = new Date(point.timestamp).getTime();
    const pace = nearestPace(time);
    return {
      ...point,
      x: ((point.longitude - minLon) / lonSpan) * 100,
      y: (1 - (point.latitude - minLat) / latSpan) * 100,
      pace: pace.value,
      paceDelta: pace.delta,
      paused: Number.isFinite(time) && pauses.value.some((pause) => time >= pause.start && time <= pause.end),
    };
  });
  const validPaces = canvasPoints.map((point) => point.pace).filter((pace): pace is number => isFiniteNumber(pace) && pace > 0 && pace < 60);
  const enoughPace = validPaces.length >= 3;
  const low = enoughPace ? percentile(validPaces, .1) : 0;
  const high = enoughPace ? percentile(validPaces, .9) : 0;
  const segments: RouteSegment[] = [];
  for (let index = 1; index < canvasPoints.length; index += 1) {
    const from = canvasPoints[index - 1];
    const to = canvasPoints[index];
    const fromTime = new Date(from.timestamp).getTime();
    const toTime = new Date(to.timestamp).getTime();
    const seconds = (toTime - fromTime) / 1000;
    const distance = haversineMeters(from, to);
    const jump = !Number.isFinite(seconds) || seconds <= 0 || seconds > 120 || distance > Math.max(500, seconds * 12 + 100);
    const paused = from.paused || to.paused || isPaused(fromTime, toTime);
    const paceMissing = enoughPace && (from.pace === null || to.pace === null || (from.paceDelta ?? Infinity) > 45_000 || (to.paceDelta ?? Infinity) > 45_000);
    if (jump || paused || paceMissing) continue;
    const pace = from.pace !== null && to.pace !== null ? (from.pace + to.pace) / 2 : null;
    segments.push({ d: `M${from.x.toFixed(2)} ${from.y.toFixed(2)} L${to.x.toFixed(2)} ${to.y.toFixed(2)}`, color: routeColor(pace, low, high, enoughPace), from, to });
  }
  const markers = segments.filter((_, index) => index % Math.max(1, Math.ceil(segments.length / 6)) === 0).map((segment) => ({
    x: (segment.from.x + segment.to.x) / 2,
    y: (segment.from.y + segment.to.y) / 2,
    angle: Math.atan2(segment.to.y - segment.from.y, segment.to.x - segment.from.x) * 180 / Math.PI,
  }));
  const pauseMarkers = pauses.value.map((pause) => {
    const target = canvasPoints.reduce((best, point) => {
      const time = new Date(point.timestamp).getTime();
      const distance = Math.abs(time - pause.start);
      return distance < best.distance ? { point, distance } : best;
    }, { point: canvasPoints[0], distance: Infinity }).point;
    return { x: target.x, y: target.y };
  });
  return {
    segments,
    markers,
    pauseMarkers,
    start: canvasPoints[0],
    end: canvasPoints[canvasPoints.length - 1],
    validPaceCount: validPaces.length,
    enoughPace,
  };
});

const sampleSeries = (key: keyof Pick<WorkoutSeriesSample, 'heart_rate' | 'pace' | 'altitude_m' | 'cadence'>) => downsample(
  (series.value?.samples ?? [])
    .map((sample) => ({ t: new Date(sample.timestamp).getTime(), v: sample[key] }))
    .filter((point): point is { t: number; v: number } => Number.isFinite(point.t) && isFiniteNumber(point.v)),
);
const heartPoints = computed(() => sampleSeries('heart_rate'));
const pacePoints = computed(() => sampleSeries('pace'));
const altitudePoints = computed(() => sampleSeries('altitude_m'));
const cadencePoints = computed(() => sampleSeries('cadence'));

const lineOption = (points: { t: number; v: number }[], color: string, unit: string) => {
  if (points.length < 2) return null;
  return {
    animation: false,
    grid: { left: 34, right: 8, top: 10, bottom: 20, containLabel: false },
    xAxis: { type: 'time', axisLine: { show: false }, axisTick: { show: false }, axisLabel: { color: '#8A969D', fontSize: 10 }, splitLine: { show: false } },
    yAxis: { type: 'value', scale: true, axisLine: { show: false }, axisTick: { show: false }, axisLabel: { color: '#8A969D', fontSize: 10 }, splitLine: { show: true, lineStyle: { color: 'rgba(224,235,240,0.08)', type: 'dashed' } } },
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
      type: 'line', data: points.map((point) => [point.t, point.v]), smooth: 0.15, showSymbol: false,
      lineStyle: { width: 1.6, color },
      areaStyle: { color: { type: 'linear', x: 0, y: 0, x2: 0, y2: 1, colorStops: [{ offset: 0, color: `${color}38` }, { offset: 1, color: 'rgba(17,21,24,0)' }] } },
    }],
  };
};

const heartOption = computed(() => lineOption(heartPoints.value, '#FF777A', 'bpm'));
const paceOption = computed(() => lineOption(pacePoints.value, '#6ED8F5', 'min/km'));
const altitudeOption = computed(() => lineOption(altitudePoints.value, '#76E5BF', 'm'));
const cadenceOption = computed(() => lineOption(cadencePoints.value, '#FFB866', 'spm'));

const statSummary = (points: { v: number }[], mode: 'normal' | 'pace' = 'normal'): string | null => {
  if (points.length < 2) return null;
  const values = points.map((point) => point.v);
  const avg = values.reduce((sum, value) => sum + value, 0) / values.length;
  const min = Math.min(...values);
  const max = Math.max(...values);
  if (mode === 'pace') return `最小 ${paceText(min)} · 平均 ${paceText(avg)} · 最大 ${paceText(max)}`;
  return `最小 ${numberValue(min, 1)} · 平均 ${numberValue(avg, 1)} · 最大 ${numberValue(max, 1)}`;
};

const chartCards = computed(() => [
  { key: 'heart', title: '心率', unit: '(bpm)', option: heartOption.value, stats: statSummary(heartPoints.value) },
  { key: 'pace', title: '配速', unit: '(min/km)', option: paceOption.value, stats: statSummary(pacePoints.value, 'pace') },
  { key: 'altitude', title: '海拔', unit: '(m)', option: altitudeOption.value, stats: statSummary(altitudePoints.value) },
  { key: 'cadence', title: '步频', unit: '(spm)', option: cadenceOption.value, stats: statSummary(cadencePoints.value) },
].filter((card): card is typeof card & { option: NonNullable<typeof card.option> } => card.option !== null));

const syncBadge = computed(() => {
  const raw = appStatus.value?.last_cloud_sync_at;
  if (!raw) return '尚未获取';
  const date = new Date(raw);
  return Number.isNaN(date.getTime()) ? '时间未知' : new Intl.DateTimeFormat('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false }).format(date).replace(/\//g, '-');
});

let detailSeq = 0;
const loadDetail = async () => {
  const seq = ++detailSeq;
  loading.value = true;
  error.value = null;
  if (!isTauri()) { loading.value = false; return; }
  try {
    const detail = await tauriApi.getWorkoutDetail(workoutId.value);
    if (seq !== detailSeq) return;
    const [profile, workoutSeries] = await Promise.all([
      detail ? tauriApi.getDeviceProfile({ deviceId: detail.device_id, sourceScope: detail.source_scope }).catch(() => ({})) : Promise.resolve({}),
      detail ? tauriApi.getWorkoutSeries(workoutId.value).catch(() => ({ workout_id: workoutId.value, samples: [], route: [], pauses: [] })) : Promise.resolve(null),
    ]);
    if (seq !== detailSeq) return;
    workout.value = detail as WorkoutMetrics | null;
    series.value = workoutSeries;
    device.value = profile;
  } catch (cause) {
    if (seq === detailSeq) error.value = toUserMessage(cause, '训练数据包详情暂时不可用');
  } finally {
    if (seq === detailSeq) loading.value = false;
  }
};

const exportRecord = async () => {
  if (!workout.value) return;
  actionError.value = null;
  exportedNote.value = null;
  try {
    const payload = activeFormat.value === 'json' ? JSON.stringify({ workout: workout.value, series: series.value }, null, 2) : JSON.stringify(workout.value, null, 2);
    await navigator.clipboard.writeText(payload);
    exportedNote.value = `已复制 ${activeFormat.value.toUpperCase()} 数据到剪贴板。`;
  } catch { actionError.value = '复制这条记录失败'; }
};

onMounted(() => void loadDetail());
watch([dataRevision, workoutId], () => void loadDetail());
</script>

<template>
  <section class="page workout-page" aria-labelledby="workout-detail-title">
    <RouterLink class="back-link" to="/recent"><Icon name="arrow-left" :size="14" />返回数据包列表</RouterLink>
    <div class="title-row"><h1 id="workout-detail-title">训练数据包详情</h1></div>

    <div v-if="loading" class="detail-loading" aria-live="polite"><SkeletonBlock height="118px" /><SkeletonBlock height="280px" /></div>
    <EmptyState v-else-if="error" tone="error" icon="warning" title="无法读取这条运动" :message="error"><button class="button button-secondary" type="button" @click="loadDetail">重试</button></EmptyState>
    <EmptyState v-else-if="!workout" icon="steps" title="找不到这条运动记录" message="它可能已被清理，或尚未同步到本机。" />

    <template v-else>
      <div class="source-row"><span class="source-chip"><Icon name="watch" :size="13" />来自 {{ device.canonical_name || device.name || '未提供' }}</span></div>
      <div class="sport-line"><span class="sport-icon"><Icon name="run" :size="18" /></span><strong>{{ workoutLabel(workout.workout_type) }}</strong><strong class="sport-distance">{{ distanceLabel }}</strong></div>
      <p class="sport-time">{{ formatDate(workout.start_time, 'short') }} {{ formatTime(workout.start_time) }} <Icon name="clock" :size="13" /> {{ formatClock(durationMinutes) }}</p>

      <div class="metric-list" aria-label="运动表现总结"><div v-for="metric in heroMetrics" :key="metric.label" :class="`tone-${metric.tone}`"><p class="metric-label">{{ metric.label }}</p><p class="metric-value"><strong>{{ metric.value }}</strong><span v-if="metric.unit">{{ metric.unit }}</span></p></div></div>

      <div class="lower">
        <div class="main-col">
          <section class="surface-card series-card" aria-label="GPS 全轨迹">
            <div class="chart-head"><p class="card-title">GPS 全轨迹</p><span class="route-note">本地画布 · 不请求地图瓦片</span></div>
            <div v-if="routeCanvas" class="route-wrap">
              <div class="route-canvas-texture" aria-hidden="true"></div>
              <svg class="route-svg" viewBox="0 0 100 100" preserveAspectRatio="none" role="img" aria-label="按时间与最近配速样本着色的本地 GPS 轨迹">
                <path v-for="(segment, index) in routeCanvas.segments" :key="`${segment.d}-${index}`" :d="segment.d" fill="none" :stroke="segment.color" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" />
              </svg>
              <span class="route-marker start" :style="{ left: `${routeCanvas.start.x}%`, top: `${routeCanvas.start.y}%` }">起</span>
              <span class="route-marker end" :style="{ left: `${routeCanvas.end.x}%`, top: `${routeCanvas.end.y}%` }">终</span>
              <span v-for="(marker, index) in routeCanvas.markers" :key="`arrow-${index}`" class="route-direction" :style="{ left: `${marker.x}%`, top: `${marker.y}%`, transform: `translate(-50%, -50%) rotate(${marker.angle}deg)` }">›</span>
              <span v-for="(marker, index) in routeCanvas.pauseMarkers" :key="`pause-${index}`" class="pause-marker" :style="{ left: `${marker.x}%`, top: `${marker.y}%` }">Ⅱ</span>
              <div class="route-legend"><span><i class="neutral-dot"></i>{{ routeCanvas.enoughPace ? `有效配速 ${routeCanvas.validPaceCount} 点 · P10–P90` : '有效配速不足 3 个 · 未按速度着色' }}</span><template v-if="routeCanvas.enoughPace"><span><i class="fast-dot"></i>快</span><span><i class="steady-dot"></i>稳定</span><span><i class="warm-dot"></i>偏慢</span><span><i class="slow-dot"></i>慢</span></template></div>
            </div>
            <div v-else class="route-empty"><Icon name="map" :size="20" /><p>本次记录没有足够的轨迹点，因此不画路线。</p></div>
          </section>

          <div class="chart-grid"><section v-for="card in chartCards" :key="card.key" class="surface-card chart-card" :aria-label="card.title"><div class="chart-head"><p class="card-title">{{ card.title }} <em>{{ card.unit }}</em></p><span v-if="card.stats" class="chart-stats">{{ card.stats }}</span></div><VChart class="series-chart" :option="card.option" autoresize role="img" :aria-label="`${card.title}曲线`" /></section></div>
          <section v-if="!chartCards.length" class="surface-card chart-empty"><Icon name="info" :size="16" /><p>本次未同步逐点样本，因此不展示心率、配速、海拔、步频等曲线。</p></section>
        </div>

        <div class="side-col">
          <section class="surface-card side-card" aria-label="导出与分享"><p class="card-title">导出与分享</p><p class="card-sub">复制本地解码后的结构化数据，不访问地图服务。</p><div class="format-row" role="radiogroup" aria-label="导出格式"><button v-for="format in (['json', 'csv', 'gpx'] as const)" :key="format" type="button" role="radio" :aria-checked="activeFormat === format" :class="['format-pill', { 'is-on': activeFormat === format }]" @click="activeFormat = format">{{ format === 'gpx' ? 'GPX（轨迹）' : format.toUpperCase() }}</button><button class="format-pill export-go" type="button" @click="exportRecord">复制数据</button></div><p v-if="exportedNote" class="action-note ok" role="status"><Icon name="circle-check" :size="13" />{{ exportedNote }}</p><p v-if="actionError" class="action-note bad" role="alert"><Icon name="warning" :size="13" />{{ actionError }}</p></section>
          <section class="surface-card side-card meta-card" aria-label="来源信息"><p class="card-title">来源信息</p><dl><div><dt>数据来源</dt><dd>{{ dataProviderLabel() }}</dd></div><div><dt>数据范围</dt><dd>{{ dataScopeLabel(workout.source_scope) }}</dd></div><div><dt>最近同步</dt><dd>{{ syncBadge }}</dd></div><div><dt>记录 ID</dt><dd>{{ workout.workout_id }}</dd></div><div><dt>设备</dt><dd>{{ device.canonical_name || device.name || '未提供' }}</dd></div></dl></section>
        </div>
      </div>
      <p class="page-foot"><Icon name="shield" :size="13" />数据已本地解码；路线使用本地画布。</p>
    </template>
  </section>
</template>

<style scoped>
.workout-page { width: 100%; display: grid; gap: 10px; align-content: start; }
.detail-loading { display: grid; gap: 12px; }
.back-link { display: inline-flex; align-items: center; gap: 6px; justify-self: start; color: var(--muted); font-size: 12px; text-decoration: none; }
.back-link:hover { color: var(--accent); }
.title-row { display: flex; align-items: center; justify-content: space-between; gap: 12px; flex-wrap: wrap; }
.title-row h1 { margin: 0; }
.source-row { display: flex; align-items: center; justify-content: space-between; gap: 10px; }
.source-chip { display: inline-flex; align-items: center; gap: 6px; min-height: 28px; padding: 4px 12px; border: 1px solid var(--line); border-radius: 999px; background: var(--surface); color: var(--muted); font-size: 12px; }
.source-chip :deep(.device-visual) { width: 20px; height: 20px; flex-basis: 20px; border: 0; border-radius: 50%; background: transparent; }
.source-chip :deep(.device-visual img) { padding: 0; }
.sport-line { display: flex; align-items: center; gap: 10px; }
.sport-icon { display: grid; place-items: center; width: 34px; height: 34px; border-radius: 9px; background: var(--activity-wash); color: var(--cadence); }
.sport-line strong { font-size: 19px; font-weight: 700; }
.sport-distance { font-family: var(--font-mono); font-variant-numeric: tabular-nums; }
.sport-time { display: inline-flex; align-items: center; gap: 6px; margin: 0; color: var(--muted); font-size: 12px; }
.metric-list { display: grid; grid-template-columns: repeat(auto-fit, minmax(138px, 1fr)); gap: 10px; margin: 6px 0 4px; }
.metric-list > div { min-width: 0; padding: 12px 14px; border: 1px solid var(--line); border-radius: var(--radius-md); background: var(--surface); border-top: 2px solid var(--line-strong); }
.metric-list > div.tone-heart { border-top-color: var(--route-coral); } .metric-list > div.tone-pace { border-top-color: var(--route-cyan); } .metric-list > div.tone-calories { border-top-color: var(--route-amber); } .metric-list > div.tone-training { border-top-color: var(--accent); } .metric-list > div.tone-distance { border-top-color: var(--route-mint); }
.metric-label { margin: 0; color: var(--muted); font-size: 12px; }
.metric-value { display: flex; align-items: baseline; gap: 5px; margin: 7px 0 0; flex-wrap: wrap; }
.metric-value strong { color: var(--ink); font-family: var(--font-mono); font-size: 17px; font-variant-numeric: tabular-nums; font-weight: 600; letter-spacing: -.01em; }
.metric-value span { color: var(--muted); font-size: 11px; }
.lower { display: grid; grid-template-columns: minmax(0, 1.25fr) minmax(300px, .85fr); align-items: start; gap: 14px; }
.main-col, .side-col { display: grid; gap: 14px; min-width: 0; }
.surface-card { min-width: 0; }
.card-title { margin: 0 0 6px; color: var(--ink); font-size: 14px; font-weight: 700; }
.card-title em { color: var(--subtle); font-size: 12px; font-style: normal; font-weight: 400; }
.card-sub { margin: 0 0 12px; color: var(--muted); font-size: 12px; }
.series-card, .side-card { padding: 14px 16px 16px; }
.chart-head { display: flex; align-items: baseline; justify-content: space-between; gap: 8px; }
.route-note { color: var(--subtle); font-size: 11px; }
.route-wrap { position: relative; overflow: hidden; min-height: 300px; border: 1px solid var(--line); border-radius: var(--radius-sm); background: var(--surface-raised); }
.route-canvas-texture { position: absolute; inset: 0; pointer-events: none; opacity: .65; background-image: linear-gradient(rgba(224,235,240,.06) 1px, transparent 1px), linear-gradient(90deg, rgba(224,235,240,.06) 1px, transparent 1px), radial-gradient(circle at 72% 25%, rgba(110,216,245,.10), transparent 36%), radial-gradient(circle at 22% 70%, rgba(118,229,191,.09), transparent 38%); background-size: 28px 28px, 28px 28px, auto, auto; }
.route-svg { position: absolute; inset: 14px; display: block; width: calc(100% - 28px); height: calc(100% - 28px); }
.route-marker, .pause-marker, .route-direction { position: absolute; z-index: 2; display: grid; place-items: center; transform: translate(-50%, -50%); font-family: var(--font-mono); font-size: 10px; }
.route-marker { width: 26px; height: 26px; border: 2px solid var(--surface); border-radius: 50%; color: var(--surface); font-weight: 700; }
.route-marker.start { background: var(--readiness); } .route-marker.end { background: var(--heart); }
.pause-marker { width: 20px; height: 20px; border: 1px solid var(--route-amber); border-radius: 50%; background: rgba(17,21,24,.88); color: var(--route-amber); font-size: 11px; }
.route-direction { color: var(--ink); font-size: 21px; text-shadow: 0 1px 2px rgba(8,10,12,.75); }
.route-legend { position: absolute; right: 10px; bottom: 10px; left: 10px; display: flex; align-items: center; gap: 10px; flex-wrap: wrap; padding: 5px 8px; border: 1px solid var(--line); border-radius: 8px; background: rgba(14,17,19,.88); color: var(--muted); font-size: 10px; }
.route-legend span { display: inline-flex; align-items: center; gap: 4px; }
.route-legend i { width: 9px; height: 4px; border-radius: 999px; background: var(--route-neutral); }
.route-legend .fast-dot { background: var(--route-mint); }
.route-legend .steady-dot { background: var(--route-cyan); }
.route-legend .warm-dot { background: var(--route-amber); }
.route-legend .slow-dot { background: var(--route-coral); }
.route-empty { display: grid; justify-items: center; gap: 8px; padding: 40px 16px; border: 1px dashed var(--line-strong); border-radius: var(--radius-sm); color: var(--subtle); font-size: 12px; text-align: center; }
.route-empty p { margin: 0; }
.chart-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 14px; }
.chart-card { padding: 12px 14px; min-width: 0; }
.chart-stats { color: var(--subtle); font-size: 10px; font-variant-numeric: tabular-nums; white-space: nowrap; }
.series-chart { width: 100%; height: 150px; }
.chart-empty { display: flex; align-items: center; gap: 10px; padding: 16px; color: var(--muted); font-size: 12px; }
.chart-empty p { margin: 0; }
.format-row { display: flex; gap: 8px; flex-wrap: wrap; }
.format-pill { padding: 7px 14px; border: 1px solid var(--line); border-radius: 9px; background: var(--surface-raised); color: var(--muted); font-size: 12px; cursor: pointer; }
.format-pill.is-on { border-color: var(--accent); background: var(--accent-soft); color: var(--accent); }
.format-pill.export-go { margin-left: auto; }
.action-note { display: inline-flex; align-items: center; gap: 6px; margin: 10px 0 0; font-size: 12px; }
.action-note.ok { color: var(--readiness); } .action-note.bad { color: var(--danger); }
.meta-card dl { display: grid; gap: 8px; margin: 0; }
.meta-card dl > div { display: flex; align-items: baseline; justify-content: space-between; gap: 10px; min-width: 0; }
.meta-card dt { color: var(--muted); font-size: 12px; } .meta-card dd { margin: 0; color: var(--ink); font-size: 12px; overflow-wrap: anywhere; text-align: right; }
.page-foot { display: flex; align-items: center; justify-content: center; gap: 6px; margin: 4px 0 0; color: var(--subtle); font-size: 12px; }
@media (max-width: 1180px) { .lower { grid-template-columns: minmax(0, 1fr); } }
@media (max-width: 760px) { .metric-list { grid-template-columns: repeat(2, minmax(0, 1fr)); } .chart-grid { grid-template-columns: minmax(0, 1fr); } .route-wrap { min-height: 240px; } .route-note { display: none; } }
@media (prefers-reduced-motion: reduce) { .route-direction { text-shadow: none; } }
</style>
