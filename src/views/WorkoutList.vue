<script setup lang="ts">
defineOptions({ name: 'WorkoutList' });
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import { useSectionTour } from '../composables/useTour';
import { useFirstLoad } from '../composables/useFirstLoad';
import WorkoutTools from '../components/WorkoutTools.vue';
import { workoutToolsMessages } from '../components/WorkoutTools.i18n';
import { afterMotion } from '../lib/motion/budget';
import PageHeader from '../components/PageHeader.vue';
import SegmentTrack from '../components/SegmentTrack.vue';
import FoldTransition from '../components/FoldTransition.vue';
import Icon from '../components/Icon.vue';
import RecordRow from '../components/RecordRow.vue';
import { timelineKey } from '../lib/scroll/scrollbar';
import EmptyState from '../components/EmptyState.vue';
import SkeletonBlock from '../components/SkeletonBlock.vue';
import { useRevisionReload } from '../composables/useRevisionReload';
import { tauriApi } from '../composables/useTauriApi';
import { usePagedRecords } from '../composables/usePagedRecords';
import { formatDate, formatDistance, formatDuration, formatTime, isFiniteNumber } from '../lib/format';
import { displayableWorkouts, workoutDisplayLabel, workoutDurationMinutes, workoutIcon } from '../lib/workouts';
import type { Workout } from '../types';
import { defineMessages, useMessages } from '../i18n';
import OfficialOnlyNote from '../components/OfficialOnlyNote.vue';
import WorkoutImport from '../components/workout/WorkoutImport.vue';
import { workoutImportMessages } from '../components/workout/workoutImport.i18n';
import type { ImportSourceKey } from '../types/imports';
import AlbumTray from '../components/album/AlbumTray.vue';
import AlbumGrid from '../components/album/AlbumGrid.vue';
import AlbumMonthHead from '../components/album/AlbumMonthHead.vue';
import RouteGlyph from '../components/album/RouteGlyph.vue';
import GlyphTile from '../components/GlyphTile.vue';
import JournalBody from '../components/journal/JournalBody.vue';
import { useRecordAlbum } from '../composables/useRecordAlbum';
import { useAlbumNav } from '../composables/useAlbumNav';
import { useAnnualRings } from '../composables/useAnnualRings';
import { useLogbook } from '../composables/useLogbook';
import { isAlbumZoom, localDay, type AlbumTile, type AlbumZoom } from '../lib/album/album';

