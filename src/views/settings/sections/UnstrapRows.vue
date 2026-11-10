<script setup lang="ts">
/* Beta 实验室里的 unstrap（Helio Strap 的开源伴侣应用）两行：
   导入它的备份 zip 里的运动（计划 C2 一期，走和「从别处导入」同一条路，导入记录在运动页能整批撤销）；
   把本机的运动导出成它的备份格式（C3）。 */
import { computed, ref } from 'vue';
import SegmentTrack from '../../../components/SegmentTrack.vue';
import { tauriApi, toUserMessage } from '../../../composables/useTauriApi';
import { useSyncController } from '../../../composables/useSyncController';
import { useMessages } from '../../../i18n';
import { workoutImportMessages } from '../../../components/workout/workoutImport.i18n';
import { importReportText } from '../../../lib/importReportText';
import { labsMessages } from './labs.i18n';

const t = useMessages(labsMessages);
const w = useMessages(workoutImportMessages);
const { markDataChanged } = useSyncController();

const busy = ref(false);
const note = ref('');
const error = ref('');

const importBackup = async () => {
  if (busy.value) return;
  error.value = ''; note.value = '';
  try {
    const { open } = await import('@tauri-apps/plugin-dialog');
    const chosen = await open({ multiple: false, directory: false, filters: [{ name: w.value.filter.unstrap, extensions: ['zip'] }] });
    const path = Array.isArray(chosen) ? chosen[0] : chosen;
    if (!path) return;
    busy.value = true; note.value = w.value.reading;
    const report = await tauriApi.importWorkouts('unstrap', [path]);
    note.value = importReportText(report, w.value);
    if (report.added || report.health_added) markDataChanged();
  } catch (cause) { note.value = ''; error.value = toUserMessage(cause, w.value.failed); }
  finally { busy.value = false; }
};

/* 导出：范围用天数，0 表示全部。 */
const RANGES = [30, 90, 365, 0] as const;
const range = ref<number>(90);
const rangeItems = computed(() => RANGES.map((days) => ({
  value: days,
  label: days ? t.value.unstrapRangeDays(days) : t.value.unstrapRangeAll,
})));
const exported = ref<{ path: string; workouts: number } | null>(null);
const exportError = ref('');

const exportForUnstrap = async () => {
  if (busy.value) return;
  busy.value = true; exportError.value = ''; exported.value = null;
  try {
    const result = await tauriApi.exportForUnstrap(range.value || null);
    exported.value = { path: result.path, workouts: result.workouts };
  } catch (cause) { exportError.value = toUserMessage(cause, w.value.failed); }
  finally { busy.value = false; }
};

const showExport = async () => {
  if (!exported.value) return;
  const { revealItemInDir } = await import('@tauri-apps/plugin-opener');
  await revealItemInDir(exported.value.path).catch(() => undefined);
};
</script>

<template>
  <div class="s-row">
    <div class="s-row-main">
      <span class="s-row-title">{{ t.unstrapImportTitle }} <span class="lab-badge">{{ t.badge }}</span></span>
      <span class="s-row-sub">{{ t.unstrapImportSub }}</span>
      <span v-if="note" class="s-row-sub unstrap-note" role="status">{{ note }}</span>
      <span v-if="error" class="api-error" role="alert">{{ error }}</span>
    </div>
    <div class="s-row-control">
      <button class="button secondary" type="button" data-setting="labs-unstrap-import" :disabled="busy" @click="importBackup">{{ t.unstrapImportButton }}</button>
    </div>
  </div>
  <div class="s-row">
    <div class="s-row-main">
      <span class="s-row-title">{{ t.unstrapExportTitle }} <span class="lab-badge">{{ t.badge }}</span></span>
      <span class="s-row-sub">{{ t.unstrapExportSub }}</span>
      <span v-if="exported" class="s-row-sub unstrap-note" role="status">
        {{ t.unstrapExported(exported.workouts) }}
        <button class="why-link" type="button" @click="showExport">{{ t.unstrapShow }}</button>
      </span>
      <span v-if="exportError" class="api-error" role="alert">{{ exportError }}</span>
    </div>
    <div class="s-row-control unstrap-export">
      <SegmentTrack compact :items="rangeItems" :model-value="range" :aria-label="t.unstrapRange" :disabled="busy"
        @update:model-value="(value: string | number) => { range = Number(value); }" />
      <button class="button secondary" type="button" data-setting="labs-unstrap-export" :disabled="busy" @click="exportForUnstrap">{{ t.unstrapExportButton }}</button>
    </div>
  </div>
</template>

<style scoped src="../settings-local.css"></style>
<style scoped src="./labs.css"></style>
<style scoped>
.unstrap-note { color: var(--accent); }
.unstrap-note .why-link { margin-inline-start: 6px; font-size: inherit; }
.unstrap-export { display: flex; flex-wrap: wrap; align-items: center; justify-content: flex-end; gap: 8px; }
</style>
