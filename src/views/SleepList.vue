<script setup lang="ts">
defineOptions({ name: 'SleepList' });
import { computed, onMounted, ref, watch } from 'vue';
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
    shown: (shown: number, total: number) => `已显示 ${shown} / 共 ${total} 条`,
    loadMore: '加载更多',
    loadingMore: '正在加载…',
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
    shown: (shown: number, total: number) => `Showing ${shown} of ${total}`,
    loadMore: 'Load more',
    loadingMore: 'Loading…',
  },
);
const t = useMessages(messages);

const { dataRevision } = useSyncController();
const sessions = ref<SleepSession[]>([]);
const loading = ref(true);
const error = ref<string | null>(null);
/*
 * 分页，不是上限。
 *
 * 以前这里写死 `getRecentSleep(500)`，而后端的 SQL 只有 LIMIT 没有 OFFSET
 * ——第 501 条之后的记录在应用里**根本没有入口**。一个下载了全部历史的人
 * 会以为数据没同步下来（Reddit p6zxyo7）。
 *
 * 每页 200 而不是 500：首屏更快，而「加载更多」按一下就有下一批。
 * 刻意不引虚拟滚动库：这一页是一串 RecordRow，`v-for` 加分页就够了。
 */
const PAGE_SIZE = 200;
const total = ref(0);
const loadingMore = ref(false);
const hasMore = computed(() => sessions.value.length < total.value);

const loadList = async () => {
  loading.value = true;
  error.value = null;
  if (!isTauri()) {
    loading.value = false;
    sessions.value = [];
    total.value = 0;
    return;
  }
  try {
    const page = await tauriApi.getSleepPage(PAGE_SIZE, 0);
    sessions.value = page.items;
    total.value = page.total;
  } catch (cause) {
    error.value = toUserMessage(cause, t.value.loadFailed);
  } finally {
    loading.value = false;
  }
};

const loadMore = async () => {
  if (loadingMore.value || !hasMore.value) return;
  loadingMore.value = true;
  try {
    // offset 用已经拿到的条数。同步在翻页途中插进新记录会让边界上出现一条
    // 重复——按 sleep_id 去一次重，比在前端自己维护游标简单，也不会因为
    // 一次同步就把整个列表推翻重来。
    const page = await tauriApi.getSleepPage(PAGE_SIZE, sessions.value.length);
    const seen = new Set(sessions.value.map((item) => item.sleep_id));
    sessions.value = [...sessions.value, ...page.items.filter((item) => !seen.has(item.sleep_id))];
    total.value = page.total;
  } catch (cause) {
    error.value = toUserMessage(cause, t.value.loadFailed);
  } finally {
    loadingMore.value = false;
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
    <div v-if="hasMore" class="load-more">
      <button class="button button-secondary" type="button" :disabled="loadingMore" @click="loadMore">
        {{ loadingMore ? t.loadingMore : t.loadMore }}
      </button>
    </div>
    <p v-if="sessions.length" class="footnote">
      {{ t.shown(sessions.length, total) }} ·
      {{ t.footnote(sessions.length, formatTime(sessions[sessions.length - 1].start_time)) }}
    </p>
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
.load-more { display: flex; justify-content: center; margin-top: 12px; }
</style>
