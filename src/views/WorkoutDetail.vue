<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { RouterLink, useRoute } from 'vue-router';
import Icon from '../components/Icon.vue';
import MetricHero from '../components/MetricHero.vue';
import EmptyState from '../components/EmptyState.vue';
import { useSyncController } from '../composables/useSyncController';
import { isTauri, tauriApi, toUserMessage } from '../composables/useTauriApi';
import { sourceLabel, workoutLabel } from '../lib/labels';
import { formatDate, formatDistance, formatDuration, formatPace, formatTime, isFiniteNumber } from '../lib/format';
import type { Workout } from '../types';

const route = useRoute();
const { dataRevision } = useSyncController();
const workout = ref<Workout | null>(null);
const loading = ref(true);
const error = ref<string | null>(null);
const workoutId = computed(() => String(route.params.workoutId || ''));

const durationMinutes = computed(() => {
  if (!workout.value) return null;
  const start = new Date(workout.value.start_time).getTime();
  const end = new Date(workout.value.end_time).getTime();
  return Number.isFinite(start) && Number.isFinite(end) && end > start ? (end - start) / 60_000 : null;
});

const heroValue = computed(() => {
  if (!workout.value) return '—';
  const distance = formatDistance(workout.value.distance_meters, '');
  return distance || formatDuration(durationMinutes.value, '—');
});
const metrics = computed(() => {
  if (!workout.value) return [];
  const pace = formatPace(workout.value.distance_meters, durationMinutes.value);
  const value = (number: number | undefined, suffix = '', digits = 0): string => {
    if (!isFiniteNumber(number)) return '未记录';
    const shown = digits && !Number.isInteger(number) ? number.toFixed(digits) : String(Math.round(number));
    return `${shown}${suffix}`;
  };
  return [
    { label: '时长', value: formatDuration(durationMinutes.value, '未记录') },
    { label: '消耗', value: value(workout.value.calories, ' kcal') },
    { label: '平均心率', value: value(workout.value.avg_hr, ' BPM') },
    { label: '最高心率', value: value(workout.value.max_hr, ' BPM') },
    { label: '平均配速', value: pace || '未记录' },
    { label: '训练负荷', value: value(workout.value.training_load, '', 1) },
    { label: 'VO₂max', value: value(workout.value.vo2max, '', 1) },
  ];
});

const sampleNote = computed(() => {
  if (!workout.value) return '';
  if (workout.value.sample_count) return `已记录 ${workout.value.sample_count} 个样本。`;
  if (workout.value.gps_available === false) return '本次未提供 GPS，因此不画路线。';
  return '本次未同步轨迹或逐点样本，因此不画空图。';
});

const loadDetail = async () => {
  loading.value = true;
  error.value = null;
  if (!isTauri()) {
    loading.value = false;
    return;
  }
  try {
    workout.value = await tauriApi.getWorkoutDetail(workoutId.value);
  } catch (cause) {
    error.value = toUserMessage(cause, '运动详情暂时不可用');
  } finally {
    loading.value = false;
  }
};

onMounted(() => void loadDetail());
watch(dataRevision, () => void loadDetail());
</script>

<template>
  <section class="page" aria-labelledby="workout-detail-title">
    <RouterLink class="back-link" to="/"><Icon name="arrow-right" :size="14" />返回概览</RouterLink>
    <h1 id="workout-detail-title" class="sr-only">运动详情</h1>

    <div v-if="loading" class="muted-line" aria-live="polite">正在读取运动详情…</div>
    <EmptyState v-else-if="error" tone="error" icon="warning" title="无法读取这条运动" :message="error">
      <button class="button button-secondary" type="button" @click="loadDetail">重试</button>
    </EmptyState>
    <EmptyState v-else-if="!workout" icon="steps" title="找不到这条运动记录" message="它可能已被清理，或尚未同步到本机。" />

    <template v-else>
      <MetricHero
        category="activity"
        icon="steps"
        :kicker="formatDate(workout.start_time, 'long')"
        :value="heroValue"
        :detail="`${workoutLabel(workout.workout_type)} · ${formatTime(workout.start_time)} 开始 · ${formatTime(workout.end_time)} 结束`"
      />

      <section class="metric-list" aria-label="运动指标">
        <div v-for="metric in metrics" :key="metric.label">
          <span>{{ metric.label }}</span>
          <strong>{{ metric.value }}</strong>
        </div>
      </section>

      <section class="surface-card provenance">
        <div><span>来源</span><strong>{{ sourceLabel(workout.source_scope) }}</strong></div>
        <div><span>设备</span><strong>{{ workout.device_id || '未提供设备标识' }}</strong></div>
      </section>
      <p class="note">{{ sampleNote }}</p>
    </template>
  </section>
</template>

<style scoped>
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
.muted-line { color: var(--muted); }
.metric-list {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 1px;
  margin: 16px 0 12px;
  overflow: hidden;
  border: 1px solid var(--line);
  border-radius: var(--radius-md);
  background: var(--line);
}
.metric-list div { min-height: 88px; padding: 14px; background: var(--surface); }
.metric-list span { display: block; color: var(--muted); font-size: 12px; }
.metric-list strong {
  display: block;
  margin-top: 8px;
  font-family: var(--font-mono);
  font-size: 16px;
  font-variant-numeric: tabular-nums;
  font-weight: 500;
}
.provenance {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 20px;
  padding: 18px 20px;
}
.provenance span { display: block; color: var(--muted); font-size: 12px; }
.provenance strong { display: block; margin-top: 4px; overflow-wrap: anywhere; }
.note { margin: 12px 0 0; color: var(--muted); font-size: 12px; }
@media (max-width: 760px) {
  .metric-list { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .provenance { grid-template-columns: 1fr; }
}
</style>
