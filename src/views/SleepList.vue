<script setup lang="ts">
defineOptions({ name: 'SleepList' });
import { computed, onActivated, onBeforeUnmount, onDeactivated, onMounted, ref, watch } from 'vue';
import { useSectionTour } from '../composables/useTour';
import { useFirstLoad } from '../composables/useFirstLoad';
import { LIST_PAGE_SIZE, pageQuery } from '../lib/pageQueries';
import { afterMotion, nextSlot } from '../lib/motion/budget';
import PageHeader from '../components/PageHeader.vue';
import RecordRow from '../components/RecordRow.vue';
import { timelineKey } from '../lib/scroll/scrollbar';
import EmptyState from '../components/EmptyState.vue';
import SkeletonBlock from '../components/SkeletonBlock.vue';
import { useRevisionReload } from '../composables/useRevisionReload';
import { tauriApi } from '../composables/useTauriApi';
import { usePagedRecords } from '../composables/usePagedRecords';
import { formatDate, formatDuration, formatTime, isFiniteNumber } from '../lib/format';
import type { SleepSession } from '../types';
import { defineMessages, useMessages } from '../i18n';
import AlbumCapsule from '../components/album/AlbumCapsule.vue';
import AlbumPeriods from '../components/album/AlbumPeriods.vue';
import AlbumGrid from '../components/album/AlbumGrid.vue';
import SleepStripBar from '../components/album/SleepStripBar.vue';
import { useRecordAlbum } from '../composables/useRecordAlbum';
import { useAlbumNav } from '../composables/useAlbumNav';
import { localDay, type AlbumTile } from '../lib/album/album';

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
  items: sessions, loading, loadingMore, error, staleError, total, hasMore, load: loadList, loadMore, preloaded, sentinelRef,
} = usePagedRecords<SleepSession>({
  loadPage: (limit, offset) => tauriApi.getSleepPage(limit, offset),
  idOf: (item) => item.sleep_id,
  failedText: () => t.value.loadFailed,
  firstPage: pageQuery.sleepPage(LIST_PAGE_SIZE),
});
const initialLoading = useFirstLoad(loading);

// The first query can return 200 nights. Fill the screen immediately and mount
// the remaining rows after the transition in small batches.
const renderLimit = ref<number | null>(Math.ceil(window.innerHeight / 44) + 4);
const rendered = computed(() => renderLimit.value === null ? sessions.value : sessions.value.slice(0, renderLimit.value));
const rendering = computed(() => rendered.value.length < sessions.value.length);
let fillGeneration = 0;
let filling = false;
let active = false;
const fillList = () => {
  if (!active || !sessions.value.length || renderLimit.value === null || filling) return;
  filling = true;
  const generation = ++fillGeneration;
  const addRows = () => {
    if (fillGeneration !== generation) return;
    const limit = (renderLimit.value ?? 0) + 24;
    if (limit >= sessions.value.length) {
      renderLimit.value = null;
      filling = false;
    } else {
      renderLimit.value = limit;
      nextSlot(addRows);
    }
  };
  afterMotion(() => nextSlot(addRows));
};
const startFilling = () => { active = true; fillList(); };
const stopFilling = () => { active = false; fillGeneration += 1; filling = false; };
watch(() => sessions.value.length, fillList);
onMounted(startFilling);
onActivated(startFilling);
onDeactivated(stopFilling);
onBeforeUnmount(stopFilling);

// 第一帧用的是先前读好的首页：重读等形变放完再做（lib/motion/budget.ts）。
onMounted(() => { if (preloaded) afterMotion(() => { void loadList(); }); else void loadList(); });
/* 相册（lib/album）：胶囊切年 / 月 / 日，「日」这一层 Ctrl + 滚轮 / 捏合在列表行、方块、日历热图之间换。 */
const albumIds = computed(() => rendered.value.map((s) => s.sleep_id));
const album = useRecordAlbum('sleep', albumIds);
const { level, density, periods, strips } = album;
const shownPeriods = computed(() => (level.value === 'year' ? periods.value.year : periods.value.month));
const stage = ref<HTMLElement | null>(null);
const ensureMonth = async (month: string) => {
  for (let guard = 0; guard < 40 && hasMore.value; guard += 1) {
    const last = sessions.value[sessions.value.length - 1];
    if (last && (timelineKey(last.start_time) ?? '') <= month) break;
    if (loadingMore.value) await new Promise((resolve) => { window.setTimeout(resolve, 60); });
    else await loadMore();
  }
  // 要落到的那个月得先画出来（平时是分批补行的）。
  renderLimit.value = null;
};
const { go: goLevel, openPeriod } = useAlbumNav({
  stage, level, density, ensureMonth, zoomable: () => true, loadPeriods: () => album.loadMonths(),
});
/* 方块和热图一次画全部（格子轻）；热图还接着在空闲时往下读，一屏能看好几个月。 */
watch([density, () => sessions.value.length], () => {
  if (density.value > 0 && level.value === 'day') renderLimit.value = null;
  if (density.value === 2 && level.value === 'day' && hasMore.value && sessions.value.length < 2000) nextSlot(() => { void loadMore(); });
});

