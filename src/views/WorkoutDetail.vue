<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { RouterLink, useRoute } from 'vue-router';
import Icon from '../components/Icon.vue';
import EmptyState from '../components/EmptyState.vue';
import { useSyncController } from '../composables/useSyncController';
import { isTauri, tauriApi, toUserMessage } from '../composables/useTauriApi';
import { sourceLabel, workoutLabel } from '../lib/labels';
import { formatDate, formatTime, isFiniteNumber } from '../lib/format';
import type { DeviceProfile, Workout } from '../types';

const route = useRoute();
const { dataRevision } = useSyncController();
const workout = ref<Workout | null>(null);
const device = ref<DeviceProfile>({});
const loading = ref(true);
const error = ref<string | null>(null);
const workoutId = computed(() => String(route.params.workoutId || ''));

const durationMinutes = computed(() => {
  if (!workout.value) return null;
  const start = new Date(workout.value.start_time).getTime();
  const end = new Date(workout.value.end_time).getTime();
  return Number.isFinite(start) && Number.isFinite(end) && end > start ? (end - start) / 60_000 : null;
});

const formatClock = (minutes?: number | null): string => {
  if (!isFiniteNumber(minutes) || minutes < 0) return '未记录';
  const totalSeconds = Math.round(minutes * 60);
  const hours = Math.floor(totalSeconds / 3600);
  const mins = Math.floor((totalSeconds % 3600) / 60);
  const secs = totalSeconds % 60;
  const pad = (value: number) => String(value).padStart(2, '0');
  return hours > 0 ? `${pad(hours)}:${pad(mins)}:${pad(secs)}` : `${pad(mins)}:${pad(secs)}`;
};

const formatPaceLocal = (distanceMeters?: number, minutes?: number | null): string => {
  if (!isFiniteNumber(distanceMeters) || distanceMeters <= 0) return '未记录';
  if (!isFiniteNumber(minutes) || minutes <= 0) return '未记录';
  const totalSeconds = Math.round((minutes / (distanceMeters / 1000)) * 60);
  const paceMin = Math.floor(totalSeconds / 60);
  const paceSec = totalSeconds % 60;
  return `${paceMin}'${String(paceSec).padStart(2, '0')}"`;
};

const hero = computed(() => {
  const current = workout.value;
  if (!current) return { value: '—', unit: '' };
  const meters = current.distance_meters;
  if (isFiniteNumber(meters) && meters > 0) {
    return meters >= 1000
      ? { value: (meters / 1000).toFixed(2), unit: '公里' }
      : { value: String(Math.round(meters)), unit: '米' };
  }
  return { value: formatClock(durationMinutes.value), unit: '' };
});

const metrics = computed(() => {
  if (!workout.value) return [];
  const numberValue = (value: number | undefined, digits = 0): string => {
    if (!isFiniteNumber(value)) return '未记录';
    return digits && !Number.isInteger(value) ? value.toFixed(digits) : String(Math.round(value));
  };
  const pace = formatPaceLocal(workout.value.distance_meters, durationMinutes.value);
  return [
    { label: '时长', value: formatClock(durationMinutes.value), unit: durationMinutes.value == null ? '' : 'hh:mm:ss', icon: 'clock' as const, tone: 'green' },
    { label: '消耗', value: numberValue(workout.value.calories), unit: isFiniteNumber(workout.value.calories) ? '千卡' : '', icon: 'flame' as const, tone: 'amber' },
    { label: '平均心率', value: numberValue(workout.value.avg_hr), unit: isFiniteNumber(workout.value.avg_hr) ? 'BPM' : '', icon: 'heart' as const, tone: 'red' },
    { label: '最高心率', value: numberValue(workout.value.max_hr), unit: isFiniteNumber(workout.value.max_hr) ? 'BPM' : '', icon: 'heart-max' as const, tone: 'red' },
    { label: '平均配速', value: pace, unit: pace === '未记录' ? '' : '/公里', icon: 'pace' as const, tone: 'green' },
    { label: '训练负荷', value: numberValue(workout.value.training_load, 1), unit: '', icon: 'bars' as const, tone: 'violet' },
    { label: 'VO₂max', value: numberValue(workout.value.vo2max, 1), unit: '', icon: 'vo2' as const, tone: 'violet' },
  ];
});

