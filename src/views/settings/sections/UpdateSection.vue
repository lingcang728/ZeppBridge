<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import Icon from '../../../components/Icon.vue';
import ModalDialog from '../../../components/ModalDialog.vue';
import { checkForDesktopUpdate, downloadAndInstallDesktopUpdate, updateState } from '../../../services/updateService';
import { useMessages } from '../../../i18n';
import { settingsMessages } from '../../Settings.i18n';

const t = useMessages(settingsMessages);
const BUILD_STAMP = __BUILD_STAMP__;
const updateNotesOpen = ref(false);

/** 卡片上只放第一行；完整说明在弹窗里，免得把一整篇 Release notes 压成一段。 */
const releaseTeaser = computed(() => {
  const notes = updateState.notes.trim();
  if (!notes) return t.value.releaseNotesEmpty;
  const firstLine = notes
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find(Boolean) ?? notes;
  return firstLine.length > 60 ? `${firstLine.slice(0, 60)}…` : firstLine;
});

/* 一发现新版本就把「更新了什么」摆到用户面前。
   只报一个版本号的话，用户没有任何依据判断这次该不该更新。 */
watch(() => updateState.status, (status) => {
  if (status === 'available') updateNotesOpen.value = true;
});
const updateBusy = computed(() => ['checking', 'downloading', 'installing'].includes(updateState.status));
const updateProgress = computed(() => updateState.totalBytes
  ? Math.min(100, Math.round(updateState.downloadedBytes / updateState.totalBytes * 100))
  : null);
const updateStatusLabel = computed(() => ({
  idle: t.value.updateStatusIdle,
  checking: t.value.updateStatusChecking,
  available: t.value.updateStatusAvailable(updateState.version),
  downloading: updateProgress.value === null
    ? t.value.updateStatusDownloading
    : t.value.updateStatusDownloadingPercent(updateProgress.value),
  installing: t.value.updateStatusInstalling,
  failed: t.value.updateStatusFailed,
  upToDate: t.value.updateStatusUpToDate,
  unmanaged: t.value.updateStatusUnmanaged,
}[updateState.status]));

const formatUpdateBytes = (bytes: number) => bytes < 1024 * 1024
  ? `${(bytes / 1024).toFixed(1)} KB`
  : `${(bytes / 1024 / 1024).toFixed(1)} MB`;

/* 弹窗全程不关：下载和安装的进度都显示在更新说明下面。
   用户想干别的可以点「在后台继续」把弹窗收起来，下载不受影响。 */
const installUpdate = async () => {
  await downloadAndInstallDesktopUpdate();
};
</script>

