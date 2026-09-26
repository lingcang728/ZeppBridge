<script setup lang="ts">
import { ref } from 'vue';
import { RouterLink } from 'vue-router';
import BackupPanel from '../../../components/BackupPanel.vue';
import Icon from '../../../components/Icon.vue';
import LocalApiPanel from './LocalApiPanel.vue';
import { useSettingsContext } from '../../../composables/settings/context';
import { useSettingsFormat } from '../../../composables/settings/useSettingsFormat';
import { useSyncController } from '../../../composables/useSyncController';
import { backend, toUserMessage } from '../../../lib/bridge';
import { useMessages } from '../../../i18n';
import { settingsMessages } from '../../Settings.i18n';

const t = useMessages(settingsMessages);
const { appStatus } = useSyncController();
const { formatDateTime } = useSettingsFormat();
const { feedback, auth, prefs } = useSettingsContext();
const { clearAuth } = auth;
const { retentionDays, historyDays, storageEstimate } = prefs;

const compactBusy = ref(false);
const compactMessage = ref<string | null>(null);
const compactError = ref<string | null>(null);

const formatBytes = (bytes: number): string => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1048576).toFixed(1)} MB`;
  return `${(bytes / 1073741824).toFixed(2)} GB`;
};

const runCompactPayloads = async () => {
  compactBusy.value = true;
  compactError.value = null;
  compactMessage.value = null;
  try {
    const result = await backend.compactRawPayloads();
    if (!result.compacted && !result.skipped) {
      compactMessage.value = t.value.nothingToCompact;
    } else {
      const saved = result.bytesBefore - result.bytesAfter;
      const skipped = result.skipped ? t.value.compactSkipped(result.skipped) : '';
      compactMessage.value = t.value.compactDone(
        result.compacted,
        formatBytes(result.bytesBefore),
        formatBytes(result.bytesAfter),
        formatBytes(saved),
        skipped,
      );
    }
    try {
      storageEstimate.value = await backend.getStorageEstimate(historyDays.value);
    } catch {
      // 估算刷新失败不影响压缩本身已经完成的事实
    }
  } catch (error) {
    compactError.value = toUserMessage(error, t.value.compactFailed);
  } finally {
    compactBusy.value = false;
  }
};

const openDataFolder = async () => {
  try { await backend.openDataFolder(); }
  catch (error) { feedback.dataError.value = toUserMessage(error, t.value.openFolderFailed); }
};
</script>

<template>
  <details class="advanced settings-card">
    <summary>
      <span>
        <strong>{{ t.advancedTitle }}</strong>
        <em>{{ t.advancedSub }}</em>
      </span>
      <Icon name="chevron-down" :size="16" />
    </summary>
    <div class="advanced-content">
      <div class="advanced-block">
        <p class="advanced-label">{{ t.dataAuthLabel }}</p>
        <p class="section-description">{{ t.dataAuthNote(retentionDays) }}</p>
        <div class="inline-actions">
          <button class="button secondary" type="button" @click="openDataFolder"><Icon name="folder" :size="15" />{{ t.openDataFolder }}</button>
          <button class="button danger-button" type="button" @click="clearAuth">{{ t.logout }}</button>
        </div>
      </div>
      <div class="advanced-block">
        <p class="advanced-label">{{ t.healthCheckLabel }}</p>
        <p class="section-description">{{ t.healthCheckNote }}</p>
        <div class="inline-actions">
          <RouterLink class="button secondary" to="/health-check"><Icon name="database" :size="15" />{{ t.healthCheckOpen }}</RouterLink>
        </div>
      </div>
      <div class="advanced-block">
        <p class="advanced-label">{{ t.compactLabel }}</p>
        <p class="section-description">
          {{ t.compactNoteA }}
          <strong>{{ t.compactNoteStrong }}</strong>{{ t.compactNoteB }}
        </p>
        <div class="inline-actions">
          <button class="button secondary" type="button" :disabled="compactBusy" @click="runCompactPayloads">
            {{ compactBusy ? t.compacting : t.compactRun }}
          </button>
        </div>
        <p v-if="compactError" class="api-error" role="alert">{{ compactError }}</p>
        <p v-else-if="compactMessage" class="hint-line ok" role="status">{{ compactMessage }}</p>
      </div>
      <div class="advanced-block">
        <p class="advanced-label">{{ t.backupLabel }}</p>
        <p class="section-description">{{ t.backupNote }}</p>
        <BackupPanel />
      </div>
      <div class="advanced-block">
        <p class="advanced-label">{{ t.localApiLabel }}</p>
        <p class="section-description">{{ t.localApiNote }}</p>
        <LocalApiPanel />
      </div>
      <details class="diag-fold">
        <summary>{{ t.syncDiagnostics }}</summary>
        <div class="stream-list">
          <div v-for="stream in appStatus?.streams" :key="stream.stream" class="stream-row">
            <strong>{{ stream.stream }}</strong>
            <span>{{ stream.status }}</span>
            <span>{{ formatDateTime(stream.last_cloud_sync_at) }}</span>
          </div>
          <p v-if="!appStatus?.streams?.length" class="section-description">{{ t.noSyncDiagnostics }}</p>
        </div>
      </details>
    </div>
  </details>
</template>

<style scoped src="../settings-base.css"></style>
<style scoped>
.advanced > summary { display: flex; align-items: center; justify-content: space-between; gap: 12px; cursor: pointer; list-style: none; }
.advanced > summary::-webkit-details-marker { display: none; }
.advanced > summary span { display: grid; gap: 2px; min-width: 0; }
.advanced > summary strong { font-size: var(--fs-lg); font-weight: 700; color: var(--ink); }
.advanced > summary em { color: var(--muted); font-size: var(--fs-sm); font-style: normal; }
.advanced[open] > summary > svg { transform: rotate(180deg); }
.advanced-content { display: grid; gap: 16px; margin-top: 12px; border-top: 1px solid var(--line); padding-top: 12px; }
.advanced-block { display: grid; gap: 6px; }
.advanced-label { margin: 0; color: var(--ink); font-size: var(--fs-md); font-weight: 600; }
.diag-fold { border-top: 1px solid var(--line); padding-top: 8px; }
.diag-fold > summary { cursor: pointer; color: var(--muted); font-size: var(--fs-sm); list-style: none; }
.diag-fold > summary::-webkit-details-marker { display: none; }
.diag-fold[open] > summary { color: var(--ink); }

.stream-list { display: grid; gap: 2px; margin-top: 6px; }
.stream-row { display: grid; grid-template-columns: 110px minmax(0, 1fr) auto; gap: 12px; padding: 7px 0; border-bottom: 1px solid var(--line); color: var(--muted); font-size: var(--fs-sm); }
.stream-row strong { font-weight: 600; color: var(--ink); }
</style>
