<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue';
import Icon from '../components/Icon.vue';
import { useSyncController } from '../composables/useSyncController';
import { useTheme, type ThemeMode } from '../composables/useTheme';
import { UI_SCALES, useUiScale, type UiScale } from '../composables/useUiScale';
import { backend, toUserMessage } from '../lib/bridge';
import type { LoginStatus } from '../types';

const {
  appStatus,
  statusError,
  syncState,
  syncMessage,
  syncReport,
  isSyncing,
  autoSyncEnabled,
  refreshStatus,
  runSync,
  setAutoSyncEnabled,
  markDataChanged,
} = useSyncController();
const { theme, setTheme } = useTheme();
const { scale, setScale } = useUiScale();

const reconnecting = ref(false);
const loginStatus = ref<LoginStatus>({ state: 'idle', message: '', page_url: '' });
const loginError = ref<string | null>(null);
const loginBusy = ref(false);
let unlistenLogin: (() => void) | undefined;

const dataBusy = ref<string | null>(null);
const dataMessage = ref<string | null>(null);
const dataError = ref<string | null>(null);

const themeOptions: { value: ThemeMode; label: string; icon: 'monitor' | 'sun' | 'moon' }[] = [
  { value: 'system', label: '跟随系统', icon: 'monitor' },
  { value: 'light', label: '浅色', icon: 'sun' },
  { value: 'dark', label: '深色', icon: 'moon' },
];

const connected = computed(() => appStatus.value?.connection_state === 'connected');
const configuredOnly = computed(() => appStatus.value?.connection_state === 'configured');
const needsReauth = computed(() => appStatus.value?.connection_state === 'needs_reauth');
const loginInProgress = computed(() => ['waiting', 'extracting', 'verifying'].includes(String(loginStatus.value.state)));
const showConnectPanel = computed(() => !connected.value || reconnecting.value || loginInProgress.value || loginStatus.value.state === 'failed');
const retentionDays = ref(appStatus.value?.retention_days ?? 365);
const historyDays = ref(appStatus.value?.history_sync_days ?? 30);
const storageEstimate = ref(appStatus.value?.storage ?? null);
const prefsBusy = ref(false);

const connectionLabel = computed(() => {
  if (loginInProgress.value) {
    if (loginStatus.value.state === 'extracting') return '正在提取登录信息';
    if (loginStatus.value.state === 'verifying') return '正在验证';
    return '等待登录';
  }
  if (loginStatus.value.state === 'failed') return '登录失败';
  if (needsReauth.value) return '需要重新连接';
  if (connected.value) return '已连接';
  if (configuredOnly.value) return '待验证';
  return '未连接';
});
const connectionDescription = computed(() => {
  if (loginInProgress.value) return loginStatus.value.message || '请在弹出窗口完成 Zepp 登录。';
  if (loginStatus.value.state === 'failed') return loginStatus.value.message || '登录未完成，请重试。';
  if (needsReauth.value) return 'Zepp 已拒绝当前认证，请重新登录。';
  if (connected.value) return `已通过你的 Zepp 账号安全连接，可同步健康数据到本地。账号 ${appStatus.value?.masked_user_id || '已保存'}。`;
  if (configuredOnly.value) return '认证已保存，但还没有通过云端验证。请点「验证并同步」。';
  return '在弹出的窗口里登录 Zepp 账号。登录信息只保存在本机。';
});
const formatDateTime = (value?: string): string => {
  if (!value) return '尚无记录';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '时间未知';
  return new Intl.DateTimeFormat('zh-CN', {
    year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
  }).format(date);
};
const streamName = (stream: string): string => ({
  heart_rate: '心率', hrv: '心率变异性', daily_summary: '每日概览', sleep: '睡眠', workouts: '运动', startup: '启动状态',
}[stream] || stream);
const streamState = (status: string, needs = false): string => {
  if (needs) return '需要重新连接';
  if (/success|complete|ok/i.test(status)) return '可用';
  if (/unavailable/i.test(status)) return '不可用';
  if (/unverified/i.test(status)) return '未验证';
  if (/fail|error/i.test(status)) return '失败';
  return status || '等待同步';
};
const streamTone = (status: string, needs = false): string => {
  if (needs || /fail|error/i.test(status)) return 'danger';
  if (/unavailable|unverified/i.test(status)) return 'warning';
  if (/success|complete|ok/i.test(status)) return 'success';
  return 'neutral';
};
const lastOutcomeLabel = computed(() => {
  const outcome = appStatus.value?.last_cloud_sync_outcome;
  if (outcome === 'updated') return '成功';
  if (outcome === 'no_new_data') return '暂无新数据';
  if (outcome === 'partial') return '部分完成';
  if (outcome === 'failed') return '失败';
  return '尚无记录';
});

