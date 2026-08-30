<script setup lang="ts">
defineOptions({ name: 'SleepList' });
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
import { defineMessages, useMessages } from '../i18n';

const messages = defineMessages(
  {
    backToRecent: '返回最近记录',
    backToOverview: '返回概览',
    title: '睡眠',
    intro: '本机已同步的睡眠记录。没有完整时间轴时，只展示汇总。',
    loadFailedTitle: '无法读取睡眠记录',
    loadFailed: '睡眠列表暂时不可用',
    retry: '重试',
    emptyTitle: '还没有睡眠记录',
    emptyMessage: '同步后会显示在这里。没有真实阶段时不会编造。',
    scoreLabel: '评分',
    footnote: (count: number, from: string) => `${count} 条记录 · ${from} 起`,
  },
  {
    backToRecent: 'Back to recent records',
    backToOverview: 'Back to overview',
    title: 'Sleep',
    intro: 'Sleep records synced to this machine. Without a full timeline, only the summary is shown.',
    loadFailedTitle: 'Could not read the sleep records',
    loadFailed: 'The sleep list is unavailable right now',
    retry: 'Try again',
    emptyTitle: 'No sleep records yet',
    emptyMessage: 'They show up here after a sync. Stages are never invented.',
    scoreLabel: 'Score',
    footnote: (count: number, from: string) => `${count} records · since ${from}`,
  },
);
const t = useMessages(messages);

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
    sessions.value = await tauriApi.getRecentSleep(500);
  } catch (cause) {
    error.value = toUserMessage(cause, t.value.loadFailed);
  } finally {
    loading.value = false;
  }
};

onMounted(() => void loadList());
watch(dataRevision, () => void loadList());
</script>

<template>
  <section class="page list-page" aria-labelledby="sleep-list-title">
    <RouterLink class="back-link" to="/recent"><Icon name="arrow-left" :size="14" />{{ t.backToRecent }}</RouterLink>
    <PageHeader back="/" :back-label="t.backToOverview" title-id="sleep-list-title" :title="t.title" :intro="t.intro" />

    <div v-if="loading" class="surface-card" aria-live="polite">
      <SkeletonBlock height="56px" />
      <SkeletonBlock height="56px" />
      <SkeletonBlock height="56px" />
    </div>
    <EmptyState v-else-if="error" tone="error" icon="warning" :title="t.loadFailedTitle" :message="error">
      <button class="button button-secondary" type="button" @click="loadList">{{ t.retry }}</button>
    </EmptyState>
    <EmptyState v-else-if="!sessions.length" icon="moon" :title="t.emptyTitle" :message="t.emptyMessage" />
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
        :fact-label="t.scoreLabel"
        :compact="false"
      />
    </div>
    <p v-if="sessions.length" class="footnote">{{ t.footnote(sessions.length, formatTime(sessions[sessions.length - 1].start_time)) }}</p>
  </section>
</template>

<style scoped>
.list-page { width: 100%; }
.back-link {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 8px;
  color: var(--muted);
  font-size: 12px;
  text-decoration: none;
}
.back-link:hover { color: var(--accent); }
.footnote {
  margin: 12px 0 0;
  color: var(--muted);
  font-size: 12px;
}
</style>
