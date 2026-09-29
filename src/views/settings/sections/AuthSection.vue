<script setup lang="ts">
/* 登录方式：平时用不上，默认收起；登录失败或正在登录时自动展开。 */
import { computed } from 'vue';
import Icon from '../../../components/Icon.vue';
import { useSettingsContext } from '../../../composables/settings/context';
import { useMessages } from '../../../i18n';
import { settingsMessages } from '../../Settings.i18n';
import { deckMessages } from '../deck.i18n';

const t = useMessages(settingsMessages);
const d = useMessages(deckMessages);
const {
  reconnecting, loginStatus, loginBusy, loginInProgress, loginMessage, connected, configuredOnly,
  showManualAuth, manualAppToken, manualUserId, manualRegionHost, manualAuthBusy,
  startLogin, cancelLogin, submitManualAuth,
} = useSettingsContext().auth;

const needsAttention = computed(() =>
  loginInProgress.value || loginStatus.value.state === 'failed' || showManualAuth.value || !(connected.value || configuredOnly.value));
</script>

<template>
  <section id="connection" class="s-section" aria-labelledby="auth-title">
    <details class="s-list auth-fold" :open="needsAttention">
      <summary class="s-row">
        <div class="s-row-main">
          <span id="auth-title" class="s-row-title">{{ d.secLogin }}</span>
          <span class="s-row-sub">{{ d.secLoginSub }}</span>
        </div>
        <Icon name="chevron-down" :size="16" class="fold-caret" />
      </summary>

      <div class="s-row">
        <span class="auth-icon" :class="{ current: connected || configuredOnly }"><Icon name="globe" :size="17" /></span>
        <div class="s-row-main">
          <span class="s-row-title">{{ t.authWebTitle }}</span>
          <span class="s-row-sub">{{ t.authWebSub }}</span>
        </div>
        <div class="s-row-control">
          <button v-if="loginInProgress" class="button secondary" type="button" :disabled="loginBusy" @click="cancelLogin">{{ t.authCancelLogin }}</button>
          <span v-else-if="connected && !reconnecting" class="state-dot on">{{ t.authInUse }}</span>
          <button v-else class="button secondary" type="button" :disabled="loginBusy" @click="startLogin">
            {{ loginBusy ? t.authOpening : loginStatus.state === 'failed' ? t.authRetry : t.authUse }}
          </button>
        </div>
      </div>
      <div class="s-row">
        <span class="auth-icon"><Icon name="edit" :size="17" /></span>
        <div class="s-row-main">
          <span class="s-row-title">{{ t.authManualTitle }}</span>
          <span class="s-row-sub">{{ t.authManualSub }}</span>
        </div>
        <div class="s-row-control">
          <button class="button secondary" type="button" @click="showManualAuth = !showManualAuth">{{ showManualAuth ? t.authCollapse : t.authUse }}</button>
        </div>
      </div>

      <div v-if="showManualAuth" class="s-row is-block manual-auth-form">
        <p class="s-row-sub">{{ t.manualFormHint }}</p>
        <label class="form-group">
          <span>App Token *</span>
          <input id="manual-apptoken" v-model="manualAppToken" class="mat-field mono" type="password" autocomplete="off" :placeholder="t.manualTokenPlaceholder" :disabled="manualAuthBusy" />
        </label>
        <label class="form-group">
          <span>User ID *</span>
          <input id="manual-userid" v-model="manualUserId" class="mat-field mono" type="text" :placeholder="t.manualUserIdPlaceholder" :disabled="manualAuthBusy" />
        </label>
        <label class="form-group">
          <span>Region Host *</span>
          <input id="manual-host" v-model="manualRegionHost" class="mat-field mono" type="text" placeholder="https://api-mifit-us3.zepp.com" :disabled="manualAuthBusy" />
        </label>
        <div class="s-actions">
          <button class="button primary" type="button" :disabled="manualAuthBusy" @click="submitManualAuth">
            {{ manualAuthBusy ? t.manualSaving : t.manualSave }}
          </button>
          <button class="button secondary" type="button" :disabled="manualAuthBusy" @click="showManualAuth = false">{{ t.cancel }}</button>
        </div>
      </div>
    </details>
    <p v-if="loginInProgress && loginMessage" class="hint-line"><Icon name="info" :size="13" />{{ loginMessage }}</p>
    <!-- 登录失败要看得见原因，尤其是「登录了但没读到凭据」——那时该直接去
         用手动填写，而不是反复重试网页登录。 -->
    <p v-else-if="loginStatus.state === 'failed' && loginMessage" class="api-error" role="alert">
      <Icon name="info" :size="13" />{{ loginMessage }}
    </p>
  </section>
</template>

<style scoped src="../settings-local.css"></style>
<style scoped>
.auth-fold > summary { cursor: pointer; list-style: none; }
.auth-fold > summary::-webkit-details-marker { display: none; }
.fold-caret { color: var(--subtle); transition: transform var(--dur-base) var(--ease-out); }
.auth-fold[open] .fold-caret { transform: rotate(180deg); }
.auth-icon {
  display: grid;
  width: 34px;
  height: 34px;
  flex: 0 0 34px;
  place-items: center;
  border-radius: 10px;
  background: var(--mat-inset);
  box-shadow: var(--mat-inset-shadow);
  color: var(--muted);
}
.auth-icon.current { color: var(--accent); }
.manual-auth-form { gap: 10px; }
.form-group { display: grid; gap: 4px; }
.form-group > span { color: var(--ink); font-size: var(--fs-sm); font-weight: 600; }
.mono { font-family: var(--font-mono); }
</style>
