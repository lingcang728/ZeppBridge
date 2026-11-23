<script setup lang="ts">
defineOptions({ name: 'WorkoutList' });
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
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

const messages = defineMessages(
  {
    title: '运动',
    intro: '本机已同步的运动记录。没有轨迹时不画地图。',
    loadFailedTitle: '无法读取运动记录',
    loadFailed: '运动列表暂不可用',
    retry: '重试',
    emptyTitle: '没有可展示的运动记录',
    emptyMessage: '同步后，含类型、时间和至少一项有效指标的记录才显示在这里。没有 GPS 或逐点样本时不画空图。',
    avgHr: (bpm: number) => `均心率 ${bpm}`,
    notProvided: '未提供',
    footnote: (count: number) => `${count} 条可展示记录`,
    shown: (loaded: number, total: number) => `已读取 ${loaded} / 共 ${total} 条`,
    loadMore: '加载更多',
    loadingMore: '正在加载…',
  },
  {
    title: 'Workouts',
    intro: 'Workouts synced to this machine. No track, no map.',
    loadFailedTitle: 'Could not load workouts',
    loadFailed: 'Workout list unavailable right now',
    retry: 'Retry',
    emptyTitle: 'Nothing to show yet',
    emptyMessage: 'After a sync, only records with a type, a time and at least one real metric appear here. No GPS or per-point samples, no empty chart.',
    avgHr: (bpm: number) => `Avg HR ${bpm}`,
    notProvided: 'Not provided',
    footnote: (count: number) => `${count} records shown`,
    shown: (loaded: number, total: number) => `Loaded ${loaded} of ${total}`,
    loadMore: 'Load more',
    loadingMore: 'Loading…',
  },
  {
    title: 'Entrenamientos',
    intro: 'Entrenamientos sincronizados en este equipo. Sin recorrido, no hay mapa.',
    loadFailedTitle: 'No se pudieron leer los entrenamientos',
    loadFailed: 'Lista de entrenamientos no disponible ahora',
    retry: 'Reintentar',
    emptyTitle: 'Todavía no hay nada que mostrar',
    emptyMessage: 'Tras sincronizar solo aparecen registros con tipo, hora y al menos una métrica válida. Sin GPS ni muestras por punto, no se dibuja un gráfico vacío.',
    avgHr: (bpm: number) => `FC media ${bpm}`,
    notProvided: 'Sin datos',
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
const viewItems = computed(() => [
  { value: 'visible' as const, label: tools.value.visible },
  { value: 'hidden' as const, label: tools.value.hidden },
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
const onChanged = () => { selected.value = new Set(); void loadList(); };
onBeforeUnmount(endDrag);

/* 一行要能和同一天的其他几条区分开：时长、均心率，再加距离或消耗。
   只列有值的项，一项都没有才写「未提供」。 */
const workoutFact = (workout: Workout): string => {
  const parts: string[] = [];
  const source = importSources.value[workout.workout_id];
  if (source) parts.push(importText.value.short[source]);
  const minutes = workoutDurationMinutes(workout);
  if (minutes) parts.push(formatDuration(minutes));
  if (isFiniteNumber(workout.avg_hr)) parts.push(t.value.avgHr(Math.round(workout.avg_hr)));
  const meters = workout.distance_meters;
  if (isFiniteNumber(meters) && meters > 0) parts.push(formatDistance(meters));
  else if (isFiniteNumber(workout.calories)) parts.push(`${Math.round(workout.calories)} kcal`);
  return parts.length > (source ? 1 : 0) ? parts.join(' · ') : [...parts, t.value.notProvided].join(' · ');
};

// 第一帧用的是先前读好的首页：重读等形变放完再做（lib/motion/budget.ts）。
onMounted(() => { void loadImportSources(); if (preloaded) afterMotion(() => { void loadList(); }); else void loadList(); });
useRevisionReload(() => { void loadList(); void loadImportSources(); });
/* 新手引导：这个板块第一次打开时就地讲一遍（lib/tour/chapters.ts）。 */
useSectionTour('workouts');
</script>

<template>
  <section class="page list-page" aria-labelledby="workout-list-title">
    <PageHeader title-id="workout-list-title" :title="t.title" :intro="t.intro" />
    <OfficialOnlyNote topic="workouts" />
    <div class="list-bar">
      <SegmentTrack v-model="view" :items="viewItems" :aria-label="t.title" no-wrap />
      <div class="list-bar-actions">
        <button :class="['pill-button', { 'is-on': selecting }]" type="button" :aria-pressed="selecting" @click="toggleSelecting">
          <Icon name="circle-check" :size="15" />{{ selecting ? tools.done : tools.select }}
        </button>
        <button :class="['pill-button', { 'is-on': importing }]" type="button" :aria-expanded="importing" aria-controls="workout-import" @click="importing = !importing">
          <Icon name="download" :size="15" />{{ importing ? importText.close : importText.open }}
        </button>
      </div>
    </div>
    <FoldTransition><WorkoutImport v-if="importing" id="workout-import" /></FoldTransition>
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
    <div v-else ref="listEl" :key="`list-${shownHidden}`" :class="['record-list', { selecting, 'is-switching': switching }]" :inert="switching || undefined">
      <div v-for="(workout, index) in displayableList" :key="workout.workout_id" :data-index="index" :data-timeline="timelineKey(workout.start_time)"
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
        :fact="workoutFact(workout)"
      />
      </div>
    </div>
    </Transition>
    <WorkoutTools class="list-tools" :ids="selectedIds" :hidden="shownHidden" :selecting="selecting" @select-all="selectLoaded" @clear="clearSelected" @changed="onChanged" />
    <p v-if="staleError" class="stale-note" role="status">{{ staleError }}</p>
    <div v-if="hasMore" :ref="sentinelRef" class="load-more">
      <button class="button button-secondary" type="button" :disabled="loadingMore" @click="loadMore">
        {{ loadingMore ? t.loadingMore : t.loadMore }}
      </button>
    </div>
    <p v-if="displayableList.length" class="footnote">
      {{ t.shown(workouts.length, total) }} · {{ t.footnote(displayableList.length) }}
    </p>
  </section>
</template>

<style scoped>
.list-page { width: 100%; }
/* 上面一行：左边「运动 / 已隐藏」分段胶囊（切过去滑块滑过去，列表交叉淡入），右边两枚胶囊按钮。 */
.list-bar { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 10px 12px; margin-block: 14px 12px; }
.list-bar-actions { display: flex; flex-wrap: wrap; gap: 8px; }
.list-bar .pill-button { font-size: var(--fs-sm); transition: scale var(--dur-fast) var(--ease-out), filter var(--dur-fast) ease, background var(--dur-base) ease; }
.list-bar .pill-button.is-on { background: color-mix(in srgb, var(--accent) 16%, var(--cap-thumb)); box-shadow: var(--cap-thumb-rim), inset 0 0 0 1px color-mix(in srgb, var(--accent) 55%, transparent); color: var(--accent); }
.list-bar .pill-button:focus-visible { outline: 2px solid var(--focus); outline-offset: 3px; }
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
.record-list::before { transition: translate 260ms var(--ease-out); }
.record-list.selecting::before { translate: 40px 0; }
.record-list.selecting { user-select: none; -webkit-user-select: none; }
.record-list.selecting .selectable-record { cursor: pointer; }
.record-list.selecting .selectable-record:hover { background: color-mix(in srgb, var(--ink) 4%, transparent); }
.record-list.selecting .selectable-record.selected { background: color-mix(in srgb, var(--accent) 12%, transparent); animation: row-pop 300ms cubic-bezier(.2, 1.4, .4, 1); }
@keyframes row-pop { 40% { transform: scale(1.008); } }
.record-list.is-switching { opacity: .45; transition: opacity 160ms ease; }
.list-swap-enter-active { transition: opacity 260ms ease, transform 320ms var(--ease-out); }
.list-swap-leave-active { transition: opacity 120ms ease; }
.list-swap-enter-from { opacity: 0; transform: translateY(8px); }
.list-swap-leave-to { opacity: 0; }
.list-tools { margin-top: 12px; }
@media (prefers-reduced-motion: reduce) {
  .selectable-record input, .selectable-record input::before, .record-list::before { transition: none; }
  .record-list.selecting .selectable-record.selected { animation: none; }
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