<template>
  <section class="settings-card update-card" aria-labelledby="update-title">
    <div class="update-head">
      <div>
        <h2 id="update-title">{{ t.updateTitle }}</h2>
        <p>{{ t.updateSub }}</p>
      </div>
      <!-- 更新由包管理器管的渠道上不摆这个按钮：按下去只能得到一句
           「这里不管更新」，不如一开始就别给。 -->
      <button
        v-if="updateState.status !== 'unmanaged'"
        class="button secondary"
        type="button"
        :disabled="updateBusy"
        @click="checkForDesktopUpdate(true)"
      >
        <Icon name="sync" :size="14" :class="{ spinning: updateState.status === 'checking' }" />
        {{ updateState.status === 'checking' ? t.updateChecking : t.updateCheck }}
      </button>
    </div>
    <div :class="['update-state', `is-${updateState.status}`]" role="status" aria-live="polite">
      <i aria-hidden="true"></i>
      <div>
        <strong>{{ updateStatusLabel }}</strong>
        <p v-if="updateState.status === 'failed'">{{ updateState.error }}</p>
        <p v-else-if="updateState.status === 'unmanaged'">{{ t.updateUnmanagedHint(updateState.currentVersion || t.updateVersionLoading) }}</p>
        <p v-else-if="updateState.status === 'available'">{{ t.updateCurrent(updateState.currentVersion) }}<template v-if="updateState.sizeBytes"> · {{ formatUpdateBytes(updateState.sizeBytes) }}</template></p>
        <p v-else>{{ t.updateVersion(updateState.currentVersion || t.updateVersionLoading) }}</p>
        <!-- 同一个版本号会构建很多次；报问题时把这一行带上，就不用猜手上是哪个包了。 -->
        <p class="build-stamp">{{ t.buildStamp(BUILD_STAMP) }}</p>
      </div>
    </div>
    <progress v-if="updateState.status === 'downloading' && updateProgress !== null" :value="updateProgress" max="100">{{ updateProgress }}%</progress>
    <div v-if="updateState.status === 'available'" class="update-release">
      <div>
        <strong>ZeppBridge {{ updateState.version }}</strong>
        <p class="release-teaser">{{ releaseTeaser }}</p>
      </div>
      <button class="button primary" type="button" @click="updateNotesOpen = true">{{ t.updateSeeNotes }}</button>
    </div>

    <!-- 更新说明弹窗。
         发现新版本时自动弹一次：只给一个版本号，用户没法判断这次值不值得更新。
         Release 说明是 Markdown，这里按纯文本原样显示（保留换行），不做渲染——
         更新说明是别处写的内容，不该在这里当富文本执行。 -->
    <ModalDialog v-if="updateNotesOpen" labelledby="update-dialog-title" @close="updateNotesOpen = false">
      <div class="modal-head">
        <div class="modal-title-row">
          <Icon name="sync" :size="18" class="shield-ic" />
          <h3 id="update-dialog-title">{{ t.updateModalTitle(updateState.version) }}</h3>
        </div>
        <button type="button" class="close-btn" :aria-label="t.closeDialog" @click="updateNotesOpen = false"><Icon name="x" :size="16" /></button>
      </div>
      <p class="modal-sub">
        {{ t.updateModalCurrent(updateState.currentVersion || t.updateModalUnknownVersion) }}
        <template v-if="updateState.date">{{ t.updateModalReleased(updateState.date.slice(0, 10)) }}</template>
        <template v-if="updateState.sizeBytes"> · {{ formatUpdateBytes(updateState.sizeBytes) }}</template>
      </p>
      <div class="modal-body">
        <pre class="release-notes">{{ updateState.notes || t.releaseNotesEmpty }}</pre>
      </div>
      <!-- 下载进度就放在更新说明下面：等待的这几十秒里，用户正好可以把上面
           的说明读完，而不是盯着一个没有反馈的按钮猜它有没有在动。 -->
      <div v-if="updateState.status === 'downloading' || updateState.status === 'installing'" class="update-progress">
        <div class="progress-head">
          <strong>{{ updateState.status === 'installing' ? t.updateInstalling : t.updateDownloading }}</strong>
          <span v-if="updateState.status === 'downloading' && updateProgress !== null">{{ updateProgress }}%</span>
        </div>
        <div class="progress-track" role="progressbar" :aria-valuenow="updateProgress ?? undefined" aria-valuemin="0" aria-valuemax="100">
          <i :class="{ indeterminate: updateProgress === null || updateState.status === 'installing' }"
             :style="updateState.status === 'downloading' && updateProgress !== null ? { width: `${updateProgress}%` } : undefined"></i>
        </div>
        <p class="progress-note">
          <template v-if="updateState.status === 'installing'">{{ t.updateInstallNote }}</template>
          <template v-else-if="updateState.totalBytes">
            {{ formatUpdateBytes(updateState.downloadedBytes) }} / {{ formatUpdateBytes(updateState.totalBytes) }}{{ t.updateDownloadNoteTail }}
          </template>
          <template v-else>{{ t.updateDownloadNote }}</template>
        </p>
      </div>

      <p v-else-if="updateState.status === 'failed'" class="progress-note bad" role="alert">
        {{ t.updateFailedPrefix(updateState.error) }}
      </p>
      <p v-else class="progress-note">{{ t.updateRestartNote }}</p>

      <div class="modal-foot">
        <button
          type="button"
          class="button secondary"
          @click="updateNotesOpen = false"
        >{{ updateState.status === 'downloading' || updateState.status === 'installing' ? t.updateBackground : t.updateLater }}</button>
        <button
          v-if="updateState.status !== 'downloading' && updateState.status !== 'installing'"
          type="button"
          class="button primary"
          @click="installUpdate"
        >{{ updateState.status === 'failed' ? t.updateRetry : t.updateInstall }}</button>
      </div>
    </ModalDialog>
  </section>
