<script setup lang="ts">
import { onMounted, ref, watch } from 'vue';
import { RouterLink } from 'vue-router';
import Icon from '../components/Icon.vue';
import { isTauri, tauriApi, toUserMessage } from '../composables/useTauriApi';
import { useSyncController } from '../composables/useSyncController';
import { sourceLabel, workoutLabel } from '../lib/labels';
import type { Workout } from '../types';

const workouts = ref<Workout[]>([]);
const loading = ref(true);
const error = ref<string | null>(null);
const { dataRevision, appStatus, isSyncing } = useSyncController();

const isFiniteNumber = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);
const formatDate = (value: string): string => {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '日期未知' : new Intl.DateTimeFormat('zh-CN', { month: 'short', day: 'numeric', weekday: 'short' }).format(date);
};
const formatDuration = (start: string, end: string): string => {
  const from = new Date(start).getTime();
  const to = new Date(end).getTime();
  if (!Number.isFinite(from) || !Number.isFinite(to) || to < from) return '时长未知';
  const minutes = Math.round((to - from) / 60000);
  return minutes >= 60 ? `${Math.floor(minutes / 60)} 小时 ${minutes % 60} 分` : `${minutes} 分钟`;
};
const formatDistance = (meters?: number): string => {
  if (!isFiniteNumber(meters)) return '未记录';
  return meters >= 1000 ? `${(meters / 1000).toFixed(2)} km` : `${Math.round(meters)} m`;
};


const loadWorkouts = async () => {
  loading.value = true;
  error.value = null;
  if (!isTauri()) {
    loading.value = false;
    workouts.value = [];
    return;
  }
  try {
    workouts.value = await tauriApi.getRecentWorkouts(30);
  } catch (cause) {
    error.value = toUserMessage(cause, '运动记录暂时不可用');
  } finally {
    loading.value = false;
  }
};

onMounted(() => {
  void loadWorkouts();
});
watch(dataRevision, () => void loadWorkouts());
</script>