const messages = defineMessages(
  {
    title: '运动',
    loadFailedTitle: '无法读取运动记录',
    loadFailed: '运动列表暂不可用',
    retry: '重试',
    emptyTitle: '没有可展示的运动记录',
    emptyMessage: '同步后，含类型、时间和至少一项有效指标的记录才显示在这里。没有 GPS 或逐点样本时不画空图。',
    avgHr: (bpm: number) => `均心率 ${bpm}`,
    notProvided: '未提供',
    colDistance: '距离',
    colDuration: '时长',
    colHr: '均心率',
    footnote: (count: number) => `${count} 条可展示记录`,
    shown: (loaded: number, total: number) => `已读取 ${loaded} / 共 ${total} 条`,
    loadMore: '加载更多',
    loadingMore: '正在加载…',
  },
  {
    title: 'Workouts',
    loadFailedTitle: 'Could not load workouts',
    loadFailed: 'Workout list unavailable right now',
    retry: 'Retry',
    emptyTitle: 'Nothing to show yet',
    emptyMessage: 'After a sync, only records with a type, a time and at least one real metric appear here. No GPS or per-point samples, no empty chart.',
    avgHr: (bpm: number) => `Avg HR ${bpm}`,
    notProvided: 'Not provided',
    colDistance: 'Distance',
    colDuration: 'Time',
    colHr: 'Avg HR',
    footnote: (count: number) => `${count} records shown`,
    shown: (loaded: number, total: number) => `Loaded ${loaded} of ${total}`,
    loadMore: 'Load more',
    loadingMore: 'Loading…',
  },
  {
    title: 'Entrenamientos',
    loadFailedTitle: 'No se pudieron leer los entrenamientos',
    loadFailed: 'Lista de entrenamientos no disponible ahora',
    retry: 'Reintentar',
    emptyTitle: 'Todavía no hay nada que mostrar',
    emptyMessage: 'Tras sincronizar solo aparecen registros con tipo, hora y al menos una métrica válida. Sin GPS ni muestras por punto, no se dibuja un gráfico vacío.',
    avgHr: (bpm: number) => `FC media ${bpm}`,
    notProvided: 'Sin datos',
    colDistance: 'Distancia',
    colDuration: 'Duración',
    colHr: 'FC media',
    footnote: (count: number) => `${count} registros mostrados`,
    shown: (loaded: number, total: number) => `Cargados ${loaded} de ${total}`,
    loadMore: 'Cargar más',
    loadingMore: 'Cargando…',
  },
  'views/WorkoutList',
);
const t = useMessages(messages);
const tools = useMessages(workoutToolsMessages);
const importText = useMessages(workoutImportMessages);
const importing = ref(false);
/* 导入的运动在摘要行最前面标来源（GPX / Strava / Apple 健康……）；日期那一栏太窄，放不下。 */
const importSources = ref<Record<string, ImportSourceKey>>({});
const loadImportSources = () => tauriApi.workoutImportSources().then((map) => { importSources.value = map; }).catch(() => undefined);
const selecting = ref(false);
/** 想看哪一边（分段胶囊上的值）和列表此刻画的是哪一边：切换时旧列表先压暗、不能点，新的一页读回来那一刻才换。 */
const hiddenView = ref(false);
const shownHidden = ref(false);
const switching = computed(() => hiddenView.value !== shownHidden.value);
const selected = ref(new Set<string>());
const selectedIds = computed(() => [...selected.value]);
const toggleSelecting = () => { selecting.value = !selecting.value; selected.value = new Set(); anchor = -1; };
const switchVisibility = async () => {
  hiddenView.value = !hiddenView.value;
  selected.value = new Set(); anchor = -1;
  const want = hiddenView.value;
  await loadList();
  if (hiddenView.value !== want) return;
  // 换过去的那一边读失败：旧的那一边不能留着可操作（load 失败时会保留旧列表，这里不行）。
  if (staleError.value) { error.value = staleError.value; staleError.value = null; workouts.value = []; total.value = 0; }
};
const view = computed({
  get: () => (hiddenView.value ? 'hidden' : 'visible'),
  set: (value: 'visible' | 'hidden') => { if ((value === 'hidden') !== hiddenView.value) void switchVisibility(); },
});
/* 「已隐藏记录」只在真有隐藏的记录时才出：一条都没有，点过去只是一大块空白。正看着它的时候不收（刚把最后一条恢复了）。 */
const hiddenCount = ref(0);
const loadHiddenCount = () => tauriApi.getHiddenWorkoutPage(1, 0).then((page) => { hiddenCount.value = page.total; }).catch(() => undefined);
const viewItems = computed(() => [
  { value: 'visible' as const, label: tools.value.visible },
  ...(hiddenCount.value > 0 || hiddenView.value ? [{ value: 'hidden' as const, label: tools.value.hidden }] : []),
]);

/* 分页、请求代次和去重见 composables/usePagedRecords.ts。
 *
 * 注意这里有两个数字，不能混：`total` 是库里的**全部**运动记录数，
 * `displayableList.length` 是过滤掉不可展示项之后**这一屏**的条数。所以
 * 「已读取 X / 共 N」用的是取回来的原始条数，「N 条可展示记录」保持原样。
 * 把两者混成一句会让人以为应用丢了记录。 */
const {
  items: workouts, loading, loadingMore, error, staleError, total, hasMore, load: loadList, loadMore, preloaded, sentinelRef,
} = usePagedRecords<Workout>({
  loadPage: (limit, offset) => hiddenView.value ? tauriApi.getHiddenWorkoutPage(limit, offset) : tauriApi.getWorkoutPage(limit, offset),
  idOf: (item) => item.workout_id,
  failedText: () => t.value.loadFailed,
});
const initialLoading = useFirstLoad(loading);
// Recovery must include hidden records with incomplete summaries too. Otherwise
// CLI-hidden or partially synced records can disappear from the restore surface.
const displayableList = computed(() => shownHidden.value ? workouts.value : displayableWorkouts(workouts.value));
// 列表每次换内容都是按此刻要看的那一边读的（切换会推进请求代次，旧的结果会被丢掉），所以同一步里把「画的是哪边」对齐。
watch(workouts, () => { shownHidden.value = hiddenView.value; }, { flush: 'sync' });

