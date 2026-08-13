<script setup lang="ts">
import { onMounted, ref, watch } from 'vue';
import { RouterLink } from 'vue-router';
import Icon from '../components/Icon.vue';
import { isTauri, tauriApi, toUserMessage } from '../composables/useTauriApi';
import { useSyncController } from '../composables/useSyncController';
import { sourceLabel } from '../lib/labels';
import type { SleepSession } from '../types';

const sessions = ref<SleepSession[]>([]);
const loading = ref(true);
const error = ref<string | null>(null);
const { dataRevision, appStatus, isSyncing } = useSyncController();

const isFiniteNumber = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);
const formatDate = (value: string): string => {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '日期未知' : new Intl.DateTimeFormat('zh-CN', { month: 'short', day: 'numeric', weekday: 'short' }).format(date);
};
const formatDuration = (minutes: number): string => {
  if (!isFiniteNumber(minutes) || minutes < 0) return '时长未知';
  return `${Math.floor(minutes / 60)} 小时 ${Math.round(minutes % 60)} 分`;
};
const scoreLabel = (score?: number): string => isFiniteNumber(score) ? `${Math.round(score)} 分` : '未评分';
const stagePercent = (session: SleepSession, minutes?: number | null): string => {
  const rem = isFiniteNumber(session.rem_minutes) ? session.rem_minutes : 0;
  const total = session.deep_minutes + session.light_minutes + rem + session.awake_minutes;
  return total > 0 && isFiniteNumber(minutes) ? `${Math.max(0, (minutes / total) * 100)}%` : '0%';
};

const loadSleep = async () => {
  loading.value = true;
  error.value = null;
  if (!isTauri()) {
    loading.value = false;
    sessions.value = [];
    return;
  }
  try {
    sessions.value = await tauriApi.getRecentSleep(30);
  } catch (cause) {
    error.value = toUserMessage(cause, '睡眠记录暂时不可用');
  } finally {
    loading.value = false;
  }
};

onMounted(() => {
  void loadSleep();
});
watch(dataRevision, () => void loadSleep());
</script>

