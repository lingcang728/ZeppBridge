<script setup lang="ts">
import Icon from '../../../components/Icon.vue';
import { useSettingsContext } from '../../../composables/settings/context';
import { useMessages } from '../../../i18n';
import { settingsMessages } from '../../Settings.i18n';

const t = useMessages(settingsMessages);
const {
  reconnecting, loginStatus, loginBusy, loginInProgress, loginMessage, connected, configuredOnly,
  showManualAuth, manualAppToken, manualUserId, manualRegionHost, manualAuthBusy,
  startLogin, cancelLogin, importHar, submitManualAuth,
} = useSettingsContext().auth;
</script>

<template>
  <section id="connection" class="settings-card" aria-labelledby="auth-title">
    <h2 id="auth-title">{{ t.authTitle }}</h2>
    <div class="auth-grid">
      <div :class="['auth-card', { current: connected || configuredOnly }]">
        <div class="auth-head">
          <span class="auth-icon"><Icon name="globe" :size="18" /></span>
          <div>
            <strong>{{ t.authWebTitle }}</strong>
            <p>{{ t.authWebSub }}</p>
          </div>
        </div>
        <button v-if="loginInProgress" class="auth-action" type="button" :disabled="loginBusy" @click="cancelLogin">{{ t.authCancelLogin }}</button>
        <button v-else-if="connected && !reconnecting" class="auth-action is-current" type="button" @click="startLogin">
          {{ t.authInUse }} <Icon name="circle-check" :size="14" />
        </button>
        <button v-else class="auth-action" type="button" :disabled="loginBusy" @click="startLogin">
          {{ loginBusy ? t.authOpening : loginStatus.state === 'failed' ? t.authRetry : t.authUse }}
        </button>
      </div>
      <div class="auth-card">
        <div class="auth-head">
          <span class="auth-icon"><Icon name="file" :size="18" /></span>
          <div>
            <strong>{{ t.authHarTitle }}</strong>
            <p>{{ t.authHarSub }}</p>
          </div>
        </div>
        <button class="auth-action" type="button" :disabled="loginBusy" @click="importHar">{{ t.authUse }}</button>
      </div>
      <div class="auth-card">
        <div class="auth-head">
          <span class="auth-icon"><Icon name="edit" :size="18" /></span>
          <div>
            <strong>{{ t.authManualTitle }}</strong>
            <p>{{ t.authManualSub }}</p>
          </div>
        </div>
        <button class="auth-action" type="button" @click="showManualAuth = !showManualAuth">{{ showManualAuth ? t.authCollapse : t.authUse }}</button>
      </div>
    </div>
    <p v-if="loginInProgress && loginMessage" class="hint-line"><Icon name="info" :size="13" />{{ loginMessage }}</p>
    <!-- 登录失败要看得见原因，尤其是「登录了但没读到凭据」——那时该直接去
         用下面的 HAR / 手动填写，而不是反复重试网页登录。 -->
    <p v-else-if="loginStatus.state === 'failed' && loginMessage" class="api-error" role="alert">
      <Icon name="info" :size="13" />{{ loginMessage }}
    </p>

    <!-- 手动认证表单 -->
    <div v-if="showManualAuth" class="manual-auth-form">
      <h3>{{ t.manualFormTitle }}</h3>
      <p class="form-hint">{{ t.manualFormHint }}</p>
      <div class="form-group">
        <label for="manual-apptoken">App Token *</label>
        <input id="manual-apptoken" v-model="manualAppToken" type="password" autocomplete="off" :placeholder="t.manualTokenPlaceholder" :disabled="manualAuthBusy" />
      </div>
      <div class="form-group">
        <label for="manual-userid">User ID *</label>
        <input id="manual-userid" v-model="manualUserId" type="text" :placeholder="t.manualUserIdPlaceholder" :disabled="manualAuthBusy" />
      </div>
      <div class="form-group">
        <label for="manual-host">Region Host *</label>
        <input id="manual-host" v-model="manualRegionHost" type="text" placeholder="https://api-mifit-us3.zepp.com" :disabled="manualAuthBusy" />
      </div>
      <div class="form-actions">
        <button class="button primary" type="button" :disabled="manualAuthBusy" @click="submitManualAuth">
          {{ manualAuthBusy ? t.manualSaving : t.manualSave }}
        </button>
        <button class="button secondary" type="button" :disabled="manualAuthBusy" @click="showManualAuth = false">{{ t.cancel }}</button>
      </div>
    </div>
  </section>
</template>

<style scoped src="../settings-base.css"></style>
<style scoped>
.auth-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 12px; }
.auth-card {
  display: grid;
  grid-template-rows: 1fr auto;
  gap: 12px;
  padding: 14px;
  border: 1px solid var(--line);
  border-radius: var(--radius-md);
  background: var(--surface-raised);
  transition: border-color 140ms ease;
}
.auth-card.current { border-color: rgba(205, 220, 124, .30); }
.auth-head { display: flex; align-items: flex-start; gap: 10px; min-width: 0; }
.auth-icon {
  display: grid;
  place-items: center;
  width: 38px;
  height: 38px;
  flex: 0 0 38px;
  border-radius: 10px;
  border: 1px solid var(--line);
  background: var(--surface);
  color: var(--warning);
}
.auth-card.current .auth-icon { color: var(--accent); }
.auth-head strong { display: block; font-size: var(--fs-md); margin-bottom: 3px; color: var(--ink); }
.auth-head p { margin: 0; color: var(--subtle); font-size: var(--fs-xs); line-height: 1.5; }
.auth-action {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  min-height: 34px;
  border: 1px solid var(--line-control);
  border-radius: 9px;
  background: var(--surface);
  color: var(--muted);
  font-size: var(--fs-sm);
  cursor: pointer;
  transition: all 140ms ease;
}
.auth-action:hover:not(:disabled) { color: var(--accent); border-color: var(--accent); }
.auth-action:disabled { opacity: .5; cursor: not-allowed; }
.auth-action.is-current { border-color: rgba(205, 220, 124, .35); background: var(--accent-soft); color: var(--accent); font-weight: 600; }
.manual-auth-form { margin-top: 16px; padding: 16px; border: 1px solid var(--line); border-radius: var(--radius-md); background: var(--surface-raised); }
.manual-auth-form h3 { margin: 0 0 8px; font-size: var(--fs-lg); font-weight: 700; color: var(--ink); }
.manual-auth-form .form-hint { margin: 0 0 12px; color: var(--muted); font-size: var(--fs-sm); }
.manual-auth-form .form-group { margin-bottom: 12px; }
.manual-auth-form .form-group:last-of-type { margin-bottom: 16px; }
.manual-auth-form label { display: block; margin-bottom: 4px; color: var(--ink); font-size: var(--fs-sm); font-weight: 600; }
.manual-auth-form input { width: 100%; padding: 8px 10px; border: 1px solid var(--line-control); border-radius: 9px; background: var(--surface); color: var(--ink); font-family: var(--font-mono); font-size: var(--fs-sm); }
.manual-auth-form input:focus { border-color: var(--accent); outline: none; box-shadow: 0 0 0 3px var(--accent-soft); }
.manual-auth-form input:disabled { opacity: 0.5; cursor: not-allowed; }
.manual-auth-form .form-actions { display: flex; gap: 8px; }
@media (max-width: 860px) {
  .auth-grid { grid-template-columns: minmax(0, 1fr); }
}
</style>