/* 选择：整行都能点；按住拖过去连着选（起点那一行原来没选就一路选上，原来选了就一路取消，拖回去会还原）；
   Shift 点一下选上从上次那一行到这一行的整段。拖到窗口上下边缘时列表自己滚。勾选框只留给键盘。 */
const listEl = ref<HTMLElement | null>(null);
let anchor = -1;
let drag: { start: number; mode: boolean; base: Set<string>; last: number; x: number; y: number; frame: number } | null = null;
const idAt = (index: number) => displayableList.value[index]?.workout_id;
const indexAt = (x: number, y: number) => {
  const row = document.elementFromPoint(x, y)?.closest<HTMLElement>('[data-index]');
  return row && listEl.value?.contains(row) ? Number(row.dataset.index) : -1;
};
const paint = (to: number) => {
  if (!drag) return;
  const next = new Set(drag.base);
  const [from, end] = drag.start <= to ? [drag.start, to] : [to, drag.start];
  for (let index = from; index <= end; index += 1) {
    const id = idAt(index);
    if (!id) continue;
    if (drag.mode) next.add(id); else next.delete(id);
  }
  selected.value = next;
  drag.last = to;
};
const EDGE = 64;
const autoScroll = () => {
  if (!drag) return;
  const scroller = document.getElementById('main-content');
  if (scroller) {
    const box = scroller.getBoundingClientRect();
    const over = drag.y < box.top + EDGE ? drag.y - (box.top + EDGE) : drag.y > box.bottom - EDGE ? drag.y - (box.bottom - EDGE) : 0;
    if (over) {
      scroller.scrollTop += Math.max(-18, Math.min(18, over / 3));
      const index = indexAt(drag.x, drag.y);
      if (index >= 0 && index !== drag.last) paint(index);
    }
  }
  drag.frame = requestAnimationFrame(autoScroll);
};
const onDragMove = (event: PointerEvent) => {
  if (!drag) return;
  drag.x = event.clientX; drag.y = event.clientY;
  const index = indexAt(event.clientX, event.clientY);
  if (index >= 0 && index !== drag.last) paint(index);
};
const endDrag = () => {
  if (drag) cancelAnimationFrame(drag.frame);
  drag = null;
  window.removeEventListener('pointermove', onDragMove);
  window.removeEventListener('pointerup', endDrag);
  window.removeEventListener('pointercancel', endDrag);
};
const onRowDown = (event: PointerEvent, index: number) => {
  if (!selecting.value || event.button !== 0) return;
  const id = idAt(index);
  if (!id) return;
  event.preventDefault();
  if (event.shiftKey && anchor >= 0) {
    const next = new Set(selected.value);
    const [from, end] = anchor <= index ? [anchor, index] : [index, anchor];
    for (let i = from; i <= end; i += 1) { const each = idAt(i); if (each) next.add(each); }
    selected.value = next;
    return;
  }
  anchor = index;
  drag = { start: index, mode: !selected.value.has(id), base: new Set(selected.value), last: index, x: event.clientX, y: event.clientY, frame: 0 };
  paint(index);
  window.addEventListener('pointermove', onDragMove);
  window.addEventListener('pointerup', endDrag);
  window.addEventListener('pointercancel', endDrag);
  drag.frame = requestAnimationFrame(autoScroll);
};
const onCheck = (index: number) => {
  const id = idAt(index);
  if (!id) return;
  const next = new Set(selected.value);
  if (next.has(id)) next.delete(id); else next.add(id);
  selected.value = next; anchor = index;
};
const selectLoaded = () => { selected.value = new Set(displayableList.value.map((w) => w.workout_id)); };
const clearSelected = () => { selected.value = new Set(); };
const onChanged = () => { selected.value = new Set(); void loadList(); void loadHiddenCount(); };
onBeforeUnmount(endDrag);

