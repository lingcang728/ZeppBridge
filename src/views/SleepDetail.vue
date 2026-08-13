<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { RouterLink, useRoute } from 'vue-router';
import Icon from '../components/Icon.vue';
import MetricHero from '../components/MetricHero.vue';
import StageBar from '../components/StageBar.vue';
import EmptyState from '../components/EmptyState.vue';
import { useSyncController } from '../composables/useSyncController';
import { sourceLabel } from '../lib/labels';
import { isTauri, tauriApi, toUserMessage } from '../composables/useTauriApi';
import { formatDate, formatDuration, formatTime, isFiniteNumber } from '../lib/format';
import type { SleepSession } from '../types';

const route = useRoute();
const { dataRevision } = useSyncController();
const session = ref<SleepSession | null>(null);
const loading = ref(true);
const error = ref<string | null>(null);
const sleepId = computed(() => String(route.params.sleepId || ''));

const stages = computed(() => session.value ? [
  { label: '深睡', minutes: session.value.deep_minutes, tone: 'deep' as const },
  { label: '浅睡', minutes: session.value.light_minutes, tone: 'light' as const },
  { label: 'REM', minutes: session.value.rem_minutes, tone: 'rem' as const },
  { label: '清醒', minutes: session.value.awake_minutes, tone: 'awake' as const },
] : []);

const loadDetail = async () => {
  loading.value = true;
  error.value = null;
  if (!isTauri()) {
    loading.value = false;
    return;
  }
  try {
    session.value = await tauriApi.getSleepDetail(sleepId.value);
  } catch (cause) {
    error.value = toUserMessage(cause, '睡眠详情暂时不可用');
  } finally {
    loading.value = false;
  }
};

onMounted(() => void loadDetail());
watch(dataRevision, () => void loadDetail());
</script>

<template>
  <section class="page" aria-labelledby="sleep-detail-title">
    <RouterLink class="back-link" to="/"><Icon name="arrow-right" :size="14" />返回概览</RouterLink>
    <h1 id="sleep-detail-title" class="sr-only">睡眠详情</h1>

    <div v-if="loading" class="muted-line" aria-live="polite">正在读取睡眠详情…</div>
    <EmptyState v-else-if="error" tone="error" icon="warning" title="无法读取这条睡眠" :message="error">
      <button class="button button-secondary" type="button" @click="loadDetail">重试</button>
    </EmptyState>
    <EmptyState v-else-if="!session" icon="moon" title="找不到这条睡眠记录" message="它可能已被清理，或尚未同步到本机。" />

    <template v-else>
      <MetricHero
        category="sleep"
        icon="moon"
        :kicker="formatDate(session.start_time, 'long')"
        :value="formatDuration(session.duration_minutes, '—')"
        :detail="`${formatTime(session.start_time)} 入睡 · ${formatTime(session.end_time)} 醒来`"
      />

      <div class="score-row">
        <span>睡眠评分</span>
        <strong>{{ isFiniteNumber(session.score) ? session.score : '—' }}</strong>
        <small>/ 100</small>
      </div>

      <section class="surface-card stage-card" aria-label="睡眠阶段">
        <h2>睡眠阶段</h2>
        <StageBar :stages="stages" />
      </section>

      <section class="surface-card provenance">
        <div><span>来源</span><strong>{{ sourceLabel(session.source_scope) }}</strong></div>
        <div><span>设备</span><strong>{{ session.device_id || '未提供设备标识' }}</strong></div>
      </section>
      <p class="note">只展示云端给出的阶段汇总。没有 REM 字段时显示「未提供」，不会用减法编造。</p>
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
.score-row {
  display: flex;
  align-items: baseline;
  gap: 8px;
  margin: 16px 0;
  color: var(--muted);
  font-size: 13px;
}
.score-row strong {
  color: var(--sleep);
  font-family: var(--font-mono);
  font-size: 28px;
  font-variant-numeric: tabular-nums;
  font-weight: 500;
}
.stage-card { padding: 18px 20px 20px; }
.stage-card h2 { margin-bottom: 14px; font-size: 16px; }
.provenance {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 20px;
  margin-top: 12px;
  padding: 18px 20px;
}
.provenance span { display: block; color: var(--muted); font-size: 12px; }
.provenance strong { display: block; margin-top: 4px; overflow-wrap: anywhere; }
.note { margin: 12px 0 0; color: var(--muted); font-size: 12px; }
@media (max-width: 760px) {
  .provenance { grid-template-columns: 1fr; }
}
</style>
