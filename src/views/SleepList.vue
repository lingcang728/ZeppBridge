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
import AlbumTray from '../components/album/AlbumTray.vue';
import AlbumGrid from '../components/album/AlbumGrid.vue';
import AlbumMonthHead from '../components/album/AlbumMonthHead.vue';
import SleepYearCard from '../components/album/SleepYearCard.vue';
import SleepNightMark from '../components/album/SleepNightMark.vue';
import BedtimeFactors from '../components/sleepJournal/BedtimeFactors.vue';
import NightJournalMark from '../components/sleepJournal/NightJournalMark.vue';
import MoodFace from '../components/sleepJournal/MoodFace.vue';
import { useSleepJournal } from '../composables/useSleepJournal';
import StageRing from '../components/album/StageRing.vue';
import { albumMessages } from '../components/album/album.i18n';
import { useRecordAlbum } from '../composables/useRecordAlbum';
import { useAlbumNav } from '../composables/useAlbumNav';
import { useRecordFocusLanding } from '../composables/useRecordFocus';
import { localDay, sleepYearAnalysis, type AlbumTile, type AlbumZoom } from '../lib/album/album';
import type { SleepMonth } from '../types/album';

const messages = defineMessages(
  {
    title: '睡眠',
    loadFailedTitle: '无法读取睡眠记录',
    loadFailed: '睡眠列表暂不可用',
    retry: '重试',
    emptyTitle: '还没有睡眠记录',
    emptyMessage: '同步后显示在这里。没有真实阶段就不编造。',
    footnote: (count: number, from: string) => `${count} 条记录 · ${from} 起`,
    shown: (shown: number, total: number) => `已显示 ${shown} / 共 ${total} 条`,
    loadMore: '加载更多',
    loadingMore: '正在加载…',
  },
  {
    title: 'Sleep',
    loadFailedTitle: 'Could not load sleep records',
    loadFailed: 'Sleep list unavailable right now',
    retry: 'Retry',
    emptyTitle: 'No sleep records yet',
    emptyMessage: 'They show up here after a sync. Stages are never invented.',
    footnote: (count: number, from: string) => `${count} records · since ${from}`,
    shown: (shown: number, total: number) => `Showing ${shown} of ${total}`,
    loadMore: 'Load more',
    loadingMore: 'Loading…',
  },
  {
    title: 'Sueño',
    loadFailedTitle: 'No se pudieron leer los registros de sueño',
    loadFailed: 'Lista de sueño no disponible ahora',
    retry: 'Reintentar',
    emptyTitle: 'Aún no hay registros de sueño',
    emptyMessage: 'Aparecen aquí tras sincronizar. Sin fases reales no se inventan.',
    footnote: (count: number, from: string) => `${count} registros · desde ${from}`,
    shown: (shown: number, total: number) => `Mostrando ${shown} de ${total}`,
    loadMore: 'Cargar más',
    loadingMore: 'Cargando…',
  },
  'views/SleepList',
);
const t = useMessages(messages);
const albumText = useMessages(albumMessages);

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

/* 三档缩放（lib/album）：Ctrl + 滚轮 / 捏合和左下托盘走同一个 go()。
   日 = 逐晚列表，月 = 按月小格 + 月度组头，年 = 每年一块热图 + 年度分析。 */