/* 三档缩放（lib/album）：Ctrl + 滚轮 / 捏合和左下托盘走同一个 go()。
   日 = 逐条列表，月 = 按月小格 + 月度组头，年 = 整页履历（JournalBody）。选择中、看已隐藏时一律是日档的列表。 */
const route = useRoute();
const queryZoom = () => (isAlbumZoom(route.query.zoom) ? route.query.zoom : null);
const albumIds = computed(() => displayableList.value.map((w) => w.workout_id));
const album = useRecordAlbum('workouts', albumIds, queryZoom());
const annualRings = useAnnualRings();
const logbook = useLogbook();
const { zoom, periods, shapes } = album;
const albumLocked = computed(() => selecting.value || hiddenView.value);
const shownZoom = computed<AlbumZoom>(() => (albumLocked.value ? 'day' : zoom.value));
const stage = ref<HTMLElement | null>(null);
const ensureMonth = async (month: string) => {
  for (let guard = 0; guard < 40 && hasMore.value; guard += 1) {
    const last = workouts.value[workouts.value.length - 1];
    if (last && (timelineKey(last.start_time) ?? '') <= month) return;
    if (loadingMore.value) await new Promise((resolve) => { window.setTimeout(resolve, 60); });
    else await loadMore();
  }
};
const { go } = useAlbumNav({
  stage, zoom, zoomable: () => !albumLocked.value,
  prepare: async (next: AlbumZoom) => {
    if (next === 'month') await album.loadMonths();
    // 年档（履历）首帧就要有日历和各块：数据挂载后才读的话，新画面先空着、过一会儿才跳出来，换档看着像硬切。
    // 两份都是全应用共享的缓存，读过一次就是现成的；最多等 600ms，读不完也照样换。
    if (next === 'year') await Promise.race([Promise.all([annualRings.data.value ? null : annualRings.load(), logbook.load()]), new Promise((resolve) => { window.setTimeout(resolve, 600); })]);
  },
  ensureDay: (day) => ensureMonth(day.slice(0, 7)),
});
const goZoom = (next: AlbumZoom) => { void go(next); };
/* 履历最上面的全年日历点了某一天：放大回日档、滚到那天。 */
const openDay = (day: string) => { void go('day', { day }); };
/* 从 /journal 旧链接、概览的履历卡、生活事件「管理」进来（?zoom=year）：页面在缓存里时也跟着换档。 */
watch(() => route.query.zoom, () => { const want = queryZoom(); if (want && route.name === 'WorkoutList' && want !== zoom.value) void go(want); });
const workoutById = computed(() => new Map(displayableList.value.map((w) => [w.workout_id, w])));
/* 有轨迹就画：原地没动（外接框不到十来米，室内误开 GPS）后端已经不给轮廓了，这里不再按距离另设门槛
   （以前「不到 1 公里不画」，几百米的真实骑行、步行点进去有轨迹、格子上却没有）。 */
const routeOf = (id: string) => shapes.value.get(id) ?? null;
const TYPE_TONE = { 'outdoor-run': 'var(--activity)', 'outdoor-cycling': 'var(--pace)', 'body-activity': 'var(--calories)' } as const;
const tileReading = (workout: Workout) => {
  const meters = workout.distance_meters;
  if (isFiniteNumber(meters) && meters > 0) return formatDistance(meters);
  const minutes = workoutDurationMinutes(workout);
  return minutes ? formatDuration(minutes) : workoutDisplayLabel(workout);
};
/** 小格底部那枚小胶囊：主读数是距离就写时长，主读数是时长就写均心率或消耗；都没有就写类型名。 */
const tileNote = (workout: Workout) => {
  const meters = workout.distance_meters;
  const minutes = workoutDurationMinutes(workout);
  if (isFiniteNumber(meters) && meters > 0 && minutes) return formatDuration(minutes);
  if (isFiniteNumber(workout.avg_hr)) return t.value.avgHr(Math.round(workout.avg_hr));
  if (isFiniteNumber(workout.calories)) return `${Math.round(workout.calories)} kcal`;
  return workoutDisplayLabel(workout);
};
const toneOf = (workout: Workout) => TYPE_TONE[workoutIcon(workout)];
const tiles = computed<AlbumTile[]>(() => (shownZoom.value !== 'month' ? [] : displayableList.value.map((workout) => {
  const minutes = workoutDurationMinutes(workout) ?? 0;
  const reading = tileReading(workout);
  return {
    id: workout.workout_id,
    day: localDay(workout.start_time),
    month: timelineKey(workout.start_time) ?? '',
    to: { name: 'WorkoutDetail', params: { workoutId: workout.workout_id } },
    label: `${formatDate(workout.start_time, 'auto')} ${formatTime(workout.start_time)} · ${workoutDisplayLabel(workout)} · ${reading}`,
    reading,
    color: TYPE_TONE[workoutIcon(workout)],
    strength: Math.min(1, minutes / 90),
    weight: minutes,
  };
})));
/* 托盘：进了选择模式，把手换成「结束选择」。 */
const trayMode = computed(() => (selecting.value ? { label: tools.value.done, icon: 'circle-check' as const } : null));

