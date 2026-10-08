<script setup lang="ts">
/* 账号：一行连接状态（官方授权 · 高级数据，两条各报各的，互不冒充）+ 一个主按钮，
   按钮永远是此刻最该做的那一步。网页登录、手动填写、复制授权链接都在高级卡的「登录方式」。 */
import { computed } from 'vue';
import { useRouter } from 'vue-router';
import Icon from '../../../components/Icon.vue';
import FoldTransition from '../../../components/FoldTransition.vue';
import { useSettingsContext } from '../../../composables/settings/context';
import { useSyncController } from '../../../composables/useSyncController';
import { revealWeeklyReport } from '../../../lib/revealWeeklyReport';
import { useMessages } from '../../../i18n';
import { deckMessages } from '../deck.i18n';
import { accountCardMessages } from './account.i18n';

const d = useMessages(deckMessages);
const a = useMessages(accountCardMessages);
const { appStatus, isSyncing, syncProgress, dataReady, pickUpReady } = useSyncController();
const router = useRouter();

/* 第一次使用（体验评估 #1）：刚连上账号的人停在这张卡里，要看得到第一次同步走到哪了、下一步去哪。
   同步中：连上了、正在取第几项；取到数据以后：去概览看「这一周」。以后的同步不再出这一行。 */
const firstSyncing = computed(() => isSyncing.value && !appStatus.value?.last_cloud_sync_at);
const firstReady = computed(() => dataReady.value.phase === 'ready' && dataReady.value.firstRun && !isSyncing.value);
const firstLine = computed(() => {
  if (firstReady.value) return d.value.firstReady;
  const progress = syncProgress.value;
  return progress ? d.value.firstSyncing(progress.current, progress.total) : d.value.firstSyncingPlain;
});
const goOverview = () => {
  if (firstReady.value) pickUpReady('pickup');
  void router.push('/').then(() => revealWeeklyReport());
};

const {
  connected, configuredOnly, accountRecognized, loginBusy, loginInProgress, loginStatus, loginMessage,
  startLogin, cancelLogin, verifyAndSync, clearAuth,
} = useSettingsContext().auth;
const official = useSettingsContext().official;

const name = computed(() =>
  official.status.value.nickname?.trim() || official.status.value.user_id_masked
  || appStatus.value?.masked_user_id || a.value.accountFallback);
const initial = computed(() => name.value.match(/[\p{L}\p{N}]/u)?.[0]?.toUpperCase() || 'Z');

const officialState = computed(() => {
  if (official.waiting.value) return a.value.stWaiting;
  if (official.connected.value) return a.value.stOn;
  return official.needsReauth.value ? a.value.stReauth : a.value.stOff;
});
const advancedState = computed(() => {
  if (loginInProgress.value) return a.value.stSigningIn;
  if (connected.value) return a.value.stOn;
  if (configuredOnly.value) return a.value.stUnverified;
  return loginStatus.value.state === 'failed' ? a.value.stFailed : a.value.stOff;
});
const statusLine = computed(() => [a.value.official(officialState.value), a.value.advanced(advancedState.value)].join(' · '));
const anyConnected = computed(() => official.connected.value || accountRecognized.value);

/** 只放一个按钮：官方没连先连官方；官方好了，再看高级数据要不要验证或登录。 */
type Action = { label: string; primary: boolean; disabled: boolean; run: () => unknown };
const action = computed<Action | null>(() => {
  if (official.waiting.value) return { label: a.value.cancel, primary: false, disabled: official.busy.value, run: official.cancel };
  if (!official.connected.value) {
    return { label: official.needsReauth.value ? a.value.reauth : a.value.connect, primary: true, disabled: official.busy.value, run: official.start };
  }
  if (loginInProgress.value) return { label: a.value.cancel, primary: false, disabled: loginBusy.value, run: cancelLogin };
  if (configuredOnly.value) return { label: a.value.verify, primary: false, disabled: isSyncing.value, run: verifyAndSync };
  if (!connected.value) return { label: a.value.connectAdvanced, primary: false, disabled: loginBusy.value, run: startLogin };
  return null;
});
</script>

<template>
  <section id="account-section" class="s-section" aria-labelledby="account-title">
    <div class="s-section-head"><h3 id="account-title">{{ d.secAccount }}</h3></div>
    <div class="s-list">
      <div v-if="firstSyncing || firstReady" class="s-row first-run" role="status">
        <span :class="['first-dot', { done: firstReady }]" aria-hidden="true"></span>
        <div class="s-row-main"><span class="s-row-title">{{ firstLine }}</span></div>
        <div class="s-row-control">
          <button :class="['button', firstReady ? 'primary' : 'secondary']" type="button" @click="goOverview">{{ d.goOverview }}</button>
        </div>
      </div>
      <div class="s-row">
        <span class="account-avatar" :class="{ muted: !anyConnected }" aria-hidden="true">{{ initial }}</span>
        <div class="s-row-main">
          <span class="s-row-title">{{ name }}</span>
          <span class="s-row-sub">{{ statusLine }}</span>
        </div>
        <div v-if="action" class="s-row-control">
          <button :class="['button', action.primary ? 'primary' : 'secondary']" type="button" :disabled="action.disabled" @click="action.run">
            {{ action.label }}
          </button>
        </div>
      </div>
      <!--
        「退出账号」放在这里，而不是埋在高级里。
        两个人在 Reddit 上问同一句话：「我怎么退出？找不到 logout 按钮。」
        （p71rsj2、p7497lq）后端 `clear_auth` 本来就只清凭据、保留本机历史。
      -->
      <div v-if="appStatus?.configured" class="s-row">
        <div class="s-row-main">
          <span class="s-row-title">{{ a.logoutTitle }}</span>
          <span class="s-row-sub">{{ a.logoutSub }}</span>
        </div>
        <div class="s-row-control">
          <button class="button danger-button" type="button" @click="clearAuth">{{ a.logoutShort }}</button>
        </div>
      </div>
    </div>
    <FoldTransition><p v-if="official.failureText.value" class="api-error" role="alert"><Icon name="info" :size="13" />{{ official.failureText.value }}</p></FoldTransition>
    <FoldTransition>
      <p v-if="loginInProgress && loginMessage" class="hint-line"><Icon name="info" :size="13" />{{ loginMessage }}</p>
      <p v-else-if="loginStatus.state === 'failed' && loginMessage" class="api-error" role="alert"><Icon name="info" :size="13" />{{ loginMessage }}</p>
    </FoldTransition>
  </section>
</template>

<style scoped src="../settings-local.css"></style>
<style scoped>
/* 第一次同步那一行：同步中是一颗呼吸的强调色圆点，取到数据以后定住。 */
.first-run { background: color-mix(in srgb, var(--accent) 7%, transparent); }
.first-dot { flex: none; width: 9px; height: 9px; margin: 0 14px 0 13px; border-radius: 50%; background: var(--accent); animation: first-breathe 1.6s ease-in-out infinite; }
.first-dot.done { animation: none; }
@keyframes first-breathe { 50% { opacity: .35; } }
@media (prefers-reduced-motion: reduce) { .first-dot { animation: none; } }
.account-avatar {
  display: grid;
  width: 36px;
  height: 36px;
  flex: 0 0 36px;
  place-items: center;
  border-radius: 11px;
  background: var(--accent-soft);
  color: var(--accent);
  font-family: var(--font-display, inherit);
  font-size: var(--fs-lg);
  font-weight: 700;
}
.account-avatar.muted { background: var(--mat-inset); box-shadow: var(--mat-inset-shadow); color: var(--subtle); }
</style>
