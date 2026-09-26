<script setup lang="ts">
import { computed } from 'vue';
import { useSettingsContext } from '../../../composables/settings/context';
import { useSettingsFormat } from '../../../composables/settings/useSettingsFormat';
import { useSyncController } from '../../../composables/useSyncController';
import { regionShortName } from '../../../lib/deviceCopy';
import { useMessages } from '../../../i18n';
import { settingsMessages } from '../../Settings.i18n';

const t = useMessages(settingsMessages);
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
  <section id="account-section" class="settings-card account-card" aria-labelledby="account-title">
    <h2 id="account-title">{{ t.accountTitle }}</h2>
    <div class="account-strip">
      <span class="account-avatar">{{ accountInitial }}</span>
      <div class="account-meta">
        <strong>{{ accountLabel }}</strong>
        <span :title="regionHost">{{ t.accountLine(regionLabel, formatDateTime(appStatus?.last_cloud_sync_at)) }}</span>
      </div>
      <span :class="['account-state', { on: accountRecognized }]"><i class="dot"></i>{{ connectionLabel }}</span>
      <button v-if="configuredOnly" class="kv-btn" type="button" :disabled="isSyncing" @click="verifyAndSync">{{ t.verifyAndSync }}</button>
      <button v-else class="kv-btn" type="button" :disabled="loginBusy" @click="startLogin">{{ t.reauthenticate }}</button>
    </div>
    <!--
      「退出账号」放在这里，而不是继续埋在「高级 → 清除认证」里。

      两个人在 Reddit 上问同一句话：「我怎么退出？找不到 logout 按钮。」
      （p71rsj2、p7497lq）后端 `clear_auth` 的行为本来就是对的——只清凭据、
      保留本机历史——错的是它叫「清除认证」，还藏在高级设置的最里面：
      没人会为了退出账号去点一个听起来像会删数据的按钮。
    -->
    <div v-if="appStatus?.configured" class="account-logout">
      <button class="link-button" type="button" @click="clearAuth">{{ t.logout }}</button>
      <p class="account-logout-hint">{{ t.logoutHint }}</p>
      <p class="account-logout-hint warn">{{ t.logoutNoMultiAccount }}</p>
    </div>
  </section>
</template>

<style scoped src="../settings-base.css"></style>
<style scoped>
.account-card h2 { margin-bottom: 10px; }
.account-strip {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
  min-height: 58px;
  padding: 8px 10px;
  border: 1px solid var(--line);
  border-radius: var(--radius-sm);
  background: var(--surface-raised);
}
.account-logout { margin-top: 10px; }
.account-logout .link-button {
  padding: 0;
  border: 0;
  background: none;
  color: var(--accent);
  font-size: var(--fs-md);
  font-weight: 600;
  cursor: pointer;
}
.account-logout .link-button:hover { text-decoration: underline; }
.account-logout-hint { margin: 4px 0 0; color: var(--subtle); font-size: var(--fs-xs); line-height: 1.55; }
.account-logout-hint.warn { color: var(--muted); }
.account-avatar { display: grid; width: 36px; height: 36px; flex: 0 0 36px; place-items: center; border-radius: 9px; background: var(--accent-soft); color: var(--accent); font-family: var(--font-mono); font-size: var(--fs-xl); font-weight: 700; }
.account-meta { display: grid; min-width: 0; gap: 1px; flex: 1; }
.account-meta strong { overflow: hidden; color: var(--ink); font-family: var(--font-mono); font-size: var(--fs-md); text-overflow: ellipsis; white-space: nowrap; }
.account-meta span { overflow: hidden; color: var(--subtle); font-size: var(--fs-xs); text-overflow: ellipsis; white-space: nowrap; }
.account-state { display: inline-flex; align-items: center; gap: 6px; color: var(--muted); font-size: var(--fs-sm); white-space: nowrap; }
.account-state.on { color: var(--accent); }
.account-state .dot { width: 6px; height: 6px; border-radius: 50%; background: currentColor; }
.kv-btn {
  padding: 5px 14px;
  border: 1px solid var(--line-control);
  border-radius: 8px;
  background: var(--surface-raised);
  color: var(--accent);
  font-size: var(--fs-sm);
  cursor: pointer;
}
.kv-btn:hover:not(:disabled) { border-color: var(--accent); }
@media (max-width: 860px) {
  .account-strip { flex-wrap: wrap; }
  .account-meta { flex: 1 1 160px; }
}
</style>