/* 一行三栏：距离 · 时长 · 均心率，大数在上、标签在下，每一行同一栏上下对齐，一眼能和同一天的其他几条比。
   没有的那一栏写「—」（不挪位）；没有距离但有消耗时，第一栏换成消耗。导入的记录在标题下写来源（GPX / Strava……）。 */
const rowStats = (workout: Workout) => {
  const meters = workout.distance_meters;
  const minutes = workoutDurationMinutes(workout);
  const first = isFiniteNumber(meters) && meters > 0
    ? { label: t.value.colDistance, value: formatDistance(meters) }
    : isFiniteNumber(workout.calories) ? { label: 'kcal', value: String(Math.round(workout.calories)) } : { label: t.value.colDistance, value: '—' };
  return [
    { key: 'first', ...first },
    { key: 'duration', label: t.value.colDuration, value: minutes ? formatDuration(minutes) : '—' },
    { key: 'hr', label: t.value.colHr, value: isFiniteNumber(workout.avg_hr) ? String(Math.round(workout.avg_hr)) : '—' },
  ];
};
const sourceOf = (workout: Workout) => { const source = importSources.value[workout.workout_id]; return source ? importText.value.short[source] : undefined; };

// 第一帧用的是先前读好的首页：重读等形变放完再做（lib/motion/budget.ts）。
onMounted(() => { void loadImportSources(); afterMotion(() => { void loadHiddenCount(); }); if (preloaded) afterMotion(() => { void loadList(); }); else void loadList(); });
useRevisionReload(() => { void loadList(); void loadImportSources(); void loadHiddenCount(); album.invalidate(); });
/* 新手引导：这个板块第一次打开时就地讲一遍（lib/tour/chapters.ts）。 */
useSectionTour('workouts');
</script>