<template>
  <section class="page records-page" aria-labelledby="sleep-title">
    <header class="page-header">
      <div><p class="eyebrow">最近 30 条记录</p><h1 id="sleep-title">睡眠</h1><p class="page-intro">按原始时间保留睡眠阶段，来源范围会随每条记录展示。</p></div>
      <button class="button button-quiet" type="button" :disabled="loading" @click="loadSleep"><Icon name="refresh" :size="16" />刷新</button>
    </header>

    <div class="source-note"><Icon name="database" :size="15" /><span>数据来自本机数据库；“用户融合”表示来自 Zepp 区域的聚合结果，“设备原始”表示单一设备记录。</span></div>

    <div v-if="loading" class="record-grid" aria-label="正在加载睡眠记录" aria-live="polite">
      <div v-for="index in 4" :key="index" class="record-skeleton"><span></span><span></span><span></span></div>
    </div>
    <div v-else-if="error" class="state-panel error-panel" role="alert">
      <div class="state-icon"><Icon name="warning" :size="20" /></div><div><h2>睡眠记录加载失败</h2><p>{{ error }}</p><button class="button button-secondary" type="button" @click="loadSleep"><Icon name="refresh" :size="15" />重试</button></div>
    </div>
    <div v-else-if="sessions.length === 0" class="state-panel empty-panel">
      <div class="empty-mark"><Icon name="moon" :size="21" /></div><div><p class="eyebrow">暂无记录</p><h2>{{ isSyncing ? '正在同步睡眠…' : (appStatus?.connection_state === 'connected' ? '这段时间没有睡眠记录' : '完成一次同步后查看睡眠') }}</h2><p>{{ appStatus?.connection_state === 'connected' || isSyncing ? '已连接时，没有记录不一定是失败。' : '连接并同步后，睡眠会按日期排列。' }}</p><RouterLink v-if="appStatus?.connection_state !== 'connected'" class="button button-primary" to="/settings"><Icon name="arrow-right" :size="15" />前往连接</RouterLink></div>
    </div>
    <div v-else class="record-grid">
      <RouterLink v-for="session in sessions" :key="session.sleep_id" class="record-card" :to="{ name: 'SleepDetail', params: { sleepId: session.sleep_id } }" :aria-label="`查看 ${formatDate(session.start_time)} 的睡眠详情`">
        <div class="record-card-head"><div><span class="record-date">{{ formatDate(session.start_time) }}</span><h2>睡眠时段</h2></div><div class="record-link-meta"><span class="scope-badge">{{ sourceLabel(session.source_scope) }}</span><Icon name="arrow-right" :size="15" /></div></div>
        <div class="record-primary"><span>总时长</span><strong>{{ formatDuration(session.duration_minutes) }}</strong><span class="score-value">{{ scoreLabel(session.score) }}</span></div>
        <div class="stage-strip" aria-label="睡眠阶段分布">
          <span class="stage-deep" :style="{ width: stagePercent(session, session.deep_minutes) }" title="深睡"></span>
          <span class="stage-light" :style="{ width: stagePercent(session, session.light_minutes) }" title="浅睡"></span>
          <span class="stage-rem" :style="{ width: stagePercent(session, session.rem_minutes) }" title="REM"></span>
          <span class="stage-awake" :style="{ width: stagePercent(session, session.awake_minutes) }" title="清醒"></span>
        </div>
        <dl class="stage-grid">
          <div><dt>深睡</dt><dd>{{ isFiniteNumber(session.deep_minutes) ? `${session.deep_minutes} 分` : '—' }}</dd></div>
          <div><dt>浅睡</dt><dd>{{ isFiniteNumber(session.light_minutes) ? `${session.light_minutes} 分` : '—' }}</dd></div>
          <div><dt>REM</dt><dd>{{ isFiniteNumber(session.rem_minutes) ? `${session.rem_minutes} 分` : '未提供' }}</dd></div>
          <div><dt>清醒</dt><dd>{{ isFiniteNumber(session.awake_minutes) ? `${session.awake_minutes} 分` : '—' }}</dd></div>
        </dl>
      </RouterLink>
    </div>
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
.record-card { min-height: 220px; padding: 17px; border: 1px solid var(--line); border-radius: var(--radius-md); background: var(--surface); color: inherit; text-decoration: none; transition: border-color 150ms ease, transform 150ms ease; }
.record-card:hover { border-color: var(--line-strong); transform: translateY(-1px); }
.record-card-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; padding-bottom: 16px; border-bottom: 1px solid var(--line); }
.record-link-meta { display: flex; align-items: center; gap: 8px; color: var(--muted); }
.record-date { display: block; margin-bottom: 5px; color: var(--muted); font-family: var(--font-mono); font-size: 11px; }
.scope-badge { display: inline-flex; align-items: center; min-height: 23px; padding: 3px 7px; border: 1px solid var(--line); border-radius: 4px; color: var(--subtle); font-size: 10px; white-space: nowrap; }
.record-primary { display: flex; align-items: baseline; gap: 12px; padding: 19px 0 16px; color: var(--muted); font-size: 12px; }
.record-primary strong { color: var(--ink); font-family: var(--font-mono); font-size: 22px; font-weight: 500; letter-spacing: -.06em; }
.score-value { margin-left: auto; color: var(--accent); font-family: var(--font-mono); }
.stage-strip { display: flex; width: 100%; height: 7px; margin-bottom: 11px; overflow: hidden; border-radius: 3px; background: var(--line); }
.stage-strip span { display: block; min-width: 0; }
.stage-deep { background: #6357c7; }
.stage-light { background: #5278d8; }
.stage-rem { background: #22a87a; }
.stage-awake { background: #db625f; }
.stage-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 1px; margin: 0; overflow: hidden; border: 1px solid var(--line); border-radius: var(--radius-sm); background: var(--line); }
.stage-grid div { min-width: 0; padding: 10px 8px; background: var(--surface-raised); }
.stage-grid dt { color: var(--muted); font-size: 10px; }
.stage-grid dd { margin: 4px 0 0; color: var(--ink); font-family: var(--font-mono); font-size: 12px; }
.state-panel { display: flex; align-items: flex-start; gap: 16px; max-width: 640px; padding: 24px; border: 1px solid var(--line); border-radius: var(--radius-md); background: var(--surface); }
.state-panel h2 { margin: 0 0 6px; }
.state-panel p { margin-bottom: 16px; color: var(--muted); }
.state-icon, .empty-mark { display: grid; width: 40px; height: 40px; flex: 0 0 40px; place-items: center; border-radius: var(--radius-sm); color: var(--warning); background: color-mix(in srgb, var(--warning) 12%, transparent); }
.empty-mark { color: var(--accent); background: color-mix(in srgb, var(--accent) 12%, transparent); }
.record-skeleton { min-height: 220px; display: flex; flex-direction: column; justify-content: space-between; padding: 17px; border: 1px solid var(--line); border-radius: var(--radius-md); background: linear-gradient(100deg, var(--surface) 30%, var(--surface-raised) 45%, var(--surface) 60%); background-size: 240% 100%; animation: shimmer 1.6s ease-in-out infinite; }
.record-skeleton span { display: block; width: 46%; height: 12px; border-radius: 3px; background: var(--line); }
.record-skeleton span:nth-child(2) { width: 72%; height: 28px; }
.record-skeleton span:nth-child(3) { width: 100%; height: 40px; }
@keyframes shimmer { to { background-position: -120% 0; } }
@media (max-width: 760px) { .page { padding: 24px 16px 38px; } .page-header { align-items: flex-start; } .record-grid { grid-template-columns: 1fr; } }
@media (prefers-reduced-motion: reduce) { .record-skeleton { animation: none; } }
</style>