/** 当地中午之后的分钟数（一晚不会被午夜劈成两半）。 */
const afterNoon = (iso: string) => {
  const d = new Date(iso);
  return (d.getHours() * 60 + d.getMinutes() - 720 + 1440) % 1440;
};
const nightOf = (session: SleepSession) => {
  const from = afterNoon(session.start_time);
  const length = Math.max(0, (Date.parse(session.end_time) - Date.parse(session.start_time)) / 60_000);
  return { from, to: from + length };
};
/* 列表里每一行的分期条共用一条时间轴（入睡、醒来上下对得齐）：取大多数晚上落在的那一段，偶尔的午睡不把轴撑开。 */
const axis = computed(() => {
  const nights = rendered.value.map(nightOf);
  if (!nights.length) return null;
  const froms = nights.map((n) => n.from).sort((a, b) => a - b);
  const tos = nights.map((n) => n.to).sort((a, b) => a - b);
  const pick = (list: number[], q: number) => list[Math.min(list.length - 1, Math.max(0, Math.floor(q * (list.length - 1))))];
  const from = Math.floor(pick(froms, 0.05) / 60) * 60;
  const to = Math.ceil(pick(tos, 0.95) / 60) * 60;
  return to - from >= 120 ? { from, to } : null;
});
const tiles = computed<AlbumTile[]>(() => (density.value === 0 || level.value !== 'day' ? [] : sessions.value.map((session) => {
  const minutes = session.duration_minutes ?? 0;
  const reading = formatDuration(session.duration_minutes);
  return {
    id: session.sleep_id,
    day: localDay(session.start_time),
    month: timelineKey(session.start_time) ?? '',
    to: { name: 'SleepDetail', params: { sleepId: session.sleep_id } },
    label: `${formatDate(session.start_time, 'auto')} ${formatTime(session.start_time)} · ${reading}`,
    reading,
    color: 'var(--sleep)',
    strength: Math.min(1, Math.max(0, (minutes - 300) / 240)),
    weight: minutes,
  };
})));
const sessionById = computed(() => new Map(sessions.value.map((s) => [s.sleep_id, s])));

useRevisionReload(() => { void loadList(); album.invalidate(); });
/* 新手引导：这个板块第一次打开时就地讲一遍（lib/tour/chapters.ts）。 */
useSectionTour('sleep');
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
    <div v-else ref="stage" class="album-stage">
    <AlbumPeriods v-if="level !== 'day'" data-album-body kind="sleep" :level="level" :periods="shownPeriods" @open="openPeriod" />
    <AlbumGrid v-else-if="density" data-album-body :tiles="tiles" :density="density">
      <template #tile="{ tile }">
        <b class="tile-reading">{{ tile.reading }}</b>
        <span class="tile-gap" />
        <SleepStripBar class="tile-strip" v-bind="nightOf(sessionById.get(tile.id)!)" :spans="strips.get(tile.id)?.spans" />
      </template>
    </AlbumGrid>
    <div v-else data-album-body class="record-list sleep-records">
      <RecordRow
        v-for="session in rendered"
        :key="session.sleep_id"
        data-album-item
        :data-album-id="session.sleep_id"
        :data-album-day="localDay(session.start_time)"
        :data-timeline="timelineKey(session.start_time)"
        :to="{ name: 'SleepDetail', params: { sleepId: session.sleep_id } }"
        category="sleep"
        design-icon="sleep"
        :kicker="formatDate(session.start_time, 'auto')"
        :time="formatTime(session.start_time)"
        :title="formatDuration(session.duration_minutes)"
        :fact="isFiniteNumber(session.score) ? String(Math.round(session.score)) : '—'"
        :fact-label="t.scoreLabel"
      >
        <template #aside><SleepStripBar class="row-strip" v-bind="nightOf(session)" :spans="strips.get(session.sleep_id)?.spans" :axis="axis" /></template>
      </RecordRow>
    </div>
    </div>
    <AlbumCapsule v-if="sessions.length && !error" :level="level" @update:level="goLevel" />
    <p v-if="staleError" class="stale-note" role="status">{{ staleError }}</p>
    <div v-if="hasMore && !rendering && level === 'day'" :ref="sentinelRef" class="load-more">
      <button class="button button-secondary" type="button" :disabled="loadingMore" @click="loadMore">
        {{ loadingMore ? t.loadingMore : t.loadMore }}
      </button>
    </div>
    <p v-if="sessions.length && !rendering && level === 'day'" class="footnote">
      {{ t.shown(sessions.length, total) }} ·
      {{ t.footnote(sessions.length, formatDate(sessions[sessions.length - 1].start_time, 'auto')) }}
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
/* 相册：幽灵板（lib/album/albumMotion.ts）绝对定位在这一层里。 */
.album-stage { position: relative; }
.sleep-records { --record-aside: minmax(96px, 40%); }
.row-strip { width: 100%; }
.tile-reading { color: var(--ink); font-size: var(--fs-md); font-weight: 650; font-variant-numeric: tabular-nums; overflow-wrap: anywhere; }
.tile-strip { width: 100%; }
</style>