<template>
  <section class="page list-page" aria-labelledby="workout-list-title">
    <PageHeader title-id="workout-list-title" :title="t.title" />
    <OfficialOnlyNote topic="workouts" />
    <FoldTransition>
      <div v-if="viewItems.length > 1" class="list-bar">
        <SegmentTrack v-model="view" :items="viewItems" :aria-label="t.title" no-wrap />
      </div>
    </FoldTransition>
    <FoldTransition><p v-if="hiddenView" class="footnote hidden-hint">{{ tools.localHint }}</p></FoldTransition>

    <Transition name="list-swap" mode="out-in">
    <div v-if="initialLoading" class="surface-card" aria-live="polite">
      <SkeletonBlock height="56px" />
      <SkeletonBlock height="56px" />
      <SkeletonBlock height="56px" />
    </div>
    <EmptyState v-else-if="error" tone="error" icon="warning" :title="t.loadFailedTitle" :message="error">
      <button class="button button-secondary" type="button" @click="loadList">{{ t.retry }}</button>
    </EmptyState>
    <EmptyState v-else-if="!displayableList.length" :key="`empty-${shownHidden}`" icon="steps" :title="t.emptyTitle" :message="t.emptyMessage" />
    <div v-else ref="stage" :key="`list-${shownHidden}`" class="album-stage">
    <JournalBody v-if="shownZoom === 'year'" data-album-body @day="openDay" />
    <AlbumGrid v-else-if="shownZoom === 'month'" data-album-body kind="workouts" view="month" :tiles="tiles">
      <template #head="{ month }"><AlbumMonthHead kind="workouts" :month="month" :periods="periods" /></template>
      <!-- 每格中间只有一张图：有 GPS 画轨迹，没有就画一枚放大、淡一点的运动类型图形（不再左上角图标 + 轨迹两样叠着）。
           类型靠颜色分（图和底部小胶囊同色），全名在悬停提示和读屏标签里。 -->
      <template #tile="{ tile }">
        <b class="tile-reading">{{ tile.reading }}</b>
        <RouteGlyph v-if="routeOf(tile.id)" class="tile-route" :style="{ color: tile.color }" :shape="routeOf(tile.id)!" />
        <span v-else class="tile-route tile-kind"><GlyphTile :name="workoutIcon(workoutById.get(tile.id)!)" :size="40" plain /></span>
        <span class="tile-note" :style="{ '--tone': tile.color }">{{ tileNote(workoutById.get(tile.id)!) }}</span>
      </template>
    </AlbumGrid>
    <div v-else ref="listEl" data-album-body :class="['record-list', { selecting, 'is-switching': switching }]" :inert="switching || undefined">
      <div v-for="(workout, index) in displayableList" :key="workout.workout_id" :data-index="index" :data-timeline="timelineKey(workout.start_time)"
        data-album-item :data-album-id="workout.workout_id" :data-album-day="localDay(workout.start_time)"
        :class="['selectable-record', { selected: selecting && selected.has(workout.workout_id) }]" @pointerdown="onRowDown($event, index)">
      <input type="checkbox" :inert="!selecting || undefined" :tabindex="selecting ? 0 : -1" :checked="selected.has(workout.workout_id)" :aria-label="`${workoutDisplayLabel(workout)} ${formatDate(workout.start_time, 'auto')} ${formatTime(workout.start_time)}`" @change="onCheck(index)" />
      <RecordRow
        class="workout-record"
        :to="shownHidden || selecting ? undefined : { name: 'WorkoutDetail', params: { workoutId: workout.workout_id } }"
        category="activity"
        :design-icon="workoutIcon(workout)"
        :kicker="formatDate(workout.start_time, 'auto')"
        :time="formatTime(workout.start_time)"
        :title="workoutDisplayLabel(workout)"
        :fact="sourceOf(workout)"
      >
        <template #aside>
          <span class="row-stats">
            <span class="row-stats-grid">
              <span v-for="stat in rowStats(workout)" :key="stat.key" class="row-stat"><b>{{ stat.value }}</b><small>{{ stat.label }}</small></span>
              <RouteGlyph v-if="routeOf(workout.workout_id)" class="row-route" :style="{ color: toneOf(workout) }" :shape="routeOf(workout.workout_id)!" />
              <span v-else class="row-route" />
            </span>
          </span>
        </template>
      </RecordRow>
      </div>
    </div>
    </div>
    </Transition>
    <AlbumTray v-if="displayableList.length && !error" :zoom="shownZoom" :disabled="albumLocked" :mode="trayMode" :sheet="importing"
      @zoom="goZoom" @exit-mode="toggleSelecting" @close-sheet="importing = false">
      <template #actions="{ close }">
        <button class="tray-action" type="button" :aria-label="tools.select" :title="tools.select" @click="close(); toggleSelecting()"><Icon name="circle-check" :size="18" /></button>
        <button class="tray-action" type="button" :aria-label="importText.open" :title="importText.open" :aria-expanded="importing" aria-controls="workout-import"
          @click="importing = true"><Icon name="download" :size="18" /></button>
      </template>
      <!-- 导入从托盘长出来（留毛玻璃），不再塞在页顶：人在月档、年档往下翻着也看得到。 -->
      <template #sheet><WorkoutImport id="workout-import" /></template>
    </AlbumTray>
    <WorkoutTools class="list-tools" :ids="selectedIds" :hidden="shownHidden" :selecting="selecting" @select-all="selectLoaded" @clear="clearSelected" @changed="onChanged" />
    <p v-if="staleError" class="stale-note" role="status">{{ staleError }}</p>
    <div v-if="hasMore && shownZoom === 'day'" :ref="sentinelRef" class="load-more">
      <button class="button button-secondary" type="button" :disabled="loadingMore" @click="loadMore">
        {{ loadingMore ? t.loadingMore : t.loadMore }}
      </button>
    </div>
    <p v-if="displayableList.length && shownZoom === 'day'" class="footnote">
      {{ t.shown(workouts.length, total) }} · {{ t.footnote(displayableList.length) }}
    </p>
  </section>