const trackCopy = computed(() => {
  if (!workout.value) return { title: '未同步轨迹或逐点样本', body: '本次未同步轨迹或逐点样本，因此不展示地图、配速曲线、心率曲线等图表。' };
  if (workout.value.gps_available === false) {
    return {
      title: '未提供 GPS 轨迹',
      body: '本次记录标明没有 GPS，因此不画路线，也不用空图画布占位。',
    };
  }
  if (workout.value.sample_count) {
    return {
      title: '未同步轨迹几何',
      body: `已记录 ${workout.value.sample_count} 个样本，但本条详情没有可绘制的轨迹点，因此不展示地图或曲线。`,
    };
  }
  return {
    title: '未同步轨迹或逐点样本',
    body: '本次未同步轨迹或逐点样本，因此不展示地图、配速曲线、心率曲线等图表。',
  };
});

const loadDetail = async () => {
  loading.value = true;
  error.value = null;
  if (!isTauri()) {
    loading.value = false;
    return;
  }
  try {
    const [detail, profile] = await Promise.all([
      tauriApi.getWorkoutDetail(workoutId.value),
      tauriApi.getDeviceProfile().catch(() => ({})),
    ]);
    workout.value = detail;
    device.value = profile;
  } catch (cause) {
    error.value = toUserMessage(cause, '运动详情暂时不可用');
  } finally {
    loading.value = false;
  }
};

const exportRecord = async () => {
  if (!workout.value) return;
  try {
    await navigator.clipboard.writeText(JSON.stringify(workout.value, null, 2));
  } catch {
    error.value = '复制这条记录失败';
  }
};

onMounted(() => void loadDetail());
watch([dataRevision, workoutId], () => void loadDetail());
</script>

<template>
  <section class="page workout-page" aria-labelledby="workout-detail-title">
    <div class="title-row">
      <RouterLink class="back-link" to="/"><Icon name="arrow-right" :size="14" />返回概览</RouterLink>
      <button v-if="workout" class="button button-secondary" type="button" @click="exportRecord"><Icon name="export" :size="14" />导出记录</button>
    </div>
    <header class="page-heading">
      <h1 id="workout-detail-title">运动详情</h1>
    </header>

    <div v-if="loading" class="muted-line" aria-live="polite">正在读取运动详情…</div>
    <EmptyState v-else-if="error" tone="error" icon="warning" title="无法读取这条运动" :message="error">
      <button class="button button-secondary" type="button" @click="loadDetail">重试</button>
    </EmptyState>
    <EmptyState v-else-if="!workout" icon="steps" title="找不到这条运动记录" message="它可能已被清理，或尚未同步到本机。" />

    <template v-else>
      <article class="workout-hero" aria-label="运动距离">
        <span class="hero-mark"><Icon name="run" :size="22" /></span>
        <div class="hero-copy">
          <p class="kicker">{{ formatDate(workout.start_time, 'long') }}</p>
          <p class="value">{{ hero.value }} <span v-if="hero.unit">{{ hero.unit }}</span></p>
          <p class="meta">{{ workoutLabel(workout.workout_type) }} · {{ formatTime(workout.start_time) }} 开始 · {{ formatTime(workout.end_time) }} 结束</p>
        </div>
        <span class="type-badge">{{ workoutLabel(workout.workout_type) }}</span>
      </article>

      <section class="metric-list" aria-label="运动指标">
        <div v-for="metric in metrics" :key="metric.label">
          <p :class="['metric-label', metric.tone]"><Icon :name="metric.icon" :size="14" />{{ metric.label }}</p>
          <p class="metric-value">
            <strong>{{ metric.value }}</strong>
            <span v-if="metric.unit">{{ metric.unit }}</span>
          </p>
        </div>
      </section>

      <div class="lower">
        <section class="empty-track" aria-label="轨迹">
          <span class="info-mark"><Icon name="info" :size="16" /></span>
          <div>
            <h2>{{ trackCopy.title }}</h2>
            <p>{{ trackCopy.body }}</p>
          </div>
        </section>
        <div class="side">
          <article class="surface-card meta-card">
            <p class="meta-title"><Icon name="cloud" :size="15" />来源</p>
            <dl>
              <div>
                <dt>数据来源</dt>
                <dd>{{ sourceLabel(workout.source_scope) }}</dd>
              </div>
              <div>
                <dt>同步时间</dt>
                <dd>{{ formatDate(workout.end_time, 'long') }} {{ formatTime(workout.end_time) }}</dd>
              </div>
              <div>
                <dt>记录 ID</dt>
                <dd>{{ workout.workout_id }}</dd>
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
                <dt>序列号</dt>
                <dd>{{ device.serial || '未提供' }}</dd>
              </div>
              <div>
                <dt>设备时钟</dt>
                <dd>与手机时间一致</dd>
              </div>
            </dl>
          </article>
        </div>
      </div>
    </template>
  </section>
