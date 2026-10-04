<script setup lang="ts">
/* 账号：第一行是 Zepp 官方授权（主连接，显示昵称让人认出是哪个账号）；
   第二行是 Zepp Cloud 高级数据连接（旧通道：压力、血氧、HRV 等官方没有的数据）。
   两条连接各管各的状态，互不冒充。 */
import { computed } from 'vue';
import { useRouter } from 'vue-router';
import DesignIcon from '../../../components/DesignIcon.vue';
import { useSettingsContext } from '../../../composables/settings/context';
import { useSettingsFormat } from '../../../composables/settings/useSettingsFormat';
import { useSyncController } from '../../../composables/useSyncController';
import { regionShortName } from '../../../lib/deviceCopy';
import { revealWeeklyReport } from '../../../lib/revealWeeklyReport';
import { useMessages } from '../../../i18n';
import { settingsMessages } from '../../Settings.i18n';
import { deckMessages } from '../deck.i18n';

const t = useMessages(settingsMessages);
const d = useMessages(deckMessages);
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
const { formatDateTime } = useSettingsFormat();
const {
  accountRecognized, configuredOnly, connectionLabel, loginBusy,
  startLogin, verifyAndSync, clearAuth,
} = useSettingsContext().auth;
const official = useSettingsContext().official;

const officialName = computed(() =>
  official.status.value.nickname?.trim() || official.status.value.user_id_masked || t.value.officialTitle);
const officialInitial = computed(() => officialName.value.match(/[\p{L}\p{N}]/u)?.[0]?.toUpperCase() || 'Z');
const officialLine = computed(() => {
  const status = official.status.value;
  if (!official.connected.value) return official.needsReauth.value ? t.value.officialReauth : t.value.officialAccountEmpty;
  const since = status.connected_at ? formatDateTime(new Date(status.connected_at * 1000).toISOString()) : '—';
  return t.value.officialAccountLine(status.user_id_masked ?? '—', since);
});

const accountLabel = computed(() => appStatus.value?.masked_user_id || t.value.unidentified);
const regionLabel = computed(() => regionShortName(appStatus.value?.region_host));
const regionHost = computed(() => appStatus.value?.region_host || t.value.notProvided);
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
        <span class="account-avatar" :class="{ muted: !official.connected.value }" aria-hidden="true">{{ officialInitial }}</span>
        <div class="s-row-main">
          <span class="s-row-title">{{ officialName }}</span>
          <span class="s-row-sub">{{ officialLine }}</span>
        </div>
        <div class="s-row-control">
          <span :class="['state-dot', { on: official.connected.value }]">
            {{ official.connected.value ? t.officialConnected : official.waiting.value ? t.connWaiting : t.officialNotConnected }}
          </span>
          <button v-if="!official.connected.value && !official.waiting.value" class="button primary" type="button"
            :disabled="official.busy.value" @click="official.start">
            {{ official.needsReauth.value ? t.officialReauth : t.officialConnect }}
          </button>
        </div>
      </div>
      <div class="s-row">
        <DesignIcon name="zepp-cloud" :size="36" class="cloud-mark" />
        <div class="s-row-main">
          <span class="s-row-title">{{ t.cloudAdvancedTitle }}<template v-if="appStatus?.masked_user_id"> · <span class="mono">{{ accountLabel }}</span></template></span>
          <span class="s-row-sub" :title="regionHost">
            {{ accountRecognized ? t.accountLine(regionLabel, formatDateTime(appStatus?.last_cloud_sync_at)) : d.cloudSourceSub }}
          </span>
        </div>
        <div class="s-row-control">
          <span :class="['state-dot', { on: accountRecognized }]">{{ connectionLabel }}</span>
          <button v-if="configuredOnly" class="button secondary" type="button" :disabled="isSyncing" @click="verifyAndSync">{{ t.verifyAndSync }}</button>
          <button v-else class="button secondary" type="button" :disabled="loginBusy" @click="startLogin">{{ accountRecognized ? t.reauthenticate : t.authUse }}</button>
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
.mono { font-family: var(--font-mono); }
.cloud-mark { flex: 0 0 auto; border-radius: 11px; }
</style>