</template>

<style scoped>
.list-page { width: 100%; }
/* 上面一行只在有已隐藏记录时出：「运动 / 已隐藏」分段胶囊（切过去滑块滑过去，列表交叉淡入）。选择、导入在左下托盘里。 */
.list-bar { display: flex; align-items: center; margin-block: 14px 12px; }
.hidden-hint { margin: 0 0 12px; }

.selectable-record { display: flex; align-items: center; border-radius: var(--radius-md); transition: background 200ms ease; }
.selectable-record > :last-child { flex: 1; min-width: 0; }
/* 勾选框一直在、平时收成 0 宽：进入选择时这一栏长出来，整行往右让一点，串节点的竖线跟着挪（不跳）。
   勾上时打勾的笔画「长」出来；选中的那行整行染一层品牌色并轻轻鼓一下。 */
.selectable-record input { appearance: none; display: grid; place-content: center; box-sizing: border-box; width: 0; height: 24px; margin: 0; flex-shrink: 0;
  border: 0 solid var(--line-control); border-radius: 50%; background: transparent; opacity: 0; scale: .4; pointer-events: none;
  transition: width 260ms var(--ease-out), margin 260ms var(--ease-out), border-width 260ms var(--ease-out), opacity 200ms ease,
    scale 300ms cubic-bezier(.2, 1.5, .4, 1), background 160ms ease, border-color 160ms ease; }
.record-list.selecting .selectable-record input { width: 24px; margin: 0 12px 0 4px; border-width: 2px; opacity: 1; scale: 1; }
.selectable-record input::before { content: ''; width: 6px; height: 11px; margin-top: -3px; border: solid var(--accent-ink); border-width: 0 2.5px 2.5px 0;
  transform: rotate(45deg) scale(0); transition: transform 240ms cubic-bezier(.2, 1.6, .4, 1); }
.selectable-record input:checked { border-color: var(--accent); background: var(--accent); }
.selectable-record input:checked::before { transform: rotate(45deg) scale(1); }
.record-list::before { transition: opacity 180ms ease; }
.record-list.selecting::before { opacity: 0; }
.record-list.selecting { user-select: none; -webkit-user-select: none; }
.record-list.selecting .selectable-record { cursor: pointer; }
.record-list.selecting .selectable-record:hover { background: color-mix(in srgb, var(--ink) 4%, transparent); }
.selectable-record { position: relative; }
/* 几百行一次排版会卡住进页（和睡眠列表一样）：屏幕外的行先不排、不画，滚到才排。多留 8px 不裁掉悬停右移和聚焦框；
   勾选时关掉，连选的那道桥（::before 伸出上沿）要整段画出来。 */