</template>

<style scoped>
.workout-page { width: min(100%, 980px); }
.back-link {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 18px;
  color: var(--muted);
  font-size: 13px;
  text-decoration: none;
}
.back-link svg { transform: rotate(180deg); }
.page-heading { margin-bottom: 18px; }
.page-heading h1 {
  margin: 0;
  color: var(--ink);
  font-size: clamp(26px, 3.4vw, 32px);
  font-weight: 650;
  letter-spacing: -0.04em;
}
.muted-line { color: var(--muted); }
.title-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}
.workout-hero {
  display: flex;
  align-items: center;
  gap: 16px;
  min-width: 0;
  padding: 22px 24px;
  border: 1px solid var(--line);
  border-radius: 16px;
  background: var(--activity-wash);
}
.hero-mark {
  display: grid;
  width: 52px;
  height: 52px;
  flex: 0 0 52px;
  place-items: center;
  border-radius: 999px;
  color: var(--accent);
  background: var(--accent-soft);
}
.hero-copy { min-width: 0; flex: 1; }
.kicker { margin: 0; color: var(--muted); font-size: 13px; }
.value {
  margin: 8px 0 0;
  color: var(--ink);
  font-family: var(--font-mono);
  font-size: clamp(36px, 5vw, 52px);
  font-variant-numeric: tabular-nums;
  font-weight: 500;
  letter-spacing: -0.05em;
  line-height: 1;
}
.value span {
  margin-left: 6px;
  color: var(--muted);
  font-size: 16px;
  letter-spacing: 0;
}
.meta { margin: 10px 0 0; color: var(--muted); font-size: 13px; }
.type-badge {
  flex: 0 0 auto;
  padding: 6px 12px;
  border: 1px solid var(--line);
  border-radius: 999px;
  color: var(--accent);
  background: var(--accent-soft);
  font-size: 12px;
}
.metric-list {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 1px;
  margin: 12px 0;
  overflow: hidden;
  border: 1px solid var(--line);
  border-radius: var(--radius-md);
  background: var(--line);
}
.metric-list > div {
  min-width: 0;
  min-height: 96px;
  padding: 16px 18px;
  background: var(--surface);
}
.metric-label {
  display: flex;
  align-items: center;
  gap: 6px;
  margin: 0;
  font-size: 12px;
}
.metric-label.green { color: var(--activity); }
.metric-label.amber { color: var(--warning); }
.metric-label.red { color: var(--heart); }
.metric-label.violet { color: var(--sleep); }
.metric-value {
  display: flex;
  align-items: baseline;
  gap: 6px;
  margin: 10px 0 0;
}
.metric-value strong {
  color: var(--ink);
  font-family: var(--font-mono);
  font-size: 22px;
  font-variant-numeric: tabular-nums;
  font-weight: 500;
}
.metric-value span { color: var(--muted); font-size: 12px; }
.lower {
  display: grid;
  grid-template-columns: minmax(0, 1.2fr) minmax(260px, 0.8fr);
  align-items: start;
  gap: 12px;
}
.empty-track {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  min-width: 0;
  padding: 18px 20px;
  border: 1px solid var(--line);
  border-radius: var(--radius-md);
  background: var(--surface);
}
.info-mark {
  display: grid;
  width: 32px;
  height: 32px;
  flex: 0 0 32px;
  place-items: center;
  border-radius: 999px;
  color: var(--muted);
  background: var(--surface-raised);
}
.empty-track h2 { margin: 2px 0 8px; color: var(--ink); font-size: 15px; }
.empty-track p { margin: 0; color: var(--muted); font-size: 13px; line-height: 1.55; }
.side { display: grid; gap: 12px; min-width: 0; }
.meta-card { padding: 16px 18px 18px; background: var(--surface); border-color: var(--line); }
.meta-title {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 0 0 12px;
  color: var(--ink);
  font-size: 13px;
}
.meta-title svg { color: var(--accent); }
.meta-card dl { display: grid; gap: 10px; margin: 0; }
.meta-card dt { color: var(--muted); font-size: 12px; }
.meta-card dd {
  margin: 4px 0 0;
  color: var(--ink);
  overflow-wrap: anywhere;
  font-size: 13px;
}
@media (max-width: 760px) {
  .metric-list { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .lower, .workout-hero { grid-template-columns: 1fr; }
  .lower { display: grid; grid-template-columns: 1fr; }
  .workout-hero { flex-wrap: wrap; }
}
</style>