<template>
  <section class="page records-page" aria-labelledby="workouts-title">
    <header class="page-header">
      <div><p class="eyebrow">最近 30 条记录</p><h1 id="workouts-title">运动</h1><p class="page-intro">保留运动类型、时长和心率；没有真实序列时不会绘制模拟图表。</p></div>
      <button class="button button-quiet" type="button" :disabled="loading" @click="loadWorkouts"><Icon name="refresh" :size="16" />刷新</button>
    </header>

    <div class="source-note"><Icon name="activity" :size="15" /><span>距离与心率由 Zepp 区域数据决定。设备未提供 GPS 或样本不足时，会明确说明而不是填入估算值。</span></div>

    <div v-if="loading" class="record-grid" aria-label="正在加载运动记录" aria-live="polite">
      <div v-for="index in 4" :key="index" class="record-skeleton"><span></span><span></span><span></span></div>
    </div>
    <div v-else-if="error" class="state-panel error-panel" role="alert">
      <div class="state-icon"><Icon name="warning" :size="20" /></div><div><h2>运动记录加载失败</h2><p>{{ error }}</p><button class="button button-secondary" type="button" @click="loadWorkouts"><Icon name="refresh" :size="15" />重试</button></div>
    </div>
    <div v-else-if="workouts.length === 0" class="state-panel empty-panel">
      <div class="empty-mark"><Icon name="steps" :size="21" /></div><div><p class="eyebrow">暂无记录</p><h2>{{ isSyncing ? '正在同步运动…' : (appStatus?.connection_state === 'connected' ? '这段时间没有运动记录' : '完成一次同步后查看运动') }}</h2><p>{{ appStatus?.connection_state === 'connected' || isSyncing ? '已连接时，没有记录不一定是失败。' : '连接并同步后，运动会显示在这里。' }}</p><RouterLink v-if="appStatus?.connection_state !== 'connected'" class="button button-primary" to="/settings"><Icon name="arrow-right" :size="15" />前往连接</RouterLink></div>
    </div>
    <div v-else class="record-grid">
      <RouterLink v-for="workout in workouts" :key="workout.workout_id" class="record-card" :to="{ name: 'WorkoutDetail', params: { workoutId: workout.workout_id } }" :aria-label="`查看 ${formatDate(workout.start_time)} 的${workoutLabel(workout.workout_type)}详情`">
        <div class="record-card-head"><div><span class="record-date">{{ formatDate(workout.start_time) }}</span><h2>{{ workoutLabel(workout.workout_type) }}</h2></div><div class="record-link-meta"><span class="scope-badge">{{ sourceLabel(workout.source_scope) }}</span><Icon name="arrow-right" :size="15" /></div></div>
        <div class="record-primary"><span>时长</span><strong>{{ formatDuration(workout.start_time, workout.end_time) }}</strong></div>
        <dl class="stats-grid">
          <div><dt>距离</dt><dd>{{ formatDistance(workout.distance_meters) }}</dd></div>
          <div><dt>消耗</dt><dd>{{ isFiniteNumber(workout.calories) ? `${Math.round(workout.calories)} kcal` : '未记录' }}</dd></div>
          <div><dt>平均心率</dt><dd>{{ isFiniteNumber(workout.avg_hr) ? `${Math.round(workout.avg_hr)} BPM` : '未记录' }}</dd></div>
          <div><dt>最高心率</dt><dd>{{ isFiniteNumber(workout.max_hr) ? `${Math.round(workout.max_hr)} BPM` : '未记录' }}</dd></div>
        </dl>
        <div class="record-foot">
          <span v-if="workout.gps_available === false" class="availability-note"><Icon name="info" :size="13" />未提供 GPS</span>
          <span v-else-if="isFiniteNumber(workout.sample_count) && workout.sample_count === 0" class="availability-note"><Icon name="info" :size="13" />样本为空</span>
          <span v-else class="availability-note"><Icon name="shield" :size="13" />只展示已返回字段</span>
          <span v-if="isFiniteNumber(workout.training_load)" class="load-value">负荷 {{ workout.training_load.toFixed(1) }}</span>
          <span v-else-if="isFiniteNumber(workout.vo2max)" class="load-value">VO₂max {{ workout.vo2max.toFixed(1) }}</span>
        </div>
      </RouterLink>
    </div>

    <aside class="data-status-note"><Icon name="info" :size="16" /><span>没有 GPS 轨迹或样本时保持“未记录”，不会估算。</span></aside>
  </section>
</template>