const applyLoginStatus = async (status: LoginStatus) => {
  loginStatus.value = status;
  if (status.state === 'connected') {
    reconnecting.value = false;
    loginError.value = null;
    await refreshStatus();
    if (!appStatus.value?.last_cloud_sync_at) void runSync('incremental');
  }
  if (status.state === 'failed') {
    loginError.value = status.message || '登录未完成';
  }
};

const startLogin = async () => {
  loginError.value = null;
  loginBusy.value = true;
  reconnecting.value = true;
  try {
    await applyLoginStatus(await backend.startWebLogin());
  } catch (error) {
    loginStatus.value = { state: 'failed', message: toUserMessage(error, '无法打开登录窗口'), page_url: '' };
    loginError.value = toUserMessage(error, '无法打开登录窗口');
  } finally {
    loginBusy.value = false;
  }
};

const cancelLogin = async () => {
  loginBusy.value = true;
  try {
    await applyLoginStatus(await backend.cancelWebLogin());
    reconnecting.value = false;
    loginError.value = null;
  } catch (error) {
    loginError.value = toUserMessage(error, '无法取消登录');
  } finally {
    loginBusy.value = false;
  }
};

const verifyAndSync = async () => {
  try {
    await backend.verifyAuth();
    await refreshStatus();
    await runSync('incremental');
  } catch (error) {
    dataError.value = toUserMessage(error, '验证未完成');
  }
};

const clampDays = (value: number) => Math.min(365, Math.max(1, Math.round(value) || 1));
const bumpRetention = (delta: number) => { retentionDays.value = clampDays(Number(retentionDays.value) + delta); };
const bumpHistory = (delta: number) => { historyDays.value = clampDays(Number(historyDays.value) + delta); };

const clearAuth = async () => {
  if (!window.confirm('确定清除认证信息吗？本地健康数据会保留。')) return;
  dataError.value = null;
  try {
    await backend.clearAuth();
    await refreshStatus();
    reconnecting.value = false;
    loginStatus.value = { state: 'idle', message: '', page_url: '' };
    dataMessage.value = '认证已清除，本地健康数据仍保留。';
  } catch (error) {
    dataError.value = toUserMessage(error, '无法清除认证信息');
  }
};
const reprocessLocalData = async () => {
  dataBusy.value = 'reprocess';
  dataError.value = null;
  dataMessage.value = null;
  try {
    const result = await backend.reprocessLocalData();
    dataMessage.value = `本地数据已重新解析，共 ${result.total_records} 条标准化记录；云端同步时间未改变。`;
    markDataChanged();
    await refreshStatus();
  } catch (error) {
    dataError.value = toUserMessage(error, '重新解析本地数据失败');
  } finally {
    dataBusy.value = null;
  }
};
const cleanupData = async () => {
  if (!window.confirm(`确定清理 ${retentionDays.value} 天以前的本地数据吗？此操作无法撤销。`)) return;
  dataBusy.value = 'cleanup';
  dataError.value = null;
  try {
    await backend.cleanupOldData(retentionDays.value);
    dataMessage.value = `已清理 ${retentionDays.value} 天以前的数据。`;
    markDataChanged();
  } catch (error) {
    dataError.value = toUserMessage(error, '清理旧数据失败');
  } finally {
    dataBusy.value = null;
  }
};
const openDataFolder = async () => {
  try { await backend.openDataFolder(); }
  catch (error) { dataError.value = toUserMessage(error, '无法打开数据文件夹'); }
};

