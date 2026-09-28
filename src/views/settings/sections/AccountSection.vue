<script setup lang="ts">
/* 账号：一行账号本身（打码 ID、区域、上次同步、状态、重新验证），
   一行 Zepp Cloud——它是账号的数据来源，不是一台设备，所以放在这里而不是设备列表里。 */
import { computed } from 'vue';
import DesignIcon from '../../../components/DesignIcon.vue';
import { useSettingsContext } from '../../../composables/settings/context';
import { useSettingsFormat } from '../../../composables/settings/useSettingsFormat';
import { useSyncController } from '../../../composables/useSyncController';
import { regionShortName } from '../../../lib/deviceCopy';
import { useMessages } from '../../../i18n';
import { settingsMessages } from '../../Settings.i18n';
import { deckMessages } from '../deck.i18n';

const t = useMessages(settingsMessages);
const d = useMessages(deckMessages);
const { appStatus, isSyncing } = useSyncController();
const { formatDateTime } = useSettingsFormat();
const {
  accountRecognized, configuredOnly, connectionLabel, loginBusy,
  startLogin, verifyAndSync, clearAuth,
} = useSettingsContext().auth;

const accountLabel = computed(() => appStatus.value?.masked_user_id || t.value.unidentified);
const accountInitial = computed(() =>
  accountLabel.value.match(/[A-Za-z0-9]/)?.[0]?.toUpperCase() || t.value.unidentifiedInitial);
const regionLabel = computed(() => regionShortName(appStatus.value?.region_host));
const regionHost = computed(() => appStatus.value?.region_host || t.value.notProvided);
</script>

<template>
  <section id="account-section" class="s-section" aria-labelledby="account-title">
    <div class="s-section-head"><h3 id="account-title">{{ d.secAccount }}</h3></div>
    <div class="s-list">
      <div class="s-row">
        <span class="account-avatar" aria-hidden="true">{{ accountInitial }}</span>
        <div class="s-row-main">
          <span class="s-row-title mono">{{ accountLabel }}</span>
          <span class="s-row-sub" :title="regionHost">{{ t.accountLine(regionLabel, formatDateTime(appStatus?.last_cloud_sync_at)) }}</span>
        </div>
        <div class="s-row-control">
          <span :class="['state-dot', { on: accountRecognized }]">{{ connectionLabel }}</span>
          <button v-if="configuredOnly" class="button secondary" type="button" :disabled="isSyncing" @click="verifyAndSync">{{ t.verifyAndSync }}</button>
          <button v-else class="button secondary" type="button" :disabled="loginBusy" @click="startLogin">{{ t.reauthenticate }}</button>
        </div>
      </div>
      <div class="s-row">
        <DesignIcon name="zepp-cloud" :size="36" class="cloud-mark" />
        <div class="s-row-main">
          <span class="s-row-title">Zepp Cloud</span>
          <span class="s-row-sub">{{ d.cloudSourceSub }}</span>
        </div>
        <div class="s-row-control">
          <span :class="['state-dot', { on: accountRecognized }]">{{ connectionLabel }}</span>
        </div>
      </div>
      <!--
        「退出账号」放在这里，而不是继续埋在「高级 → 清除认证」里。
        两个人在 Reddit 上问同一句话：「我怎么退出？找不到 logout 按钮。」
        （p71rsj2、p7497lq）后端 `clear_auth` 本来就只清凭据、保留本机历史。
      -->
      <div v-if="appStatus?.configured" class="s-row">
        <div class="s-row-main">
          <span class="s-row-sub">{{ t.logoutHint }}</span>
          <span class="s-row-sub">{{ t.logoutNoMultiAccount }}</span>
        </div>
        <div class="s-row-control">
          <button class="button danger-button" type="button" @click="clearAuth">{{ t.logout }}</button>
        </div>
      </div>
    </div>
  </section>
</template>

<style scoped src="../settings-local.css"></style>
<style scoped>
.account-avatar {
  display: grid;
  width: 36px;
  height: 36px;
  flex: 0 0 36px;
  place-items: center;
  border-radius: 11px;
  background: var(--accent-soft);
  box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--accent) 30%, transparent);
  color: var(--accent);
  font-family: var(--font-mono);
  font-size: var(--fs-lg);
  font-weight: 700;
}
.mono { font-family: var(--font-mono); }
.cloud-mark { flex: 0 0 auto; border-radius: 11px; }
</style>