<style scoped>
.page { width: min(100%, 1180px); margin: 0 auto; padding: 36px 32px 64px; }
.page-header { display: flex; align-items: flex-end; justify-content: space-between; gap: 24px; margin-bottom: 20px; }
.eyebrow { margin: 0 0 7px; color: var(--muted); font-size: 10px; font-weight: 700; letter-spacing: .12em; text-transform: uppercase; }
h1, h2, p { margin-top: 0; }
h1 { margin-bottom: 8px; font-size: clamp(30px, 4vw, 46px); font-weight: 650; letter-spacing: -.045em; line-height: 1.08; }
h2 { margin-bottom: 0; font-size: 16px; font-weight: 650; letter-spacing: -.02em; }
.page-intro { max-width: 56ch; margin-bottom: 0; color: var(--muted); font-size: 14px; }
.button { display: inline-flex; min-height: 44px; align-items: center; justify-content: center; gap: 7px; padding: 9px 14px; border: 1px solid transparent; border-radius: var(--radius-sm); font-size: 13px; font-weight: 650; text-decoration: none; cursor: pointer; transition: background-color 150ms ease, border-color 150ms ease, color 150ms ease, transform 150ms ease; }
.button:active { transform: translateY(1px); }
.button:disabled { opacity: .5; cursor: not-allowed; }
.button-primary { background: var(--accent); color: var(--accent-ink); }
.button-primary:hover { background: var(--accent-strong); }
.button-secondary, .button-quiet { border-color: var(--line); background: transparent; color: var(--muted); }
.button-secondary:hover, .button-quiet:hover { border-color: var(--accent); color: var(--accent); }
.source-note { display: flex; align-items: flex-start; gap: 8px; margin-bottom: 17px; padding: 11px 13px; border: 1px solid var(--line); border-radius: var(--radius-sm); color: var(--muted); font-size: 11px; }
.source-note svg { flex: 0 0 auto; color: var(--accent); }
.record-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; }
.record-card { min-height: 257px; padding: 17px; border: 1px solid var(--line); border-radius: var(--radius-md); background: var(--surface); color: inherit; text-decoration: none; transition: border-color 150ms ease, transform 150ms ease; }
.record-card:hover { border-color: var(--line-strong); transform: translateY(-1px); }
.record-card-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; padding-bottom: 16px; border-bottom: 1px solid var(--line); }
.record-link-meta { display: flex; align-items: center; gap: 8px; color: var(--muted); }
.record-date { display: block; margin-bottom: 5px; color: var(--muted); font-family: var(--font-mono); font-size: 11px; }
.scope-badge { display: inline-flex; align-items: center; min-height: 23px; padding: 3px 7px; border: 1px solid var(--line); border-radius: 4px; color: var(--subtle); font-size: 10px; white-space: nowrap; }
.record-primary { display: flex; align-items: baseline; gap: 12px; padding: 19px 0 16px; color: var(--muted); font-size: 12px; }
.record-primary strong { color: var(--ink); font-family: var(--font-mono); font-size: 22px; font-weight: 500; letter-spacing: -.06em; }
.stats-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 1px; margin: 0; overflow: hidden; border: 1px solid var(--line); border-radius: var(--radius-sm); background: var(--line); }
.stats-grid div { min-width: 0; padding: 10px 8px; background: var(--surface-raised); }
.stats-grid dt { color: var(--muted); font-size: 10px; }
.stats-grid dd { margin: 4px 0 0; color: var(--ink); font-family: var(--font-mono); font-size: 11px; }
.record-foot { display: flex; align-items: center; justify-content: space-between; gap: 8px; margin-top: 16px; color: var(--muted); font-size: 11px; }
.availability-note { display: inline-flex; align-items: center; gap: 5px; }
.load-value { color: var(--accent); font-family: var(--font-mono); }
.state-panel { display: flex; align-items: flex-start; gap: 16px; max-width: 640px; padding: 24px; border: 1px solid var(--line); border-radius: var(--radius-md); background: var(--surface); }
.state-panel h2 { margin: 0 0 6px; }
.state-panel p { margin-bottom: 16px; color: var(--muted); }
.state-icon, .empty-mark { display: grid; width: 40px; height: 40px; flex: 0 0 40px; place-items: center; border-radius: var(--radius-sm); color: var(--warning); background: color-mix(in srgb, var(--warning) 12%, transparent); }
.empty-mark { color: var(--accent); background: color-mix(in srgb, var(--accent) 12%, transparent); }
.record-skeleton { min-height: 257px; display: flex; flex-direction: column; justify-content: space-between; padding: 17px; border: 1px solid var(--line); border-radius: var(--radius-md); background: linear-gradient(100deg, var(--surface) 30%, var(--surface-raised) 45%, var(--surface) 60%); background-size: 240% 100%; animation: shimmer 1.6s ease-in-out infinite; }
.record-skeleton span { display: block; width: 46%; height: 12px; border-radius: 3px; background: var(--line); }
.record-skeleton span:nth-child(2) { width: 72%; height: 28px; }
.record-skeleton span:nth-child(3) { width: 100%; height: 50px; }
@keyframes shimmer { to { background-position: -120% 0; } }
.data-status-note { display: flex; align-items: flex-start; gap: 8px; margin-top: 12px; padding: 12px 14px; border-top: 1px solid var(--line); color: var(--muted); font-size: 11px; }
.data-status-note svg { flex: 0 0 auto; color: var(--accent); }
.data-status-note strong { color: var(--ink); font-family: var(--font-mono); font-weight: 500; }
@media (max-width: 760px) { .page { padding: 24px 16px 38px; } .page-header { align-items: flex-start; } .record-grid { grid-template-columns: 1fr; } .stats-grid { grid-template-columns: repeat(2, 1fr); } }
@media (prefers-reduced-motion: reduce) { .record-skeleton { animation: none; } }
</style>
