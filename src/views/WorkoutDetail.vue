<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { RouterLink, useRoute } from 'vue-router';
import Icon from '../components/Icon.vue';
import { useSyncController } from '../composables/useSyncController';
import { isTauri, tauriApi, toUserMessage } from '../composables/useTauriApi';
import { sourceLabel, workoutLabel } from '../lib/labels';
import type { Workout } from '../types';

const route = useRoute();
const { dataRevision } = useSyncController();
const workout = ref<Workout | null>(null);
const loading = ref(true);
const error = ref<string | null>(null);
const workoutId = computed(() => String(route.params.workoutId || ''));
const finite = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);
const durationMinutes = computed(() => {
  if (!workout.value) return null;
  const start = new Date(workout.value.start_time).getTime();
  const end = new Date(workout.value.end_time).getTime();
  return Number.isFinite(start) && Number.isFinite(end) && end > start ? (end - start) / 60_000 : null;
});
const averagePace = computed(() => {
  const distance = workout.value?.distance_meters;
  const duration = durationMinutes.value;
  if (!finite(distance) || distance <= 0 || !finite(duration) || duration <= 0) return null;
  const minutesPerKm = duration / (distance / 1000);
  const totalSeconds = Math.round(minutesPerKm * 60);
  return `${Math.floor(totalSeconds / 60)}:${String(totalSeconds % 60).padStart(2, '0')} /km`;
});
const label = workoutLabel;
const formatDate = (value: string): string => { const date = new Date(value); return Number.isNaN(date.getTime()) ? '日期未知' : new Intl.DateTimeFormat('zh-CN', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' }).format(date); };
const formatTime = (value: string): string => { const date = new Date(value); return Number.isNaN(date.getTime()) ? '—' : new Intl.DateTimeFormat('zh-CN', { hour: '2-digit', minute: '2-digit' }).format(date); };
const formatDuration = (): string => !finite(durationMinutes.value) ? '未记录' : durationMinutes.value >= 60 ? `${Math.floor(durationMinutes.value / 60)} 小时 ${Math.round(durationMinutes.value % 60)} 分` : `${Math.round(durationMinutes.value)} 分钟`;
const formatDistance = (value?: number): string => finite(value) ? `${(value / 1000).toFixed(3)} km` : '未记录';
const value = (number: number | undefined, unit = ''): string => finite(number) ? `${Number.isInteger(number) ? number : number.toFixed(1)}${unit}` : '未记录';
const loadDetail = async () => { loading.value = true; error.value = null; if (!isTauri()) { loading.value = false; return; } try { workout.value = await tauriApi.getWorkoutDetail(workoutId.value); } catch (cause) { error.value = toUserMessage(cause, '运动详情暂时不可用'); } finally { loading.value = false; } };
onMounted(() => void loadDetail());
watch(dataRevision, () => void loadDetail());
</script>

<template>
  <section class="detail-page" aria-labelledby="workout-detail-title">
    <RouterLink class="back-link" to="/workouts"><Icon name="arrow-right" :size="14" />返回运动列表</RouterLink>
    <div v-if="loading" class="state-panel" aria-live="polite">正在读取运动详情…</div>
    <div v-else-if="error" class="state-panel error" role="alert"><Icon name="warning" :size="18" />{{ error }}<button type="button" @click="loadDetail">重试</button></div>
    <div v-else-if="!workout" class="state-panel"><div><h1 id="workout-detail-title">找不到这条运动记录</h1><p>它可能已被清理，或尚未同步到本机。</p></div></div>
    <template v-else>
      <header class="detail-header"><div><p class="eyebrow">{{ formatDate(workout.start_time) }}</p><h1 id="workout-detail-title">{{ label(workout.workout_type) }}</h1><p>{{ formatTime(workout.start_time) }} 开始 · {{ formatTime(workout.end_time) }} 结束</p></div><div class="distance"><span>距离</span><strong>{{ formatDistance(workout.distance_meters) }}</strong></div></header>
      <section class="metric-list" aria-label="运动指标"><div><span>时长</span><strong>{{ formatDuration() }}</strong></div><div><span>消耗</span><strong>{{ value(workout.calories, ' kcal') }}</strong></div><div><span>平均心率</span><strong>{{ value(workout.avg_hr, ' BPM') }}</strong></div><div><span>最高心率</span><strong>{{ value(workout.max_hr, ' BPM') }}</strong></div><div><span>平均配速</span><strong>{{ averagePace || '未记录' }}</strong></div><div><span>训练负荷</span><strong>{{ value(workout.training_load) }}</strong></div><div><span>VO₂max</span><strong>{{ value(workout.vo2max) }}</strong></div></section>
      <section class="detail-section provenance"><div><span>来源</span><strong>{{ sourceLabel(workout.source_scope) }}</strong></div><div><span>设备</span><strong>{{ workout.device_id || '未提供设备标识' }}</strong></div></section>
      <aside class="note"><Icon name="info" :size="15" />{{ workout.sample_count ? `已记录 ${workout.sample_count} 个样本。` : '本次未同步轨迹或逐点样本，因此不画空图。' }}</aside>
    </template>
  </section>
</template>

<style scoped>
.detail-page { width: min(100%, 920px); margin: 0 auto; padding: 32px 32px 64px; }.back-link { display: inline-flex; align-items: center; gap: 6px; margin-bottom: 24px; color: var(--muted); font-size: 12px; text-decoration: none; }.back-link svg { transform: rotate(180deg); }.detail-header { display: flex; align-items: flex-end; justify-content: space-between; gap: 24px; padding-bottom: 24px; border-bottom: 1px solid var(--line); }.eyebrow { margin: 0 0 7px; color: var(--muted); font-size: 10px; font-weight: 700; letter-spacing: .12em; text-transform: uppercase; }h1, p { margin-top: 0; }h1 { margin-bottom: 7px; font-size: clamp(34px, 5vw, 52px); letter-spacing: -.05em; }.detail-header p { margin-bottom: 0; color: var(--muted); }.distance { min-width: 180px; text-align: right; }.distance span { display: block; color: var(--muted); font-size: 10px; }.distance strong { display: block; margin-top: 5px; color: var(--accent); font-family: var(--font-mono); font-size: 26px; font-weight: 500; letter-spacing: -.05em; }.metric-list { display: grid; grid-template-columns: repeat(4, 1fr); gap: 1px; margin: 22px 0 10px; overflow: hidden; border: 1px solid var(--line); border-radius: var(--radius-md); background: var(--line); }.metric-list div { min-height: 92px; padding: 15px; background: var(--surface); }.metric-list span, .provenance span { display: block; color: var(--muted); font-size: 10px; }.metric-list strong { display: block; margin-top: 8px; font-family: var(--font-mono); font-size: 15px; font-weight: 500; }.detail-section { margin-top: 10px; padding: 20px; border: 1px solid var(--line); border-radius: var(--radius-md); background: var(--surface); }.provenance { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; }.provenance strong { display: block; margin-top: 4px; overflow-wrap: anywhere; }.note, .state-panel { display: flex; align-items: flex-start; gap: 8px; margin-top: 12px; padding: 13px 15px; border: 1px solid var(--line); border-radius: var(--radius-sm); color: var(--muted); font-size: 11px; }.state-panel { min-height: 120px; align-items: center; background: var(--surface); }.state-panel.error { color: var(--danger); }.state-panel button { margin-left: auto; border: 0; background: transparent; color: inherit; cursor: pointer; }@media (max-width: 760px) { .detail-page { padding: 24px 16px 38px; }.detail-header { align-items: flex-start; flex-direction: column; }.distance { text-align: left; }.metric-list { grid-template-columns: repeat(2, 1fr); }.provenance { grid-template-columns: 1fr; } }
</style>