const albumIds = computed(() => sessions.value.map((s) => s.sleep_id));
const album = useRecordAlbum('sleep', albumIds);
const { zoom, periods, months } = album;
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
const { go } = useAlbumNav({
  stage, zoom, zoomable: () => true,
  prepare: async (next: AlbumZoom) => { if (next !== 'day') { await album.loadMonths(); renderLimit.value = null; } },
  ensureDay: (day) => ensureMonth(day.slice(0, 7)),
});
const goZoom = (next: AlbumZoom) => { void go(next); };
/* 从某一晚的详情页往外缩回来（第四档 → 日档）：停在那一晚上。 */
useRecordFocusLanding({ kind: 'sleep', zoom, stage, ready: () => !loading.value && sessions.value.length > 0, ensureDay: (day) => ensureMonth(day.slice(0, 7)) });
/* 年档热图上点某一天：放大回日档、滚到那一晚。 */
const openDay = (day: string, cell: HTMLElement) => { void go('day', { day, anchor: cell }); };
/* 小格和热图一次画全部（格子轻）；热图还接着在空闲时往下读，一屏能看好几个月。 */
watch([zoom, () => sessions.value.length], () => {
  if (zoom.value !== 'day') renderLimit.value = null;
  if (zoom.value === 'year' && hasMore.value && sessions.value.length < 2000) nextSlot(() => { void loadMore(); });
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
/* 每一行的入睡 / 醒来点共用一条时间轴（上下对得齐）：取大多数晚上落在的那一段，偶尔的午睡不把轴撑开。
   按全部已读进来的晚上算一次，不随分批挂载的行每批重算。 */
const axis = computed(() => {
  const nights = sessions.value.map(nightOf);
  if (!nights.length) return null;
  const froms = nights.map((n) => n.from).sort((a, b) => a - b);
  const tos = nights.map((n) => n.to).sort((a, b) => a - b);
  const pick = (list: number[], q: number) => list[Math.min(list.length - 1, Math.max(0, Math.floor(q * (list.length - 1))))];
  const from = Math.floor(pick(froms, 0.05) / 60) * 60;
  const to = Math.ceil(pick(tos, 0.95) / 60) * 60;
  return to - from >= 120 ? { from, to } : null;
});
const tiles = computed<AlbumTile[]>(() => (zoom.value === 'day' ? [] : sessions.value.map((session) => {
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
const scoreOf = (id: string): number | null => {
  const score = sessionById.value.get(id)?.score;
  return isFiniteNumber(score) && score > 0 ? Math.round(score) : null;
};
const stagesOf = (s: SleepSession) => ({ deep: s.deep_minutes, light: s.light_minutes, rem: s.rem_minutes, awake: s.awake_minutes });
const yearAnalysis = (year: number) => sleepYearAnalysis((months.value ?? []) as SleepMonth[], String(year));

useRevisionReload(() => { void loadList(); album.invalidate(); });

/* 睡前日志记在醒来那天下：读进来的晚上一次读一段，每晚右边画一枚小标记（午睡不算那一晚）。 */
const journal = useSleepJournal();
const wakeDay = (session: SleepSession) => localDay(session.end_time);
const isMainSleep = (session: SleepSession) => (session.duration_minutes ?? 0) >= 180;
/* 月档小格右上角那张醒来的脸（只给主睡眠；没记就不占位）。 */
const moodOf = (id: string) => {
  const session = sessionById.value.get(id);
  return session && isMainSleep(session) ? journal.entries.value.get(wakeDay(session))?.mood ?? null : null;
};
let journalSpan = '';
const loadJournal = (force = false) => {
  const days = sessions.value.map(wakeDay).sort();
  if (!days.length) return;
  const span = `${days[0]}/${days[days.length - 1]}`;
  if (!force && span === journalSpan) return;
  journalSpan = span;
  afterMotion(() => { void journal.loadRange(days[0]!, days[days.length - 1]!); });
};
watch(() => sessions.value.length, () => loadJournal(), { immediate: true });
useRevisionReload(() => loadJournal(true));
/* 新手引导：这个板块第一次打开时就地讲一遍（lib/tour/chapters.ts）。 */
useSectionTour('sleep');
</script>

<template>
  <section class="page list-page" aria-labelledby="sleep-list-title">
    <PageHeader title-id="sleep-list-title" :title="t.title" />

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
      <AlbumGrid v-if="zoom === 'year'" data-album-body kind="sleep" view="year" :tiles="tiles" @day="openDay">
        <template #tile="{ tile }"><b>{{ tile.reading }}</b></template>
        <template #year-head="{ year }">
          <SleepYearCard v-if="yearAnalysis(year)" :analysis="yearAnalysis(year)!" />
        </template>
      </AlbumGrid>
      <AlbumGrid v-else-if="zoom === 'month'" data-album-body kind="sleep" view="month" :tiles="tiles">
        <template #head="{ month }"><AlbumMonthHead kind="sleep" :month="month" :periods="periods" /></template>
        <!-- 时长在上，中间一枚分期环（和日档、详情页同一种画法），圈中是评分。 -->
        <template #tile="{ tile }">
          <span class="tile-top"><b class="tile-reading">{{ tile.reading }}</b><MoodFace v-if="moodOf(tile.id)" class="tile-mood" :code="moodOf(tile.id)!" :size="20" /></span>
          <span class="tile-ring">
            <StageRing v-if="sessionById.get(tile.id)" :stages="stagesOf(sessionById.get(tile.id)!)" :value="scoreOf(tile.id)" :stroke="4.6"
              :label="scoreOf(tile.id) !== null ? albumText.scoreLabel(scoreOf(tile.id)!) : undefined" />
          </span>
        </template>
      </AlbumGrid>
      <template v-else>
        <!-- 睡前因素放在列表外面：列表左边那根时间轴竖线不穿过它。 -->
        <BedtimeFactors />
      <div data-album-body class="record-list sleep-records">
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
          :fact="`${formatTime(session.start_time)} – ${formatTime(session.end_time)}`"
        >
          <template #aside>
            <SleepNightMark v-bind="nightOf(session)" :axis="axis" :score="session.score" :stages="stagesOf(session)"
              :score-label="scoreOf(session.sleep_id) !== null ? albumText.scoreLabel(scoreOf(session.sleep_id)!) : undefined">
              <!-- 睡前日志钉在横线正中：不占位置，各行横线的起止照样对齐。 -->
              <NightJournalMark v-if="isMainSleep(session)" :date="wakeDay(session)"
                :label="`${formatDate(session.start_time, 'auto')} · ${formatDuration(session.duration_minutes)}`" />
            </SleepNightMark>
          </template>
        </RecordRow>
      </div>
      </template>
    </div>
    <AlbumTray v-if="sessions.length && !error" :zoom="zoom" @zoom="goZoom" />
    <p v-if="staleError" class="stale-note" role="status">{{ staleError }}</p>
    <div v-if="hasMore && !rendering && zoom === 'day'" :ref="sentinelRef" class="load-more">
      <button class="button button-secondary" type="button" :disabled="loadingMore" @click="loadMore">
        {{ loadingMore ? t.loadingMore : t.loadMore }}
      </button>
    </div>
    <p v-if="sessions.length && !rendering && zoom === 'day'" class="footnote">
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
/* 换档时的幽灵板（lib/album/albumMotion.ts）绝对定位在这一层里。 */
.album-stage { position: relative; }
/* 睡前日志的小标记排在那根细线左边。 */
.sleep-records :deep(.record-aside) { align-items: center; gap: 10px; }
/* 左边大字时长 + 入睡–醒来，右边那根细线占这一行的大半。
   行不在屏幕上就不排版不画：几百晚的列表，滚动和退出页面的形变都少画一大片。 */
.sleep-records { --record-main: max-content; --record-aside: minmax(120px, 1fr); }
.sleep-records > :deep(.record-row) { content-visibility: auto; contain-intrinsic-size: auto 52px; }
.sleep-records :deep(.record-card strong) { font-size: var(--fs-lg, 1.15rem); font-variant-numeric: tabular-nums; }
/* 小格：时长不折行（「7 小时 44 分」拆成两行就读不出来了），放不下就缩一号字；中间一枚分期环、圈中评分。 */
.tile-reading { overflow: hidden; color: var(--ink); font-size: clamp(var(--fs-xs), 11cqi, var(--fs-lg, 1.15rem)); font-weight: 700; font-variant-numeric: tabular-nums; text-overflow: ellipsis; white-space: nowrap; }
.tile-top { display: flex; align-items: center; justify-content: space-between; gap: 4px; min-width: 0; }
.tile-mood { margin: -3px -3px -3px 0; }
.tile-ring { display: grid; place-items: center; min-height: 0; grid-row: 2 / span 2; }
.tile-ring :deep(.stage-ring) { width: min(60px, 70cqi); height: auto; aspect-ratio: 1; }
</style>