const savePrefs = async () => {
  const retention = clampDays(Number(retentionDays.value));
  const history = clampDays(Number(historyDays.value));
  retentionDays.value = retention;
  historyDays.value = history;
  if (retention < (appStatus.value?.retention_days ?? 365)) {
    if (!window.confirm(`下次成功同步将删除 ${retention} 天以前的本地数据，不可恢复。确定吗？`)) return;
  }
  prefsBusy.value = true;
  try {
    const prefs = await backend.setUserPrefs(retention, history);
    retentionDays.value = prefs.retention_days;
    historyDays.value = prefs.history_sync_days;
    storageEstimate.value = await backend.getStorageEstimate(history);
    dataMessage.value = '已保存本地保留与历史补拉设置。';
    await refreshStatus();
  } catch (error) {
    dataError.value = toUserMessage(error, '无法保存设置');
  } finally {
    prefsBusy.value = false;
  }
};
const confirmHistorySync = async () => {
  if (isSyncing.value) {
    dataError.value = '当前有同步进行中，请稍后再补拉';
    return;
  }
  const days = clampDays(Number(historyDays.value));
  historyDays.value = days;
  if (days >= 90) {
    const minutes = Math.max(2, Math.round(0.75 + days * 0.05));
    const extra = days >= 365 ? '\n一年是上限，更早的云端记录不会进入本机。' : '';
    if (!window.confirm(`补拉 ${days} 天大约需要 ${minutes}–${minutes + 3} 分钟（估算）。请保持应用打开，可随时取消。${extra}`)) return;
  }
  if (storageEstimate.value && !storageEstimate.value.allow_long_history && days >= 90) {
    dataError.value = storageEstimate.value.message;
    return;
  }
  if (storageEstimate.value?.warn_tight_space && !window.confirm(`${storageEstimate.value.message}\n仍要按 ${days} 天补拉吗？建议先选 30 天。`)) return;
  await runSync('history', days);
};

onMounted(async () => {
  const status = await refreshStatus();
  retentionDays.value = status?.retention_days ?? 365;
  historyDays.value = status?.history_sync_days ?? 30;
  storageEstimate.value = status?.storage ?? null;
  try {
    unlistenLogin = await backend.listen<LoginStatus>('login://status', (payload) => { void applyLoginStatus(payload); });
    await applyLoginStatus(await backend.getLoginStatus());
  } catch {
    // Browser preview has no login IPC.
  }
});
onUnmounted(() => {
  unlistenLogin?.();
});
</script>

