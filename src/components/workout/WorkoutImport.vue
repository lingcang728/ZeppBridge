<script setup lang="ts">
/* 从别处导入运动：选来源 → 选文件 → 报告；下面是导入记录，每批可以整批撤销。
   导入的运动只进本机（后端 core::import / storage::imports）。 */
import { onMounted, ref } from 'vue';
import { tauriApi, toUserMessage } from '../../composables/useTauriApi';
import { useSyncController } from '../../composables/useSyncController';
import { useMessages } from '../../i18n';
import { formatDate } from '../../lib/format';
import type { ImportBatch, ImportReport, ImportSourceKey } from '../../types/imports';
import { workoutImportMessages } from './workoutImport.i18n';

const t = useMessages(workoutImportMessages);
const { markDataChanged } = useSyncController();

const SOURCES: { key: ImportSourceKey; extensions: string[]; multiple: boolean }[] = [
  { key: 'gpx', extensions: ['gpx', 'tcx', 'gz'], multiple: true },
  { key: 'fit', extensions: ['fit', 'gz'], multiple: true },
  { key: 'strava', extensions: ['zip'], multiple: false },
  { key: 'apple_health', extensions: ['zip', 'xml'], multiple: false },
];

const batches = ref<ImportBatch[]>([]);
const busy = ref(false);
const note = ref('');
const error = ref('');

const loadBatches = async () => {
  try { batches.value = await tauriApi.importBatches(); } catch (cause) { error.value = toUserMessage(cause, t.value.failed); }
};
onMounted(() => { void loadBatches(); });

const reportText = (report: ImportReport): string => {
  const parts = [report.added ? t.value.added(report.added) : t.value.nothingNew];
  if (report.duplicates) parts.push(t.value.duplicates(report.duplicates));
  if (report.unreadable) parts.push(t.value.unreadable(report.unreadable));
  return parts.join(' · ');
};

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
    busy.value = true; note.value = t.value.reading;
    const report = await tauriApi.importWorkouts(source.key, paths);
    note.value = reportText(report);
    await loadBatches();
    if (report.added) { markDataChanged(); }
  } catch (cause) { note.value = ''; error.value = toUserMessage(cause, t.value.failed); }
  finally { busy.value = false; }
};

const undo = async (batch: ImportBatch) => {
  if (busy.value) return;
  busy.value = true; error.value = ''; note.value = '';
  try {
    note.value = t.value.removed(await tauriApi.undoImportBatch(batch.id));
    await loadBatches();
    markDataChanged();
  } catch (cause) { error.value = toUserMessage(cause, t.value.failed); }
  finally { busy.value = false; }
};

const span = (batch: ImportBatch): string => {
  if (!batch.first_start || !batch.last_start) return '';
  const first = formatDate(batch.first_start);
  const last = formatDate(batch.last_start);
  return first === last ? first : `${first} – ${last}`;
};
</script>

<template>
  <section class="surface-card import-panel" aria-labelledby="workout-import-title">
    <h2 id="workout-import-title" class="import-title">{{ t.title }}</h2>
    <p class="import-hint">{{ t.hint }}</p>
    <div class="import-sources">
      <button v-for="source in SOURCES" :key="source.key" class="button secondary" type="button" :disabled="busy" @click="pick(source)">
        {{ t.sources[source.key] }}
      </button>
    </div>
    <p v-if="note" class="import-note" role="status">{{ note }}</p>
    <p v-if="error" class="import-error" role="alert">{{ error }}</p>
    <template v-if="batches.length">
      <h3 class="import-subtitle">{{ t.batches }}</h3>
      <ul class="import-batches">
        <li v-for="batch in batches" :key="batch.id" :class="{ undone: batch.undone_at }">
          <span class="batch-source">{{ t.short[batch.source] }}</span>
          <span class="batch-name">{{ batch.file_name ?? '' }}</span>
          <span class="batch-meta">
            <template v-if="batch.undone_at">{{ t.undone }}</template>
            <template v-else>{{ t.count(batch.added) }}<template v-if="span(batch)"> · {{ span(batch) }}</template></template>
          </span>
          <button v-if="!batch.undone_at" class="button secondary batch-undo" type="button" :disabled="busy" @click="undo(batch)">{{ t.undo }}</button>
        </li>
      </ul>
    </template>
  </section>
</template>

<style scoped>
.import-panel { display: grid; gap: 10px; margin-block: 4px 12px; padding: 16px 18px; }
.import-title { margin: 0; font-size: var(--fs-md); }
.import-hint, .import-note { margin: 0; color: var(--muted); font-size: var(--fs-sm); }
.import-error { margin: 0; color: var(--danger, var(--warning)); font-size: var(--fs-sm); }
.import-sources { display: flex; flex-wrap: wrap; gap: 8px; }
.import-subtitle { margin: 6px 0 0; font-size: var(--fs-sm); color: var(--muted); font-weight: 600; }
.import-batches { list-style: none; margin: 0; padding: 0; display: grid; gap: 6px; }
.import-batches li { display: flex; flex-wrap: wrap; align-items: center; gap: 4px 10px; min-height: 36px; }
.import-batches li.undone { opacity: 0.55; }
.batch-source { font-weight: 600; }
.batch-name { min-width: 0; overflow-wrap: anywhere; color: var(--muted); font-size: var(--fs-sm); }
.batch-meta { color: var(--muted); font-size: var(--fs-sm); font-variant-numeric: tabular-nums; }
.batch-undo { margin-inline-start: auto; }
.import-sources .button:focus-visible, .batch-undo:focus-visible { outline: 2px solid var(--focus); outline-offset: 3px; }
</style>
