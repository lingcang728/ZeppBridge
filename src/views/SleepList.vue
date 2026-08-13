<script setup lang="ts">
import { onMounted, ref, watch } from 'vue';
import { RouterLink } from 'vue-router';
import Icon from '../components/Icon.vue';
import PageHeader from '../components/PageHeader.vue';
import RecordRow from '../components/RecordRow.vue';
import EmptyState from '../components/EmptyState.vue';
import SkeletonBlock from '../components/SkeletonBlock.vue';
import { useSyncController } from '../composables/useSyncController';
import { isTauri, tauriApi, toUserMessage } from '../composables/useTauriApi';
import { formatDate, formatDuration, formatTime, isFiniteNumber } from '../lib/format';
import type { SleepSession } from '../types';

const { dataRevision } = useSyncController();
const sessions = ref<SleepSession[]>([]);
const loading = ref(true);
const error = ref<string | null>(null);

const loadList = async () => {
  loading.value = true;
  error.value = null;
  if (!isTauri()) {
    loading.value = false;
    sessions.value = [];
    return;
  }
  try {
    sessions.value = await tauriApi.getRecentSleep(60);
  } catch (cause) {
    error.value = toUserMessage(cause, '睡眠列表暂时不可用');
  } finally {
    loading.value = false;
  }
};

onMounted(() => void loadList());
watch(dataRevision, () => void loadList());
</script>

<template>
  <section class="page list-page" aria-labelledby="sleep-list-title">
    <RouterLink class="back-link" to="/"><Icon name="arrow-left" :size="14" />返回概览</RouterLink>
    <PageHeader title-id="sleep-list-title" title="睡眠" intro="本机已同步的睡眠记录。没有完整时间轴时，只展示汇总。" />

    <div v-if="loading" class="surface-card" aria-live="polite">
      <SkeletonBlock height="56px" />
      <SkeletonBlock height="56px" />
      <SkeletonBlock height="56px" />
    </div>
    <EmptyState v-else-if="error" tone="error" icon="warning" title="无法读取睡眠记录" :message="error">
      <button class="button button-secondary" type="button" @click="loadList">重试</button>
    </EmptyState>
    <EmptyState v-else-if="!sessions.length" icon="moon" title="还没有睡眠记录" message="同步后会显示在这里。没有真实阶段时不会编造。" />
    <div v-else class="surface-card">
      <RecordRow
        v-for="session in sessions"
        :key="session.sleep_id"
        :to="{ name: 'SleepDetail', params: { sleepId: session.sleep_id } }"
        category="sleep"
        icon="moon"
        :kicker="formatDate(session.start_time)"
        :title="formatDuration(session.duration_minutes)"
        :fact="isFiniteNumber(session.score) ? String(Math.round(session.score)) : '—'"
        fact-label="评分"
        :compact="false"
      />
    </div>
    <p v-if="sessions.length" class="footnote">{{ sessions.length }} 条记录 · {{ formatTime(sessions[sessions.length - 1].start_time) }} 起</p>
  </section>
</template>

<style scoped>
.list-page { width: 100%; }
.back-link {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 10px;
  color: var(--muted);
  font-size: 13px;
  text-decoration: none;
}
.back-link svg { transform: rotate(180deg); }
.footnote {
  margin: 12px 0 0;
  color: var(--muted);
  font-size: 12px;
}
</style>