.record-list:not(.selecting) .selectable-record { content-visibility: auto; contain-intrinsic-size: auto 76px; overflow-clip-margin: 8px; }
.record-list.selecting .selectable-record.selected { background: color-mix(in srgb, var(--accent) 12%, transparent); }
/* 刚选上的那一行描一圈品牌色的光，随即褪掉（连成一块后中间不留边线）。 */
.record-list.selecting .selectable-record.selected::after { position: absolute; inset: 0; content: ''; border-radius: inherit; animation: sel-glow 480ms ease-out forwards; pointer-events: none; }
.record-list.selecting .selectable-record.selected + .selectable-record.selected { border-top-left-radius: 0; border-top-right-radius: 0; }
.record-list.selecting .selectable-record.selected:has(+ .selectable-record.selected) { border-bottom-left-radius: 0; border-bottom-right-radius: 0; }
/* 行间 6px 的缝：上一行也选中时往上补一截同色，看起来是一整块。 */
.record-list.selecting .selectable-record.selected + .selectable-record.selected::before { position: absolute; top: -6px; left: 0; right: 0; height: 6px; content: ''; background: color-mix(in srgb, var(--accent) 12%, transparent); pointer-events: none; }
.record-list.selecting .selectable-record { transition: background 200ms ease, border-radius 220ms var(--ease-out); }
@keyframes sel-glow { from { box-shadow: inset 0 0 0 2px color-mix(in srgb, var(--accent) 70%, transparent); } to { box-shadow: inset 0 0 0 2px transparent; } }
.record-list.is-switching { opacity: .45; transition: opacity 160ms ease; }
.list-swap-enter-active { transition: opacity 260ms ease, transform 320ms var(--ease-out); }
.list-swap-leave-active { transition: opacity 120ms ease; }
.list-swap-enter-from { opacity: 0; transform: translateY(8px); }
.list-swap-leave-to { opacity: 0; }
.list-tools { margin-top: 12px; }
/* 换档时的幽灵板（lib/album/albumMotion.ts）绝对定位在这一层里。 */
.album-stage { position: relative; }
/* 日档一行：左边标题（类型名），右边三栏读数 + 轨迹。栏宽固定比例，各行同一栏对齐；窄了收掉轨迹、再窄收掉标签。 */
.workout-record { --record-main: minmax(96px, 0.7fr); --record-aside: minmax(0, 2.3fr); }
/* 标题下没有来源那行小字时，标题和右边三栏一起垂直居中（不顶在上沿）。 */
.workout-record :deep(.record-card) { align-items: center; }
.workout-record :deep(.record-card:not(:has(.record-facts)) > strong) { grid-row: 1 / span 2; }
.row-stats { display: block; width: 100%; min-width: 0; container-type: inline-size; }
.row-stats-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)) 96px; align-items: center; gap: 12px; }
.row-stat { display: grid; gap: 1px; min-width: 0; }
.row-stat b { overflow: hidden; color: var(--ink); font-size: var(--fs-lg, 1.15rem); font-weight: 700; font-variant-numeric: tabular-nums; line-height: 1.2; text-overflow: ellipsis; white-space: nowrap; }
.row-stat small { overflow: hidden; color: var(--muted); font-size: var(--fs-xs); font-weight: 600; text-overflow: ellipsis; white-space: nowrap; }
.row-route { width: 96px; height: 48px; }
@container (max-width: 420px) {
  .row-stats-grid { grid-template-columns: repeat(3, minmax(0, 1fr)); }
  .row-route { display: none; }
}
@container (max-width: 240px) {
  .row-stat small { display: none; }
  .row-stat b { font-size: var(--fs-sm); }
}
/* 月档小格：主读数在左上（和睡眠小格一样），中间轨迹按类型着色，底部一枚同色小胶囊放第二读数。 */
.tile-route { width: 100%; height: 100%; min-height: 0; padding: 6px 4px 4px; box-sizing: border-box; }
.tile-kind { display: grid; place-items: center; opacity: .55; }
.tile-reading { overflow: hidden; color: var(--ink); font-size: clamp(var(--fs-xs), 11cqi, var(--fs-lg, 1.15rem)); font-weight: 700; font-variant-numeric: tabular-nums; text-overflow: ellipsis; white-space: nowrap; }
.tile-note { justify-self: start; max-width: 100%; overflow: hidden; padding: 2px 8px; border-radius: 999px; background: color-mix(in srgb, var(--tone) 16%, transparent); color: var(--tone); font-size: var(--fs-xs); font-weight: 650; font-variant-numeric: tabular-nums; text-overflow: ellipsis; white-space: nowrap; }
@media (prefers-reduced-motion: reduce) {
  .selectable-record input, .selectable-record input::before, .record-list::before { transition: none; }
  .record-list.selecting .selectable-record.selected::after { animation: none; }
  .list-swap-enter-active, .list-swap-leave-active { transition: none; }
}
.selectable-record input:focus-visible { outline: 2px solid var(--focus); outline-offset: 3px; }
.stale-note { margin: 10px 0 0; color: var(--warning, var(--muted)); font-size: var(--fs-sm); }
.load-more { display: flex; justify-content: center; margin-top: 12px; }
.footnote {
  margin: 12px 0 0;
  color: var(--muted);
  font-size: var(--fs-sm);
}
@media (max-width: 420px) {
  .record-list::before { display: none; }
  .record-list { padding-inline: 10px; }
}
</style>
