<script setup lang="ts">
/* 从别处导入运动：选来源 → 选文件 → 报告；下面是导入记录，每批可以整批撤销。
   导入的运动只进本机（后端 core::import / storage::imports）。
   四个来源是四张带图标的小卡（扩展名小字标在下面）；读文件时点的那张卡上走一道光、其余变淡，
   结果提示和新的一批导入记录都是长出来的，不「啪」地出现。 */
import { onMounted, ref } from 'vue';
import Icon, { type IconName } from '../Icon.vue';
import { tauriApi, toUserMessage } from '../../composables/useTauriApi';
import { useSyncController } from '../../composables/useSyncController';
import { useMessages } from '../../i18n';
import { formatDate } from '../../lib/format';
import { importReportText } from '../../lib/importReportText';
import type { ImportBatch, ImportSourceKey } from '../../types/imports';
import { workoutImportMessages } from './workoutImport.i18n';

const t = useMessages(workoutImportMessages);
const { markDataChanged } = useSyncController();

const SOURCES: { key: ImportSourceKey; extensions: string[]; multiple: boolean; icon: IconName }[] = [
  { key: 'gpx', extensions: ['gpx', 'tcx', 'gz'], multiple: true, icon: 'map' },
  { key: 'fit', extensions: ['fit', 'gz'], multiple: true, icon: 'fit' },
  { key: 'strava', extensions: ['zip'], multiple: false, icon: 'run' },
  { key: 'apple_health', extensions: ['zip', 'xml'], multiple: false, icon: 'heart' },
];
/** 卡上那行小字：压缩包（.gz）是附带支持，不单列。 */
const extensionsOf = (source: (typeof SOURCES)[number]) => source.extensions.filter((ext) => ext !== 'gz').map((ext) => `.${ext}`).join(' ');

const batches = ref<ImportBatch[]>([]);
const busy = ref(false);
/** 正在读的那一个来源（卡上走光）。 */
const reading = ref<ImportSourceKey | null>(null);
const note = ref('');
const error = ref('');

const loadBatches = async () => {
  try { batches.value = await tauriApi.importBatches(); } catch (cause) { error.value = toUserMessage(cause, t.value.failed); }
};
onMounted(() => { void loadBatches(); });

const pick = async (source: (typeof SOURCES)[number]) => {
  if (busy.value) return;
  error.value = ''; note.value = '';
  try {
    const { open } = await import('@tauri-apps/plugin-dialog');
    const chosen = await open({
      multiple: source.multiple,
      directory: false,
      filters: [{ name: t.value.filter[source.key], extensions: source.extensions }],
    });
    const paths = chosen == null ? [] : Array.isArray(chosen) ? chosen : [chosen];
    if (!paths.length) return;
    busy.value = true; reading.value = source.key; note.value = t.value.reading;
    const report = await tauriApi.importWorkouts(source.key, paths);
    note.value = importReportText(report, t.value);
    await loadBatches();
    if (report.added || report.health_added) { markDataChanged(); }
  } catch (cause) { note.value = ''; error.value = toUserMessage(cause, t.value.failed); }
  finally { busy.value = false; reading.value = null; }
};

const undo = async (batch: ImportBatch) => {
  if (busy.value) return;
  busy.value = true; error.value = ''; note.value = '';
  try {
    const removed = await tauriApi.undoImportBatch(batch.id);
    // 只有健康数据的一批（unstrap）没有运动可数，只说撤销了。
    note.value = removed || !batch.health_added ? t.value.removed(removed) : t.value.undone;
    await loadBatches();
    markDataChanged();
  } catch (cause) { error.value = toUserMessage(cause, t.value.failed); }
  finally { busy.value = false; }
};

const span = (batch: ImportBatch): string => {
  if (!batch.first_start || !batch.last_start) return '';
  const first = formatDate(batch.first_start, 'auto');
  const last = formatDate(batch.last_start, 'auto');
  return first === last ? first : `${first} – ${last}`;
};
</script>

<template>
  <section class="surface-card import-panel" aria-labelledby="workout-import-title">
    <h2 id="workout-import-title" class="import-title">{{ t.title }}</h2>
    <p class="import-hint">{{ t.hint }}</p>
    <div class="import-sources">
      <button v-for="source in SOURCES" :key="source.key" :class="['import-source', { 'is-reading': reading === source.key }]" type="button"
        :disabled="busy" :aria-busy="reading === source.key" @click="pick(source)">
        <span class="source-glyph" aria-hidden="true"><Icon :name="source.icon" :size="18" /></span>
        <span class="source-text"><b>{{ t.sources[source.key] }}</b><small>{{ extensionsOf(source) }}</small></span>
      </button>
    </div>
    <Transition name="import-note" mode="out-in">
      <p v-if="error" key="error" class="import-error" role="alert">{{ error }}</p>
      <p v-else-if="note" :key="note" :class="['import-note', { 'is-busy': busy }]" role="status">{{ note }}</p>
    </Transition>
    <template v-if="batches.length">
      <h3 class="import-subtitle">{{ t.batches }}</h3>
      <TransitionGroup tag="ul" name="import-batch" class="import-batches">
        <li v-for="batch in batches" :key="batch.id" :class="{ undone: batch.undone_at }">
          <span class="batch-source">{{ t.short[batch.source] }}</span>
          <span class="batch-name">{{ batch.file_name ?? '' }}</span>
          <span class="batch-meta">
            <template v-if="batch.undone_at">{{ t.undone }}</template>
            <template v-else>{{ t.count(batch.added) }}<template v-if="batch.health_added"> · {{ t.healthCount(batch.health_added) }}</template><template v-if="span(batch)"> · {{ span(batch) }}</template></template>
          </span>
          <button v-if="!batch.undone_at" class="pill-button quiet batch-undo" type="button" :disabled="busy" @click="undo(batch)"><Icon name="undo" :size="14" />{{ t.undo }}</button>
        </li>
      </TransitionGroup>
    </template>
  </section>