</template>

<style scoped src="../settings-base.css"></style>
<style scoped>
.build-stamp { color: var(--subtle); font-size: var(--fs-xs); font-family: var(--font-mono); }
.update-head, .update-release { display: grid; grid-template-columns: minmax(0, 1fr) auto; align-items: center; gap: 14px; }
.update-head h2 { margin-bottom: 4px; }
.update-head p, .update-state p, .update-release p { margin: 0; color: var(--subtle); font-size: var(--fs-xs); line-height: 1.5; }
.update-state { display: grid; grid-template-columns: 7px minmax(0, 1fr); align-items: center; gap: 11px; margin-top: 14px; padding: 11px 12px; border: 1px solid var(--line); border-radius: var(--radius-sm); background: var(--surface-raised); }
.update-state i { width: 7px; height: 7px; border-radius: 50%; background: var(--muted); }
.update-state.is-available i, .update-state.is-upToDate i { background: var(--accent); }
.update-state.is-checking i, .update-state.is-downloading i, .update-state.is-installing i { background: var(--warning); }
.update-state.is-failed i { background: var(--danger); }
.update-state strong, .update-release strong { color: var(--ink); font-size: var(--fs-sm); }
.update-card progress { width: 100%; height: 6px; margin-top: 10px; accent-color: var(--accent); }
.update-release { margin-top: 10px; padding: 11px 12px; border: 1px solid var(--line); border-radius: var(--radius-sm); background: var(--surface-raised); }
.release-teaser { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.update-progress { display: grid; gap: 7px; margin-top: 14px; }
.progress-head { display: flex; align-items: baseline; justify-content: space-between; gap: 12px; color: var(--ink); font-size: var(--fs-md); }
.progress-head span { color: var(--accent); font-family: var(--font-mono); font-variant-numeric: tabular-nums; }
.progress-track { height: 6px; overflow: hidden; border-radius: 3px; background: rgba(232, 238, 244, .1); }
.progress-track i { display: block; height: 100%; border-radius: 3px; background: var(--accent); transition: width 220ms ease; }
/* 拿不到总大小时用一条来回跑的条，而不是假装一个百分比。 */
.progress-track i.indeterminate { width: 40%; animation: progress-slide 1.2s ease-in-out infinite; }
@keyframes progress-slide {
  0% { transform: translateX(-100%); }
  100% { transform: translateX(250%); }
}
@media (prefers-reduced-motion: reduce) {
  .progress-track i.indeterminate { animation: none; width: 100%; opacity: .5; }
}
.progress-note { margin: 10px 0 0; color: var(--muted); font-size: var(--fs-sm); line-height: 1.7; }
.progress-note.bad { color: var(--danger); }
.modal-sub { margin: 0 0 10px; color: var(--muted); font-size: var(--fs-sm); }
.release-notes {
  margin: 0;
  padding: 14px 16px;
  max-height: 46vh;
  overflow: auto;
  border: 1px solid var(--line);
  border-radius: var(--radius-sm);
  background: var(--surface-raised);
  color: var(--ink);
  font-family: var(--font-sans);
  font-size: var(--fs-sm);
  line-height: 1.85;
  white-space: pre-wrap;
  word-break: break-word;
}
</style>
