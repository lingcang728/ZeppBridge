<script setup lang="ts">
defineOptions({ name: 'SleepList' });
import { onMounted } from 'vue';
import { useFirstLoad } from '../composables/useFirstLoad';
import { LIST_PAGE_SIZE, pageQuery } from '../lib/pageQueries';
import { afterMotion } from '../lib/motion/budget';
import PageHeader from '../components/PageHeader.vue';
import RecordRow from '../components/RecordRow.vue';
import EmptyState from '../components/EmptyState.vue';
import SkeletonBlock from '../components/SkeletonBlock.vue';
import { useRevisionReload } from '../composables/useRevisionReload';
import { tauriApi } from '../composables/useTauriApi';
import { usePagedRecords } from '../composables/usePagedRecords';
import { formatDate, formatDuration, formatTime, isFiniteNumber } from '../lib/format';
import type { SleepSession } from '../types';
import { defineMessages, useMessages } from '../i18n';

const messages = defineMessages(
  {
    title: '睡眠',
    intro: '本机已同步的睡眠记录。没有完整时间轴时，只展示汇总。',
    loadFailedTitle: '无法读取睡眠记录',
    loadFailed: '睡眠列表暂不可用',
    retry: '重试',
    emptyTitle: '还没有睡眠记录',
    emptyMessage: '同步后显示在这里。没有真实阶段就不编造。',
    scoreLabel: '评分',
    footnote: (count: number, from: string) => `${count} 条记录 · ${from} 起`,
    shown: (shown: number, total: number) => `已显示 ${shown} / 共 ${total} 条`,
    loadMore: '加载更多',
    loadingMore: '正在加载…',
  },
  {
    title: 'Sleep',
    intro: 'Sleep records synced to this machine. Without a full timeline, only the summary is shown.',
    loadFailedTitle: 'Could not load sleep records',
    loadFailed: 'Sleep list unavailable right now',
    retry: 'Retry',
    emptyTitle: 'No sleep records yet',
    emptyMessage: 'They show up here after a sync. Stages are never invented.',
    scoreLabel: 'Score',
    footnote: (count: number, from: string) => `${count} records · since ${from}`,
    shown: (shown: number, total: number) => `Showing ${shown} of ${total}`,
    loadMore: 'Load more',
    loadingMore: 'Loading…',
  },
  {
    title: 'Sueño',
    intro: 'Registros de sueño sincronizados en este equipo. Sin una línea de tiempo completa, solo se muestra el resumen.',
    loadFailedTitle: 'No se pudieron leer los registros de sueño',
    loadFailed: 'Lista de sueño no disponible ahora',
    retry: 'Reintentar',
    emptyTitle: 'Aún no hay registros de sueño',
    emptyMessage: 'Aparecen aquí tras sincronizar. Sin fases reales no se inventan.',
    scoreLabel: 'Puntuación',
    footnote: (count: number, from: string) => `${count} registros · desde ${from}`,
    shown: (shown: number, total: number) => `Mostrando ${shown} de ${total}`,
    loadMore: 'Cargar más',
    loadingMore: 'Cargando…',
  },
  'views/SleepList',
);
const t = useMessages(messages);

/* 分页、请求代次和去重见 composables/usePagedRecords.ts。 */
const {
  items: sessions, loading, loadingMore, error, staleError, total, hasMore, load: loadList, loadMore, preloaded,
} = usePagedRecords<SleepSession>({
  loadPage: (limit, offset) => tauriApi.getSleepPage(limit, offset),
  idOf: (item) => item.sleep_id,
  failedText: () => t.value.loadFailed,
  firstPage: pageQuery.sleepPage(LIST_PAGE_SIZE),
});
const initialLoading = useFirstLoad(loading);

// 第一帧用的是先前读好的首页：重读等形变放完再做（lib/motion/budget.ts）。
onMounted(() => { if (preloaded) afterMotion(() => { void loadList(); }); else void loadList(); });
useRevisionReload(() => void loadList());
</script>

<template>
  <section class="page list-page" aria-labelledby="sleep-list-title">
    <PageHeader title-id="sleep-list-title" :title="t.title" :intro="t.intro" />

    <div v-if="initialLoading" class="surface-card" aria-live="polite">
      <SkeletonBlock height="56px" />
      <SkeletonBlock height="56px" />
      <SkeletonBlock height="56px" />
    </div>
    <EmptyState v-else-if="error" tone="error" icon="warning" :title="t.loadFailedTitle" :message="error">
      <button class="button button-secondary" type="button" @click="loadList">{{ t.retry }}</button>
    </EmptyState>
    <EmptyState v-else-if="!sessions.length" icon="moon" :title="t.emptyTitle" :message="t.emptyMessage" />
    <div v-else class="record-list">
      <RecordRow
        v-for="session in sessions"
        :key="session.sleep_id"
        :to="{ name: 'SleepDetail', params: { sleepId: session.sleep_id } }"
        category="sleep"
        design-icon="sleep"
        :kicker="formatDate(session.start_time)"
        :time="formatTime(session.start_time)"
        :title="formatDuration(session.duration_minutes)"
        :fact="isFiniteNumber(session.score) ? String(Math.round(session.score)) : '—'"
        :fact-label="t.scoreLabel"
      />
    </div>
    <p v-if="staleError" class="stale-note" role="status">{{ staleError }}</p>
    <div v-if="hasMore" class="load-more">
      <button class="button button-secondary" type="button" :disabled="loadingMore" @click="loadMore">
        {{ loadingMore ? t.loadingMore : t.loadMore }}
      </button>
    </div>
    <p v-if="sessions.length" class="footnote">
      {{ t.shown(sessions.length, total) }} ·
      {{ t.footnote(sessions.length, formatDate(sessions[sessions.length - 1].start_time)) }}
    </p>
  </section>
</template>

<style scoped>
.list-page { width: 100%; }
.stale-note { margin: 10px 0 0; color: var(--warning, var(--muted)); font-size: var(--fs-sm); }
.footnote {
  margin: 12px 0 0;
  color: var(--muted);
  font-size: var(--fs-sm);
}
.load-more { display: flex; justify-content: center; margin-top: 12px; }
</style>