<template>
  <section class="page settings-page" aria-labelledby="settings-title">
    <header class="page-header">
      <div>
        <h1 id="settings-title">设置</h1>
        <p class="page-intro">常用设置保持在前；维护工具仅在需要时展开。</p>
      </div>
    </header>

    <div v-if="statusError" class="alert danger" role="alert"><Icon name="warning" :size="15" />{{ statusError }}<button type="button" @click="() => refreshStatus()">重试</button></div>

    <section class="settings-section cloud-card" aria-labelledby="connection-title">
      <div class="section-heading">
        <div>
          <h2 id="connection-title">Zepp 云端</h2>
          <p class="section-description">{{ connectionDescription }}</p>
        </div>
        <div class="cloud-actions">
          <span :class="['state-chip', loginStatus.state === 'failed' || needsReauth ? 'danger' : connected && !reconnecting ? 'success' : 'neutral']">
            <span class="status-dot"></span>{{ connectionLabel }}
          </span>
          <button v-if="loginInProgress" class="button secondary" type="button" :disabled="loginBusy" @click="cancelLogin">取消登录</button>
          <button v-else-if="!connected || reconnecting || loginStatus.state === 'failed'" class="button primary" type="button" :disabled="loginBusy" @click="startLogin">
            {{ loginBusy ? '正在打开…' : loginStatus.state === 'failed' ? '重试连接' : '连接' }}
          </button>
          <button v-else-if="configuredOnly" class="button primary" type="button" :disabled="isSyncing" @click="verifyAndSync">验证并同步</button>
          <button v-else class="button primary" type="button" :disabled="isSyncing" @click="runSync('incremental')">
            <Icon name="sync" :size="15" />{{ isSyncing ? '正在同步…' : '立即同步' }}
          </button>
        </div>
      </div>
      <div class="meta-row">
        <span><Icon name="cloud" :size="14" />最新同步 {{ formatDateTime(appStatus?.last_cloud_sync_at) }}</span>
        <span><Icon name="circle-check" :size="14" />上次结果 {{ lastOutcomeLabel }}</span>
      </div>
      <div v-if="syncState !== 'idle'" :class="['sync-result', syncState]" role="status">
        <Icon :name="syncState === 'failed' ? 'warning' : syncState === 'updated' ? 'circle-check' : 'info'" :size="15" />
        <div><strong>{{ syncMessage }}</strong></div>
      </div>
      <div v-if="loginError" class="alert danger" role="alert"><Icon name="warning" :size="15" />{{ loginError }}</div>
      <div v-if="connected && !loginInProgress" class="connection-actions">
        <button class="button secondary" type="button" @click="startLogin">重新连接</button>
      </div>
    </section>

    <div class="settings-grid">
      <section class="settings-section" aria-labelledby="automatic-title">
        <div class="setting-row">
          <div>
            <h2 id="automatic-title">自动同步</h2>
            <p>应用打开期间每 15 分钟自动同步。关窗口会留在托盘，点托盘「退出」才停止。</p>
          </div>
          <button class="switch" type="button" role="switch" :aria-checked="autoSyncEnabled" @click="setAutoSyncEnabled(!autoSyncEnabled)"><span></span></button>
        </div>
      </section>

      <section class="settings-section" aria-labelledby="retention-title">
        <h2 id="retention-title">保留天数</h2>
        <p class="section-description">本地保留的健康数据天数。超过后会在下次成功同步时清理。</p>
        <div class="stepper">
          <button type="button" :disabled="retentionDays <= 1" @click="bumpRetention(-1)">−</button>
          <input v-model.number="retentionDays" type="number" min="1" max="365" aria-label="本地保留天数" />
          <button type="button" :disabled="retentionDays >= 365" @click="bumpRetention(1)">+</button>
          <span>天</span>
        </div>
        <p class="section-description tight">{{ storageEstimate?.message || '正在读取磁盘空间…' }}</p>
        <button class="button secondary" type="button" :disabled="prefsBusy" @click="savePrefs">保存天数</button>
      </section>

      <section class="settings-section" aria-labelledby="history-title">
        <h2 id="history-title">历史补拉</h2>
        <p class="section-description">从云端补拉最近多少天的历史数据。</p>
        <div class="stepper">
          <button type="button" :disabled="historyDays <= 1" @click="bumpHistory(-1)">−</button>
          <input v-model.number="historyDays" type="number" min="1" max="365" aria-label="历史补拉天数" />
          <button type="button" :disabled="historyDays >= 365" @click="bumpHistory(1)">+</button>
          <span>天</span>
        </div>
        <button class="button primary" type="button" :disabled="isSyncing || (!connected && !configuredOnly)" @click="confirmHistorySync">开始补拉</button>
      </section>

      <section class="settings-section" aria-labelledby="appearance-title">
        <h2 id="appearance-title">外观主题</h2>
        <p class="section-description">选择应用的外观主题。</p>
        <div class="theme-options" role="radiogroup" aria-label="主题">
          <button v-for="option in themeOptions" :key="option.value" type="button" role="radio" :aria-checked="theme === option.value" @click="setTheme(option.value)">
            <Icon :name="option.icon" :size="16" /><span>{{ option.label }}</span><Icon v-if="theme === option.value" name="check" :size="14" />
          </button>
        </div>
        <p class="section-description tight">界面缩放。100% 为设计基准，也可用 Ctrl + / Ctrl - / Ctrl 0。</p>
        <div class="scale-options" role="radiogroup" aria-label="界面缩放">
          <button
            v-for="option in UI_SCALES"
            :key="option"
            type="button"
            role="radio"
            :aria-checked="scale === option"
            @click="setScale(option as UiScale)"
          >{{ option }}%</button>
        </div>
      </section>
    </div>

    <details class="advanced settings-section">
      <summary><span><strong>高级与隐私</strong><em>维护工具和本地数据管理选项，仅在需要时使用。</em></span><Icon name="chevron-down" :size="16" /></summary>
      <div class="advanced-content">
        <section class="advanced-block">
          <div class="block-heading"><div><h3>同步诊断</h3><p>样本时间与云端拉取时间分开显示；记录数只用于技术排查。</p></div></div>
          <div class="stream-list">
            <div v-for="stream in appStatus?.streams" :key="stream.stream" class="stream-row">
              <div class="stream-main"><strong>{{ streamName(stream.stream) }}</strong><span>最新样本：{{ formatDateTime(stream.newest_sample_at) }}</span><span>云端拉取：{{ formatDateTime(stream.last_cloud_sync_at) }}</span></div>
              <span :class="['stream-state', streamTone(stream.status, stream.needs_reauth)]">{{ streamState(stream.status, stream.needs_reauth) }}</span>
              <details><summary>技术详情</summary><p>处理记录：{{ stream.records ?? 0 }}<br />{{ stream.message || '无附加消息' }}</p></details>
            </div>
          </div>
          <details class="capability-details"><summary>能力状态</summary><ul><li v-for="capability in appStatus?.capabilities" :key="capability.capability"><span>{{ streamName(capability.capability) }}</span><strong>{{ capability.available ? '可用' : (capability.reason || '未验证') }}</strong></li></ul></details>
          <div v-if="syncReport" class="technical-note">本次结果：{{ syncReport.outcome }}；云端返回后处理 {{ syncReport.total_records }} 条记录。</div>
        </section>

        <section class="advanced-block">
          <h3>本地数据与隐私</h3>
          <p>数据库位于：<code>{{ appStatus?.database_path || '应用数据目录' }}</code>。当前保留 {{ retentionDays }} 天。</p>
          <div class="button-row">
            <button class="button secondary" type="button" @click="openDataFolder"><Icon name="folder" :size="15" />打开数据文件夹</button>
            <button class="button secondary" type="button" :disabled="Boolean(dataBusy)" @click="reprocessLocalData">{{ dataBusy === 'reprocess' ? '正在解析…' : '重新解析本地数据' }}</button>
            <button class="button danger-button" type="button" :disabled="Boolean(dataBusy)" @click="cleanupData">清理旧数据</button>
            <button class="button danger-button" type="button" @click="clearAuth">清除认证</button>
          </div>
          <div v-if="dataMessage" class="alert success">{{ dataMessage }}</div>
          <div v-if="dataError" class="alert danger" role="alert">{{ dataError }}</div>
        </section>
      </div>
    </details>

    <details class="advanced settings-section">
      <summary><span><strong>重新连接 Zepp</strong><em>当连接出现问题或需要重新接入时，打开网页登录。</em></span><Icon name="chevron-down" :size="16" /></summary>
      <div class="advanced-content">
        <p class="section-description">点击连接后会弹出 Zepp 登录窗口。完成后状态会自动更新，不用改系统网络设置。</p>
        <div class="button-row">
          <button v-if="loginInProgress" class="button secondary" type="button" :disabled="loginBusy" @click="cancelLogin">取消登录</button>
          <button v-else class="button primary" type="button" :disabled="loginBusy" @click="startLogin">{{ connected ? '重新连接' : '连接' }}</button>
        </div>
        <p v-if="showConnectPanel && loginStatus.message" class="section-description tight">{{ loginStatus.message }}</p>
      </div>
    </details>
  </section>
