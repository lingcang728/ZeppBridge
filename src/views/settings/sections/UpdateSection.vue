<script setup lang="ts">
/**
 * 设置「同步」卡里的版本那一行。静默更新（2026-10-14）以后这里只是旁证：后台下载、左上角标志的进度环和
 * 绿环才是主角（components/shell/BrandUpdate.vue）。这一行写版本号和当前状态，下好了给「更新」，
 * 失败时说原因（左上角失败是安静的，只有这里会说），平时给「检查更新」。
 */
import { computed, onMounted } from 'vue';
import Icon from '../../../components/Icon.vue';
import { applyDesktopUpdate, downloadRatio, refreshDesktopUpdate, startDesktopUpdate, updateState } from '../../../services/updateService';
import { toUserMessage } from '../../../lib/bridge';
import { useMessages } from '../../../i18n';
import { settingsMessages } from '../../Settings.i18n';
import { useUpdateText } from '../../../components/shell/update.i18n';

const t = useMessages(settingsMessages);
const u = useUpdateText();
onMounted(() => { void refreshDesktopUpdate(); });

const ready = computed(() => updateState.phase === 'ready' || updateState.phase === 'applying');
const busy = computed(() => updateState.phase === 'checking' || updateState.phase === 'downloading');
const status = computed(() => {
  switch (updateState.phase) {
    case 'checking': return t.value.updateStatusChecking;
    case 'downloading': {
      const ratio = downloadRatio(updateState);
      return u.value.downloading(ratio === null ? null : Math.round(ratio * 100));
    }
    case 'ready': return u.value.ready(updateState.version ?? '');
    case 'applying': return updateState.waiting_for_sync ? u.value.waitingSync : u.value.applying;
    case 'up_to_date': return t.value.updateStatusUpToDate;
    case 'unsupported': return t.value.updateStatusUnmanaged;
    case 'failed': return updateState.error_code
      ? toUserMessage({ code: updateState.error_code, message: '' }, t.value.updateStatusFailed)
      : t.value.updateStatusFailed;
    default: return '';
  }
});
</script>

<template>
  <div :class="['s-row', 'update-state', `is-${updateState.phase}`]" role="status" aria-live="polite">
    <div class="s-row-main">
      <span class="s-row-title">{{ t.updateVersion(updateState.currentVersion || t.updateVersionLoading) }}</span>
      <span v-if="status" class="s-row-sub">{{ status }}</span>
      <span v-if="updateState.applyError" class="s-row-sub bad" role="alert">{{ updateState.applyError }}</span>
    </div>
    <!-- 更新由包管理器管的渠道上不摆按钮：按下去只能得到一句「这里不管更新」。 -->
    <div v-if="updateState.phase !== 'unsupported'" class="s-row-control">
      <button v-if="ready" class="button primary" type="button" :disabled="updateState.phase === 'applying'" @click="applyDesktopUpdate()">
        {{ u.update }}
      </button>
      <button v-else class="button secondary" type="button" :disabled="busy" @click="startDesktopUpdate()">
        <Icon name="sync" :size="14" :class="{ spinning: busy }" />
        {{ busy ? t.updateChecking : t.updateCheck }}
      </button>
    </div>
  </div>
</template>

<style scoped src="../settings-local.css"></style>
<style scoped>
.update-state:not(.is-idle, .is-unsupported) .s-row-title::before { content: ''; display: inline-block; width: 7px; height: 7px; margin-right: 8px; border-radius: 50%; background: var(--muted); vertical-align: middle; }
.update-state.is-ready .s-row-title::before, .update-state.is-up_to_date .s-row-title::before { background: var(--accent); }
.update-state.is-checking .s-row-title::before, .update-state.is-downloading .s-row-title::before, .update-state.is-applying .s-row-title::before { background: var(--warning); }
.update-state.is-failed .s-row-title::before { background: var(--danger); }
.s-row-sub.bad { color: var(--danger); }
</style>