</template>

<style scoped>
.import-panel { display: grid; gap: 12px; margin-block: 0 12px; padding: 18px 20px; }
.import-title { margin: 0; font-size: var(--fs-md); }
.import-hint { margin: -6px 0 0; color: var(--muted); font-size: var(--fs-sm); }
/* 卡宽跟着名字走（长名字的语言不截断），一行放不下就换行，每张至少一枚图标加名字那么宽。 */
.import-sources { display: flex; flex-wrap: wrap; gap: 10px; }
/* 来源卡：和胶囊按钮同一种凸起材质，左边一枚品牌色图标。 */
.import-source { position: relative; display: flex; flex: 1 1 auto; max-width: 100%; align-items: center; gap: 12px; min-width: 0; padding: 12px 14px; overflow: hidden;
  border: 0; border-radius: var(--radius-md); background: var(--cap-thumb); box-shadow: var(--cap-thumb-rim); color: var(--ink); font: inherit; text-align: left; cursor: pointer;
  transition: scale var(--dur-fast) var(--ease-out), filter var(--dur-fast) ease, opacity var(--dur-base) ease; }
.import-source:hover:not(:disabled) { filter: brightness(1.1); }
.import-source:active:not(:disabled) { scale: .97; }
.import-source:disabled { cursor: default; }
.import-source:disabled:not(.is-reading) { opacity: .45; }
.import-source:focus-visible { outline: 2px solid var(--focus); outline-offset: 3px; }
.source-glyph { display: grid; flex: none; place-items: center; width: 34px; height: 34px; border-radius: 10px;
  background: color-mix(in srgb, var(--accent) 18%, transparent); color: var(--accent); }
.source-text { display: grid; gap: 1px; min-width: 0; }
.source-text b { font-size: var(--fs-sm); font-weight: 650; overflow-wrap: anywhere; }
.source-text small { color: var(--subtle); font-family: var(--font-mono); font-size: var(--fs-2xs); white-space: nowrap; }
/* 正在读：卡上横着扫过一道光（只动 transform），图标轻轻呼吸。 */
.import-source.is-reading::after { content: ''; position: absolute; inset: 0; pointer-events: none;
  background: linear-gradient(100deg, transparent 30%, color-mix(in srgb, var(--accent) 26%, transparent) 50%, transparent 70%);
  transform: translateX(-100%); animation: source-sweep 1.2s ease-in-out infinite; }
.import-source.is-reading .source-glyph { animation: source-breathe 1.2s ease-in-out infinite; }
@keyframes source-sweep { to { transform: translateX(100%); } }
@keyframes source-breathe { 50% { scale: .88; } }
.import-note, .import-error { justify-self: start; margin: 0; padding: 6px 12px; border-radius: 999px; font-size: var(--fs-sm); }
.import-note { background: color-mix(in srgb, var(--accent) 12%, transparent); color: var(--ink); }
.import-note.is-busy { background: color-mix(in srgb, var(--ink) 6%, transparent); color: var(--muted); }
.import-error { background: color-mix(in srgb, var(--danger, var(--warning)) 14%, transparent); color: var(--danger, var(--warning)); }
.import-note-enter-active { transition: opacity 220ms ease, transform 320ms cubic-bezier(.2, 1.3, .4, 1); }
.import-note-leave-active { transition: opacity 140ms ease, transform 140ms ease-in; }
.import-note-enter-from { opacity: 0; transform: translateY(6px) scale(.96); }
.import-note-leave-to { opacity: 0; transform: translateY(-4px); }
.import-subtitle { margin: 4px 0 0; font-size: var(--fs-sm); color: var(--muted); font-weight: 600; }
.import-batches { position: relative; list-style: none; margin: 0; padding: 0; display: grid; gap: 6px; }
.import-batches li { display: flex; flex-wrap: wrap; align-items: center; gap: 4px 10px; min-height: 40px; padding: 4px 6px 4px 14px;
  border-radius: var(--radius-md); background: color-mix(in srgb, var(--ink) 4%, transparent); transition: opacity var(--dur-base) ease; }
.import-batches li.undone { opacity: 0.55; }
.batch-source { font-weight: 650; }
.batch-name { min-width: 0; overflow-wrap: anywhere; color: var(--muted); font-size: var(--fs-sm); }
.batch-meta { color: var(--muted); font-size: var(--fs-sm); font-variant-numeric: tabular-nums; }
.batch-undo { margin-inline-start: auto; }
.batch-undo:focus-visible { outline: 2px solid var(--focus); outline-offset: 3px; }
.import-batch-enter-active { transition: opacity 260ms ease, transform 360ms cubic-bezier(.2, 1.3, .4, 1); }
.import-batch-enter-from { opacity: 0; transform: translateY(-8px) scale(.98); }
.import-batch-move { transition: transform 320ms var(--ease-out); }
@media (prefers-reduced-motion: reduce) {
  .import-source.is-reading::after, .import-source.is-reading .source-glyph { animation: none; }
  .import-note-enter-active, .import-note-leave-active, .import-batch-enter-active, .import-batch-move { transition: none; }
}
</style>
