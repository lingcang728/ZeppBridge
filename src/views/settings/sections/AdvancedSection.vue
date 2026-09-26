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
  <div class="advanced">
    <section class="s-section">
      <div class="s-section-head"><h3>{{ t.dataAuthLabel }}</h3></div>
      <div class="s-list">
        <div class="s-row">
          <div class="s-row-main"><span class="s-row-sub">{{ t.dataAuthNote(retentionDays) }}</span></div>
          <div class="s-row-control">
            <button class="button secondary" type="button" @click="openDataFolder"><Icon name="folder" :size="15" />{{ t.openDataFolder }}</button>
            <button class="button danger-button" type="button" @click="clearAuth">{{ t.logout }}</button>
          </div>
        </div>
      </div>
    </section>

    <section class="s-section">
      <div class="s-section-head"><h3>{{ t.healthCheckLabel }}</h3></div>
      <div class="s-list">
        <div class="s-row">
          <div class="s-row-main"><span class="s-row-sub">{{ t.healthCheckNote }}</span></div>
          <div class="s-row-control">
            <RouterLink class="button secondary" to="/health-check"><Icon name="database" :size="15" />{{ t.healthCheckOpen }}</RouterLink>
          </div>
        </div>
      </div>
    </section>

    <section class="s-section">
      <div class="s-section-head"><h3>{{ t.compactLabel }}</h3></div>
      <div class="s-list">
        <div class="s-row">
          <div class="s-row-main">
            <span class="s-row-sub">{{ t.compactNoteA }}<strong>{{ t.compactNoteStrong }}</strong>{{ t.compactNoteB }}</span>
          </div>
          <div class="s-row-control">
            <button class="button secondary" type="button" :disabled="compactBusy" @click="runCompactPayloads">
              {{ compactBusy ? t.compacting : t.compactRun }}
            </button>
          </div>
        </div>
      </div>
      <p v-if="compactError" class="api-error" role="alert">{{ compactError }}</p>
      <p v-else-if="compactMessage" class="hint-line ok" role="status">{{ compactMessage }}</p>
    </section>

    <section class="s-section">
      <div class="s-section-head"><h3>{{ t.backupLabel }}</h3></div>
      <BackupPanel />
    </section>

    <section class="s-section">
      <div class="s-section-head"><h3>{{ t.localApiLabel }}</h3></div>
      <p class="s-note">{{ t.localApiNote }}</p>
      <LocalApiPanel />
    </section>

    <details class="s-list diag-fold">
      <summary class="s-row">
        <span class="s-row-main"><span class="s-row-title">{{ t.syncDiagnostics }}</span></span>
        <Icon name="chevron-down" :size="16" class="fold-caret" />
      </summary>
      <div v-for="stream in appStatus?.streams" :key="stream.stream" class="s-row stream-row">
        <strong>{{ stream.stream }}</strong>
        <span>{{ stream.status }}</span>
        <span>{{ formatDateTime(stream.last_cloud_sync_at) }}</span>
      </div>
      <div v-if="!appStatus?.streams?.length" class="s-row"><span class="s-row-sub">{{ t.noSyncDiagnostics }}</span></div>
    </details>
  </div>
</template>

<style scoped src="../settings-base.css"></style>
<style scoped>
.advanced { display: grid; gap: 22px; min-width: 0; }
.advanced > .s-section + .s-section { margin-top: 0; }
.diag-fold > summary { cursor: pointer; list-style: none; }
.diag-fold > summary::-webkit-details-marker { display: none; }
.fold-caret { color: var(--subtle); transition: transform var(--dur-base) var(--ease-out); }
.diag-fold[open] .fold-caret { transform: rotate(180deg); }
.stream-row { display: grid; grid-template-columns: 140px minmax(0, 1fr) auto; min-height: 44px; color: var(--muted); font-size: var(--fs-sm); }
.stream-row strong { font-weight: 600; color: var(--ink); }
</style>
