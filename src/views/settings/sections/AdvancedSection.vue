<script setup lang="ts">
/* 高级与维护：别的卡挪过来的次要项都在这里。退出账号只在账号卡有一个，这里不再重复。 */
import { onActivated, ref } from 'vue';
import { RouterLink, useRoute } from 'vue-router';
import BackupPanel from '../../../components/BackupPanel.vue';
import Icon from '../../../components/Icon.vue';
import AuthSection from './AuthSection.vue';
import FeedbackSection from './FeedbackSection.vue';
import LocalApiPanel from './LocalApiPanel.vue';
import MaintenanceSection from './MaintenanceSection.vue';
import MorePrefsSection from './MorePrefsSection.vue';
import ProbeSection from './ProbeSection.vue';
import WorkoutCodesSection from './WorkoutCodesSection.vue';
import { useSettingsContext } from '../../../composables/settings/context';
import { useSettingsFormat } from '../../../composables/settings/useSettingsFormat';
import { useSyncController } from '../../../composables/useSyncController';
import { backend, toUserMessage } from '../../../lib/bridge';
import { formatBytes } from '../../../lib/format';
import { useMessages } from '../../../i18n';
import { settingsMessages } from '../../Settings.i18n';
import { advancedCardMessages } from './advanced.i18n';

const t = useMessages(settingsMessages);
const m = useMessages(advancedCardMessages);
const { appStatus } = useSyncController();
const { formatDateTime } = useSettingsFormat();
const { feedback, prefs } = useSettingsContext();
const { historyDays, storageEstimate } = prefs;
/* 同一个版本号会构建很多次；报问题时把这一行带上，就不用猜手上是哪个包了。 */
const BUILD_STAMP = __BUILD_STAMP__;

const compactBusy = ref(false);
const compactMessage = ref<string | null>(null);
const compactError = ref<string | null>(null);

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

/* 别的卡带着锚点过来（归档卡的 #backup、数据卡的 #codes、隐私卡的 #local-api）：
   等卡展开动画走完再滚到那一块。卡体在 KeepAlive 里，第一次挂载和再次切回来都会走 onActivated。 */
const route = useRoute();
onActivated(() => {
  const id = route.hash.slice(1);
  if (!id) return;
  window.setTimeout(() => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 360);
});

const openDataFolder = async () => {
  try { await backend.openDataFolder(); }
  catch (error) { feedback.dataError.value = toUserMessage(error, t.value.openFolderFailed); }
};
</script>

<template>
  <div class="advanced">
    <section class="s-section">
      <div class="s-list">
        <div class="s-row">
          <div class="s-row-main">
            <span class="s-row-title">{{ m.folderTitle }}</span>
            <span class="s-row-sub">{{ m.folderSub }}</span>
          </div>
          <div class="s-row-control">
            <button class="pill-button" type="button" @click="openDataFolder"><Icon name="folder" :size="14" />{{ t.openDataFolder }}</button>
          </div>
        </div>
        <div class="s-row">
          <div class="s-row-main">
            <span class="s-row-title">{{ t.healthCheckLabel }}</span>
            <span class="s-row-sub">{{ m.healthSub }}</span>
          </div>
          <div class="s-row-control">
            <RouterLink class="pill-button" to="/health-check"><Icon name="database" :size="14" />{{ t.healthCheckOpen }}</RouterLink>
          </div>
        </div>
        <div class="s-row is-block">
          <div class="compact-head">
            <div class="s-row-main">
              <span class="s-row-title">{{ t.compactLabel }}</span>
              <span class="s-row-sub">{{ m.compactSub }}</span>
            </div>
            <div class="s-row-control">
              <button class="pill-button" type="button" :disabled="compactBusy" @click="runCompactPayloads">
                <Icon name="box" :size="14" />{{ compactBusy ? t.compacting : t.compactRun }}
              </button>
            </div>
          </div>
          <details class="compact-fold">
            <summary>{{ m.compactMore }}</summary>
            <p class="s-row-sub">{{ t.compactNoteA }}<strong>{{ t.compactNoteStrong }}</strong>{{ t.compactNoteB }}</p>
          </details>
          <p v-if="compactError" class="api-error" role="alert">{{ compactError }}</p>
          <p v-else-if="compactMessage" class="hint-line ok" role="status">{{ compactMessage }}</p>
        </div>
      </div>
    </section>

    <MorePrefsSection />

    <AuthSection />

    <ProbeSection />

    <WorkoutCodesSection />

    <MaintenanceSection />

    <section id="backup" class="s-section">
      <div class="s-section-head"><h3>{{ t.backupLabel }}</h3></div>
      <BackupPanel />
    </section>

    <section id="local-api" class="s-section">
      <div class="s-section-head"><h3>{{ t.localApiLabel }}</h3></div>
      <p class="s-note">{{ t.localApiNote }}</p>
      <LocalApiPanel />
    </section>

    <FeedbackSection />

    <details class="s-list diag-fold">
      <summary class="s-row">
        <span class="s-row-main">
          <span class="s-row-title">{{ t.syncDiagnostics }}</span>
          <span class="s-row-sub build-stamp">{{ t.buildStamp(BUILD_STAMP) }}</span>
        </span>
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

<style scoped src="../settings-local.css"></style>
<style scoped>
.advanced { display: grid; gap: 22px; min-width: 0; }
.advanced > .s-section + .s-section { margin-top: 0; }
.compact-head { display: flex; align-items: center; justify-content: space-between; gap: 16px; }
.compact-fold { margin-top: 6px; }
.compact-fold > summary { color: var(--accent); font-size: var(--fs-sm); cursor: pointer; }
.compact-fold p { margin: 6px 0 0; line-height: 1.6; }
.compact-fold strong { color: var(--ink); font-weight: 600; }
.diag-fold > summary { cursor: pointer; list-style: none; }
.diag-fold > summary::-webkit-details-marker { display: none; }
.fold-caret { color: var(--subtle); transition: transform var(--dur-base) var(--ease-out); }
.diag-fold[open] .fold-caret { transform: rotate(180deg); }
.build-stamp { font-family: var(--font-mono); }
.stream-row { display: grid; grid-template-columns: 140px minmax(0, 1fr) auto; min-height: 44px; color: var(--muted); font-size: var(--fs-sm); }
.stream-row strong { font-weight: 600; color: var(--ink); }
</style>