</template>

<style scoped>
.page { width: 100%; min-width: 0; margin: 0; padding: 18px 24px 24px; }
.page-header { margin-bottom: 16px; min-width: 0; }
h1, h2, h3, p { margin-top: 0; }
h1 { margin-bottom: 6px; font-size: 22px; font-weight: 650; letter-spacing: -.03em; line-height: 1.2; }
h2 { margin-bottom: 4px; font-size: 15px; font-weight: 650; letter-spacing: -.02em; }
h3 { margin-bottom: 6px; font-size: 14px; }
.page-intro, .section-description, .setting-row p, .advanced-block p { margin-bottom: 0; color: var(--muted); }
.section-description.tight { margin-top: 8px; }
.settings-grid { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: 12px; min-width: 0; }
.settings-grid > * { min-width: 0; }
.settings-section { margin-top: 10px; padding: 14px 16px; border: 1px solid var(--line); border-radius: var(--radius-md); background: var(--surface); min-width: 0; }
.settings-grid .settings-section { margin-top: 0; }
.section-heading, .setting-row, .block-heading { display: flex; align-items: flex-start; justify-content: space-between; gap: 18px; min-width: 0; }
.cloud-actions { display: flex; flex-wrap: wrap; align-items: center; justify-content: flex-end; gap: 8px; min-width: 0; }
.state-chip { display: inline-flex; min-height: 28px; align-items: center; gap: 7px; padding: 4px 9px; border: 1px solid var(--line); border-radius: 999px; color: var(--muted); font-size: 11px; }
.state-chip.success, .stream-state.success { color: var(--accent); }
.state-chip.danger, .stream-state.danger { color: var(--danger); }
.stream-state.warning { color: var(--warning); }
.status-dot { width: 6px; height: 6px; border-radius: 50%; background: currentColor; }
.meta-row { display: flex; flex-wrap: wrap; gap: 16px; margin-top: 14px; color: var(--muted); font-size: 12px; }
.meta-row span { display: inline-flex; align-items: center; gap: 6px; min-width: 0; }
.connection-actions, .button-row { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 16px; }
.button { display: inline-flex; min-height: 34px; align-items: center; justify-content: center; gap: 7px; padding: 6px 12px; border: 1px solid transparent; border-radius: var(--radius-sm); background: transparent; font-size: 12px; font-weight: 650; cursor: pointer; }
.button:disabled { opacity: .5; cursor: not-allowed; }
.button.primary { background: var(--accent); color: var(--accent-ink); }
.button.secondary, .button.quiet { border-color: var(--line); color: var(--muted); }
.button.secondary:hover, .button.quiet:hover { border-color: var(--accent); color: var(--accent); }
.danger-button { border-color: #7A3034; color: var(--danger); }
.sync-result { display: flex; align-items: flex-start; gap: 9px; margin-top: 16px; padding-top: 14px; border-top: 1px solid var(--line); color: var(--muted); }
.sync-result.updated { color: var(--accent); }
.sync-result.partial { color: var(--warning); }
.sync-result.no_new_data { color: var(--muted); }
.sync-result.failed { color: var(--danger); }
.sync-result strong, .sync-result span { display: block; }
.stepper { display: flex; align-items: center; gap: 8px; margin: 14px 0 12px; min-width: 0; }
.stepper button { width: 36px; height: 36px; border: 1px solid var(--line); border-radius: 8px; background: var(--surface-raised); color: var(--ink); cursor: pointer; }
.stepper button:disabled { opacity: .4; cursor: not-allowed; }
.stepper input { width: 72px; min-height: 36px; padding: 6px 8px; border: 1px solid var(--line-strong); border-radius: 8px; outline: 0; background: var(--surface-raised); color: var(--ink); text-align: center; }
.stepper input:focus { border-color: var(--accent); }
.stepper span { color: var(--muted); font-size: 12px; }
.setting-row > div { min-width: 0; }
.switch { width: 44px; height: 25px; flex: 0 0 44px; padding: 3px; border: 1px solid var(--line-strong); border-radius: 999px; background: var(--surface-raised); cursor: pointer; }
.switch span { display: block; width: 17px; height: 17px; border-radius: 50%; background: var(--muted); transition: transform 150ms ease, background-color 150ms ease; }
.switch[aria-checked='true'] { border-color: var(--accent); background: var(--accent-soft); }
.switch[aria-checked='true'] span { transform: translateX(19px); background: var(--accent); }
.theme-options { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 7px; margin-top: 12px; }
.theme-options button { display: flex; min-height: 38px; min-width: 0; align-items: center; gap: 8px; padding: 7px 10px; border: 1px solid var(--line); border-radius: var(--radius-sm); background: transparent; color: var(--muted); cursor: pointer; }
.scale-options { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 8px; }
.scale-options button { min-width: 52px; min-height: 32px; padding: 4px 8px; border: 1px solid var(--line); border-radius: var(--radius-sm); background: transparent; color: var(--ink); font-variant-numeric: tabular-nums; cursor: pointer; }
.scale-options button[aria-checked='true'] { border-color: var(--accent); color: var(--accent); background: var(--accent-soft); }
.theme-options button span { flex: 1; color: var(--ink); text-align: left; }
.theme-options button[aria-checked='true'] { border-color: var(--accent); color: var(--accent); background: var(--accent-soft); }
.advanced > summary { display: flex; align-items: center; justify-content: space-between; gap: 12px; cursor: pointer; list-style: none; }
.advanced > summary::-webkit-details-marker { display: none; }
.advanced > summary span { display: grid; gap: 4px; min-width: 0; }
.advanced > summary strong { font-size: 16px; }
.advanced > summary em { color: var(--muted); font-size: 12px; font-style: normal; }
.advanced[open] > summary > svg { transform: rotate(180deg); }
.advanced-content { margin-top: 18px; border-top: 1px solid var(--line); }
.advanced-block { padding: 20px 0; border-bottom: 1px solid var(--line); }
.advanced-block:last-child { border-bottom: 0; padding-bottom: 0; }
.stream-list { margin-top: 14px; border-top: 1px solid var(--line); }
.stream-row { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 6px 18px; padding: 13px 0; border-bottom: 1px solid var(--line); min-width: 0; }
.stream-main { display: flex; flex-wrap: wrap; gap: 5px 14px; min-width: 0; }
.stream-main strong { min-width: 90px; }
.stream-main span { color: var(--muted); font-size: 10px; }
.stream-state { font-size: 11px; }
.stream-row details { grid-column: 1 / -1; }
.stream-row details summary, .capability-details summary { color: var(--muted); font-size: 10px; cursor: pointer; }
.stream-row details p { margin: 7px 0 0; font-family: var(--font-mono); font-size: 10px; }
.capability-details { margin-top: 13px; }
.capability-details ul { margin: 8px 0 0; padding: 0; list-style: none; }
.capability-details li { display: flex; justify-content: space-between; gap: 15px; padding: 7px 0; border-bottom: 1px solid var(--line); color: var(--muted); font-size: 10px; }
.capability-details strong { max-width: 65%; color: var(--ink); text-align: right; }
.technical-note { margin-top: 10px; color: var(--muted); font-family: var(--font-mono); font-size: 10px; }
.alert { display: flex; align-items: flex-start; gap: 7px; margin-top: 12px; padding: 10px 11px; border: 1px solid var(--line); border-radius: var(--radius-sm); color: var(--muted); font-size: 11px; }
.alert.success { color: var(--accent); }
.alert.danger { color: var(--danger); }
.alert button { margin-left: auto; border: 0; background: transparent; color: inherit; cursor: pointer; }
code { color: var(--muted); font-family: var(--font-mono); font-size: 10px; }
@media (max-width: 760px) {
  .page { padding: 24px 16px 38px; }
  .settings-section { padding: 17px 16px; }
  .settings-grid { grid-template-columns: minmax(0, 1fr); }
  .section-heading, .setting-row, .block-heading { align-items: flex-start; }
  .cloud-actions { justify-content: flex-start; }
  .block-heading { flex-direction: column; }
  .theme-options { grid-template-columns: minmax(0, 1fr); }
  .stream-main { display: grid; }
}
@media (prefers-reduced-motion: reduce) { .switch span { transition: none; } }
</style>
