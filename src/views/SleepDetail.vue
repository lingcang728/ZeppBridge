<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { RouterLink, useRoute } from 'vue-router';
import Icon from '../components/Icon.vue';
import { useSyncController } from '../composables/useSyncController';
import { sourceLabel } from '../lib/labels';
import { isTauri, tauriApi, toUserMessage } from '../composables/useTauriApi';
import type { SleepSession } from '../types';

const route = useRoute();
const { dataRevision } = useSyncController();
const session = ref<SleepSession | null>(null);
const loading = ref(true);
const error = ref<string | null>(null);
const sleepId = computed(() => String(route.params.sleepId || ''));

const isFiniteNumber = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);
const formatDate = (value: string): string => {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '日期未知' : new Intl.DateTimeFormat('zh-CN', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' }).format(date);
};
const formatTime = (value: string): string => {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '—' : new Intl.DateTimeFormat('zh-CN', { hour: '2-digit', minute: '2-digit' }).format(date);
};
const formatDuration = (minutes: number): string => !isFiniteNumber(minutes) ? '—' : `${Math.floor(minutes / 60)} 小时 ${Math.round(minutes % 60)} 分`;
const stageTotal = computed(() => session.value ? session.value.deep_minutes + session.value.light_minutes + (session.value.rem_minutes || 0) + session.value.awake_minutes : 0);
const stages = computed(() => session.value ? [
  { label: '深睡', minutes: session.value.deep_minutes, class: 'deep' },
  { label: '浅睡', minutes: session.value.light_minutes, class: 'light' },
  { label: 'REM', minutes: session.value.rem_minutes, class: 'rem' },
  { label: '清醒', minutes: session.value.awake_minutes, class: 'awake' },
] : []);
const percent = (minutes?: number | null): number => stageTotal.value > 0 && typeof minutes === 'number' ? Math.max(0, (minutes / stageTotal.value) * 100) : 0;

const loadDetail = async () => {
  loading.value = true;
  error.value = null;
  if (!isTauri()) { loading.value = false; return; }
  try { session.value = await tauriApi.getSleepDetail(sleepId.value); }
  catch (cause) { error.value = toUserMessage(cause, '睡眠详情暂时不可用'); }
  finally { loading.value = false; }
};
onMounted(() => void loadDetail());
watch(dataRevision, () => void loadDetail());
</script>

<template>
  <section class="detail-page" aria-labelledby="sleep-detail-title">
    <RouterLink class="back-link" to="/sleep"><Icon name="arrow-right" :size="14" />返回睡眠列表</RouterLink>
    <div v-if="loading" class="state-panel" aria-live="polite">正在读取睡眠详情…</div>
    <div v-else-if="error" class="state-panel error" role="alert"><Icon name="warning" :size="18" />{{ error }}<button type="button" @click="loadDetail">重试</button></div>
    <div v-else-if="!session" class="state-panel"><div><h1 id="sleep-detail-title">找不到这条睡眠记录</h1><p>它可能已被清理，或尚未同步到本机。</p></div></div>
    <template v-else>
      <header class="detail-header"><div><p class="eyebrow">{{ formatDate(session.start_time) }}</p><h1 id="sleep-detail-title">睡眠详情</h1><p>{{ formatTime(session.start_time) }} 入睡 · {{ formatTime(session.end_time) }} 醒来</p></div><div class="score"><span>睡眠评分</span><strong>{{ isFiniteNumber(session.score) ? session.score : '—' }}</strong><small>/ 100</small></div></header>
      <section class="hero-metrics" aria-label="睡眠摘要"><div><span>总时长</span><strong>{{ formatDuration(session.duration_minutes) }}</strong></div><div><span>入睡</span><strong>{{ formatTime(session.start_time) }}</strong></div><div><span>醒来</span><strong>{{ formatTime(session.end_time) }}</strong></div></section>
      <section class="detail-section"><div class="section-heading"><div><p class="eyebrow">真实阶段汇总</p><h2>睡眠阶段</h2></div><span>{{ stageTotal }} 分钟阶段数据</span></div><div class="stage-bar" aria-label="睡眠阶段真实比例"><span v-for="stage in stages" :key="stage.label" :class="stage.class" :style="{ width: `${percent(stage.minutes)}%` }"></span></div><div class="stage-list"><div v-for="stage in stages" :key="stage.label"><span><i :class="stage.class"></i>{{ stage.label }}</span><strong>{{ stage.minutes }} 分钟</strong><small>{{ percent(stage.minutes).toFixed(1) }}%</small></div></div></section>
      <section class="detail-section provenance"><div><span>来源</span><strong>{{ sourceLabel(session.source_scope) }}</strong></div><div><span>设备</span><strong>{{ session.device_id || '未提供设备标识' }}</strong></div></section>
      <aside class="note"><Icon name="info" :size="15" />只展示云端给出的阶段汇总。没有 REM 字段时显示「未提供」，不会用减法编造。</aside>
    </template>
  </section>
</template>

<style scoped>
.detail-page { width: min(100%, 920px); margin: 0 auto; padding: 32px 32px 64px; }.back-link { display: inline-flex; align-items: center; gap: 6px; margin-bottom: 24px; color: var(--muted); font-size: 12px; text-decoration: none; }.back-link svg { transform: rotate(180deg); }.detail-header { display: flex; align-items: flex-end; justify-content: space-between; gap: 24px; padding-bottom: 24px; border-bottom: 1px solid var(--line); }.eyebrow { margin: 0 0 7px; color: var(--muted); font-size: 10px; font-weight: 700; letter-spacing: .12em; text-transform: uppercase; }h1, h2, p { margin-top: 0; }h1 { margin-bottom: 7px; font-size: clamp(34px, 5vw, 52px); letter-spacing: -.05em; }h2 { margin-bottom: 0; font-size: 19px; }.detail-header p { margin-bottom: 0; color: var(--muted); }.score { min-width: 130px; text-align: right; }.score span, .score small { display: block; color: var(--muted); font-size: 10px; }.score strong { color: var(--accent); font-family: var(--font-mono); font-size: 48px; font-weight: 500; letter-spacing: -.08em; }.hero-metrics { display: grid; grid-template-columns: 2fr 1fr 1fr; gap: 1px; margin: 22px 0; overflow: hidden; border: 1px solid var(--line); border-radius: var(--radius-md); background: var(--line); }.hero-metrics div { padding: 17px; background: var(--surface); }.hero-metrics span, .provenance span { display: block; color: var(--muted); font-size: 10px; }.hero-metrics strong { display: block; margin-top: 6px; font-family: var(--font-mono); font-size: 18px; font-weight: 500; }.detail-section { margin-top: 10px; padding: 20px; border: 1px solid var(--line); border-radius: var(--radius-md); background: var(--surface); }.section-heading { display: flex; align-items: flex-end; justify-content: space-between; gap: 20px; }.section-heading > span { color: var(--muted); font-size: 10px; }.stage-bar { display: flex; height: 10px; margin: 19px 0 13px; overflow: hidden; border-radius: 4px; background: var(--line); }.deep { background: #6657bf; }.light { background: #4f79c8; }.rem { background: #398f72; }.awake { background: #b76060; }.stage-list { display: grid; grid-template-columns: repeat(4, 1fr); gap: 1px; background: var(--line); }.stage-list > div { padding: 12px; background: var(--surface-raised); }.stage-list span, .stage-list strong, .stage-list small { display: block; }.stage-list span { color: var(--muted); font-size: 10px; }.stage-list i { display: inline-block; width: 7px; height: 7px; margin-right: 6px; border-radius: 50%; }.stage-list strong { margin-top: 7px; font-family: var(--font-mono); font-size: 12px; }.stage-list small { margin-top: 2px; color: var(--muted); }.provenance { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; }.provenance strong { display: block; margin-top: 4px; overflow-wrap: anywhere; }.note, .state-panel { display: flex; align-items: flex-start; gap: 8px; margin-top: 12px; padding: 13px 15px; border: 1px solid var(--line); border-radius: var(--radius-sm); color: var(--muted); font-size: 11px; }.state-panel { min-height: 120px; align-items: center; background: var(--surface); }.state-panel.error { color: var(--danger); }.state-panel button { margin-left: auto; border: 0; background: transparent; color: inherit; cursor: pointer; }@media (max-width: 760px) { .detail-page { padding: 24px 16px 38px; }.detail-header { align-items: flex-start; }.hero-metrics { grid-template-columns: 1fr; }.stage-list { grid-template-columns: repeat(2, 1fr); }.provenance { grid-template-columns: 1fr; } }
</style>
