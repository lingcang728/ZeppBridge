<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue';
import DesignIcon from '../components/DesignIcon.vue';
import DeviceVisual from '../components/DeviceVisual.vue';
import Icon from '../components/Icon.vue';
import { useDevices } from '../composables/useDevices';
import { useSyncController } from '../composables/useSyncController';
import { AUTO_SYNC_INTERVALS } from '../lib/autoSync';
import { UI_SCALES, useUiScale, type UiScale } from '../composables/useUiScale';
import { backend, toUserMessage } from '../lib/bridge';
import { regionShortName } from '../lib/deviceCopy';
import type {
  CapabilityItem,
  CapabilityOverview,
  CapabilityProbe,
  LocalApiStatus,
  LoginStatus,
} from '../types';
import { checkForDesktopUpdate, downloadAndInstallDesktopUpdate, updateState } from '../services/updateService';

const {
  appStatus,
  statusError,
  syncState,
  syncMessage,
  isSyncing,
  autoSyncEnabled,
  autoSyncInterval,
  setAutoSyncInterval,
  refreshStatus,
  runSync,
  setAutoSyncEnabled,
  markDataChanged,
} = useSyncController();
const { scale, setScale } = useUiScale();
const {
  models: deviceModels,
  cache: deviceCache,
  loading: devicesLoading,
  error: deviceError,
  load: loadDevices,
  maskIdentifier,
} = useDevices();

const reconnecting = ref(false);
const loginStatus = ref<LoginStatus>({ state: 'idle', message: '', page_url: '' });
const loginError = ref<string | null>(null);
const loginBusy = ref(false);
let unlistenLogin: (() => void) | undefined;

// HAR导入和手动认证
const showManualAuth = ref(false);
const manualAppToken = ref('');
const manualUserId = ref('');
const manualRegionHost = ref('https://api-mifit-us3.zepp.com');
const manualAuthBusy = ref(false);

const dataBusy = ref<string | null>(null);
const dataMessage = ref<string | null>(null);
const dataError = ref<string | null>(null);
const localApiStatus = ref<LocalApiStatus | null>(null);
const deviceRefreshBusy = ref(false);
const deviceRefreshMessage = ref<string | null>(null);
const deviceRefreshError = ref<string | null>(null);
const diagnosticBusy = ref(false);

/* 本地偏好（隐私区开关，仅保存在本机） */
const readLocalPref = (key: string, fallback: boolean) => {
  const raw = window.localStorage.getItem(key);
  return raw === null ? fallback : raw === '1';
};
const localEncrypt = ref(readLocalPref('zeppbridge-pref-encrypt', true));
const launchLock = ref(readLocalPref('zeppbridge-pref-launch-lock', false));
const anonymousUsage = ref(readLocalPref('zeppbridge-pref-anon', false));
const toggleLocalPref = (key: string, target: { value: boolean }) => {
  target.value = !target.value;
  window.localStorage.setItem(key, target.value ? '1' : '0');
};
const toggleEncrypt = () => toggleLocalPref('zeppbridge-pref-encrypt', localEncrypt);
const toggleLaunchLock = () => toggleLocalPref('zeppbridge-pref-launch-lock', launchLock);
const toggleAnonymous = () => toggleLocalPref('zeppbridge-pref-anon', anonymousUsage);

/* 默认导出格式持久化 */
const defaultExportFormat = ref(window.localStorage.getItem('zeppbridge-default-export-format') || 'json');
const onExportFormatChange = () => {
  window.localStorage.setItem('zeppbridge-default-export-format', defaultExportFormat.value);
};

/* 隐私政策弹窗 */
const privacyModalOpen = ref(false);
const updateInstallArmed = ref(false);
const updateBusy = computed(() => ['checking', 'downloading', 'installing'].includes(updateState.status));
const updateProgress = computed(() => updateState.totalBytes
  ? Math.min(100, Math.round(updateState.downloadedBytes / updateState.totalBytes * 100))
  : null);
const updateStatusLabel = computed(() => ({
  idle: '尚未检查',
  checking: '正在检查 GitHub Release',
  available: `发现新版本 ${updateState.version}`,
  downloading: updateProgress.value === null ? '正在下载更新' : `正在下载 ${updateProgress.value}%`,
  installing: '正在安装，完成后会自动重启',
  failed: '更新失败',
  upToDate: '当前已是最新版本',
}[updateState.status]));

const formatUpdateBytes = (bytes: number) => bytes < 1024 * 1024
  ? `${(bytes / 1024).toFixed(1)} KB`
  : `${(bytes / 1024 / 1024).toFixed(1)} MB`;

const installUpdate = async () => {
  updateInstallArmed.value = false;
  await downloadAndInstallDesktopUpdate();
};

const connected = computed(() => appStatus.value?.connection_state === 'connected');
const configuredOnly = computed(() => appStatus.value?.connection_state === 'configured');
const accountRecognized = computed(() => connected.value || configuredOnly.value);
const loginInProgress = computed(() => ['waiting', 'extracting', 'verifying'].includes(String(loginStatus.value.state)));
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
  if (connected.value || configuredOnly.value) return '账号已识别';
  return '未识别';
});

const accountLabel = computed(() => appStatus.value?.masked_user_id || '未识别');
const accountInitial = computed(() => accountLabel.value.match(/[A-Za-z0-9]/)?.[0]?.toUpperCase() || '未');
const regionLabel = computed(() => regionShortName(appStatus.value?.region_host));
const regionHost = computed(() => appStatus.value?.region_host || '未提供');

const formatDateTime = (value?: string): string => {
  if (!value) return '尚无记录';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '时间未知';
  return new Intl.DateTimeFormat('zh-CN', {
    year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
  }).format(date).replace(/\//g, '-');
};

const cleanupDate = computed(() => {
  const date = new Date();
  date.setDate(date.getDate() + Number(retentionDays.value || 30));
  return new Intl.DateTimeFormat('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit' }).format(date).replace(/\//g, '-');
});

const dataSources = computed(() => [
  {
    kind: 'cloud' as const,
    name: 'Zepp Cloud',
    sub: '云服务',
    icon: 'cloud' as const,
    state: accountRecognized.value ? '账号已识别' : '未识别',
  },
  ...deviceModels.value.map((model) => ({
    kind: 'device' as const,
    name: model.canonicalName,
    sub: model.displayName,
    model,
    state: model.state,
  })),
]);

const refreshDevices = async () => {
  deviceRefreshBusy.value = true;
  deviceRefreshMessage.value = null;
  deviceRefreshError.value = null;
  try {
    await loadDevices(true);
    const refreshError = deviceCache.value?.refresh_error || deviceError.value;
    if (refreshError || deviceCache.value?.status === 'refresh_failed') {
      deviceRefreshError.value = `重新识别失败，已回退到本机缓存${refreshError ? `：${refreshError}` : '。'}`;
    } else if (deviceCache.value?.refreshed) {
      deviceRefreshMessage.value = `设备识别完成，共发现 ${deviceModels.value.length} 个实体设备。`;
    } else {
      deviceRefreshMessage.value = '未获得新的设备列表，当前显示本机缓存。';
    }
  } finally {
    deviceRefreshBusy.value = false;
  }
};

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

// HAR导入
const importHar = async () => {
  try {
    const { open } = await import('@tauri-apps/plugin-dialog');
    const selected = await open({
      multiple: false,
      filters: [{ name: 'HAR文件', extensions: ['har', 'json'] }],
    });
    if (!selected) return;
    loginBusy.value = true;
    loginError.value = null;
    try {
      const harPath = typeof selected === 'string' ? selected : (selected as { path: string }).path;
      await backend.importFromHar(harPath);
      await refreshStatus();
      loginError.value = null;
      dataMessage.value = 'HAR文件导入成功，认证信息已保存。';
    } catch (error) {
      loginError.value = toUserMessage(error, 'HAR导入失败');
    } finally {
      loginBusy.value = false;
    }
  } catch (error) {
    loginError.value = toUserMessage(error, '无法打开文件选择器');
  }
};

// 手动认证
const submitManualAuth = async () => {
  if (!manualAppToken.value || !manualUserId.value || !manualRegionHost.value) {
    loginError.value = '请填写所有必填字段';
    return;
  }
  manualAuthBusy.value = true;
  loginError.value = null;
  try {
    await backend.manualAuth(
      manualAppToken.value.trim(),
      manualUserId.value.trim(),
      manualRegionHost.value.trim(),
    );
    await refreshStatus();
    showManualAuth.value = false;
    manualAppToken.value = '';
    manualUserId.value = '';
    manualRegionHost.value = 'https://api-mifit-us3.zepp.com';
    dataMessage.value = '手动认证成功，认证信息已保存。';
  } catch (error) {
    loginError.value = toUserMessage(error, '手动认证失败');
  } finally {
    manualAuthBusy.value = false;
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
    storageEstimate.value = await backend.getStorageEstimate(retentionDays.value).catch(() => null);
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

const copyLocalApiExample = async () => {
  const baseUrl = localApiStatus.value?.base_url || 'http://127.0.0.1:43921';
  try {
    await navigator.clipboard.writeText(`curl.exe "${baseUrl}/workouts/WORKOUT_ID/series"`);
    dataMessage.value = '本机 API 调用示例已复制。';
  } catch {
    dataError.value = '无法复制调用示例，请手动复制接口地址。';
  }
};

const copyDiagnosticReport = async () => {
  diagnosticBusy.value = true;
  dataError.value = null;
  dataMessage.value = null;
  try {
    const report = await backend.getDiagnosticReport();
    await navigator.clipboard.writeText(JSON.stringify(report, null, 2));
    dataMessage.value = 'Issue #3 脱敏诊断已复制，可直接粘贴到 GitHub；请勿另附 raw、token 或健康截图。';
  } catch (error) {
    dataError.value = toUserMessage(error, '生成脱敏诊断失败');
  } finally {
    diagnosticBusy.value = false;
  }
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
    try {
      storageEstimate.value = await backend.getStorageEstimate(history);
    } catch {
      dataError.value = '设置已保存，但磁盘空间估算暂时不可用';
    }
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
  void loadCapabilityOverview();
  void loadDevices();
  localApiStatus.value = await backend.getLocalApiStatus().catch(() => null);
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
/* ── 设备能力总览 ─────────────────────────
 * 能力是关于这个账号的事实，和心率一样应该顺带拿到，而不是让用户按一下按钮才知道。
 * 十五项由库里已有的数据直接判定（零请求）；只有血压、体重、情绪三项在本地
 * 没有任何痕迹，需要真实请求，那部分在同步时静默完成、每周一次。 */
const capabilityOverview = ref<CapabilityOverview | null>(null);
const capabilityError = ref<string | null>(null);
const probeBusy = ref(false);
const probeResults = ref<CapabilityProbe[] | null>(null);

const streamLabels: Record<string, string> = {
  heart_rate: '心率',
  sleep: '睡眠',
  workouts: '运动',
  steps: '步数',
  daily_activity: '日常活动',
  stress: '压力',
  spo2: '血氧 SpO₂',
  respiratory_rate: '呼吸率',
  hrv: 'HRV (SDNN)',
  hrv_rmssd: 'HRV (RMSSD)',
  recovery: '恢复与能量',
  training_load: '训练负荷',
  vo2max: 'VO₂max',
  lactate_threshold: '乳酸阈值',
  pai: 'PAI 活力指数',
  blood_pressure: '血压',
  weight: '体重',
  emotion: '情绪',
  second_heart_rate: '逐秒心率索引',
  spo2_files: '血氧原始文件索引',
};

const surfaceLabels: Record<string, string> = {
  v2_events: '/v2/users/me/events',
  user_events: '/users/{id}/events',
  user_events_day: '/users/{id}/events/dateString',
  file_info_events: '/users/me/fileInfo/events',
};

const capabilityRow = (item: CapabilityItem) => ({
  key: item.stream,
  label: streamLabels[item.stream] ?? item.stream,
  detail:
    item.status === 'available'
      ? `${item.records} ${item.recordsUnit}${item.latestDate ? ` · 至 ${item.latestDate}` : ''}`
      : (item.note ?? ''),
});

const capabilityAvailable = computed(() =>
  (capabilityOverview.value?.items ?? [])
    .filter((item) => item.status === 'available')
    .map(capabilityRow),
);

const capabilityMissing = computed(() =>
  (capabilityOverview.value?.items ?? [])
    .filter((item) => item.status !== 'available')
    .map(capabilityRow),
);

const capabilityCheckedAt = computed(() => {
  const raw = capabilityOverview.value?.probedAt;
  if (!raw) return null;
  const then = new Date(raw).getTime();
  if (!Number.isFinite(then)) return null;
  const days = Math.floor((Date.now() - then) / 86400000);
  return days <= 0 ? '今天检测' : `${days} 天前检测`;
});

const loadCapabilityOverview = async () => {
  capabilityError.value = null;
  try {
    capabilityOverview.value = await backend.getCapabilityOverview();
  } catch (error) {
    capabilityError.value = toUserMessage(error);
  }
};

/** One line per probed endpoint — for diagnosing, not for reading. */
const probeDiagnostics = computed(() => {
  if (!probeResults.value) return [];
  return probeResults.value.map((probe) => {
    const name = `${probe.eventType}${probe.subType ? '/' + probe.subType : ''}`;
    const surface = surfaceLabels[probe.surface] ?? probe.surface;
    const result =
      probe.status === 'available'
        ? `${probe.records} 条${probe.latestDate ? `，最新 ${probe.latestDate}` : ''}`
        : probe.status === 'empty'
          ? '无数据'
          : probe.status === 'unavailable'
            ? '接口拒绝'
            : '请求失败';
    return `${name} @ ${surface} — ${result}`;
  });
});

const runCapabilityProbe = async () => {
  probeBusy.value = true;
  capabilityError.value = null;
  try {
    probeResults.value = await backend.probeDataCapabilities();
    await loadCapabilityOverview();
  } catch (error) {
    capabilityError.value = toUserMessage(error);
  } finally {
    probeBusy.value = false;
  }
};

</script>

<template>
  <section class="page settings-page" aria-labelledby="settings-title">
    <header class="page-header">
      <div>
        <h1 id="settings-title">设置</h1>
        <p class="page-intro">管理认证方式、同步行为、隐私与默认导出偏好，确保本地数据安全。</p>
      </div>
    </header>

    <div v-if="statusError" class="alert danger" role="alert">
      <Icon name="warning" :size="15" />{{ statusError }}
      <button type="button" @click="() => refreshStatus()">重试</button>
    </div>
    <div v-if="syncState !== 'idle'" :class="['alert', syncState === 'failed' ? 'danger' : 'success']" role="status">
      <Icon :name="syncState === 'failed' ? 'warning' : 'info'" :size="15" />{{ syncMessage }}
    </div>
    <div v-if="loginError" class="alert danger" role="alert"><Icon name="warning" :size="15" />{{ loginError }}</div>
    <div v-if="dataMessage" class="alert success"><Icon name="circle-check" :size="15" />{{ dataMessage }}</div>
    <div v-if="dataError" class="alert danger" role="alert"><Icon name="warning" :size="15" />{{ dataError }}</div>

    <!-- 1. 认证方式 -->
    <section class="settings-card" aria-labelledby="auth-title">
      <h2 id="auth-title">1. 认证方式</h2>
      <div class="auth-grid">
        <div :class="['auth-card', { current: connected || configuredOnly }]">
          <div class="auth-head">
            <span class="auth-icon"><Icon name="globe" :size="18" /></span>
            <div>
              <strong>官方网页登录</strong>
              <p>通过官方页面登录，自动抓取 appToken</p>
            </div>
          </div>
          <button v-if="loginInProgress" class="auth-action" type="button" :disabled="loginBusy" @click="cancelLogin">取消登录</button>
          <button v-else-if="connected && !reconnecting" class="auth-action is-current" type="button" @click="startLogin">
            当前使用 <Icon name="circle-check" :size="14" />
          </button>
          <button v-else class="auth-action" type="button" :disabled="loginBusy" @click="startLogin">
            {{ loginBusy ? '正在打开…' : loginStatus.state === 'failed' ? '重试连接' : '使用' }}
          </button>
        </div>
        <div class="auth-card">
          <div class="auth-head">
            <span class="auth-icon"><Icon name="file" :size="18" /></span>
            <div>
              <strong>HAR 导入</strong>
              <p>适合高级用户与调试，快速导入 HAR 文件</p>
            </div>
          </div>
          <button class="auth-action" type="button" :disabled="loginBusy" @click="importHar">使用</button>
        </div>
        <div class="auth-card">
          <div class="auth-head">
            <span class="auth-icon"><Icon name="edit" :size="18" /></span>
            <div>
              <strong>手动填写</strong>
              <p>手动填写 appToken、user_id 等信息</p>
            </div>
          </div>
          <button class="auth-action" type="button" @click="showManualAuth = !showManualAuth">{{ showManualAuth ? '收起' : '使用' }}</button>
        </div>
      </div>
      <p v-if="loginInProgress && loginStatus.message" class="hint-line"><Icon name="info" :size="13" />{{ loginStatus.message }}</p>

      <!-- 手动认证表单 -->
      <div v-if="showManualAuth" class="manual-auth-form">
        <h3>手动输入认证信息</h3>
        <p class="form-hint">从 mitmproxy/Charles 抓包或浏览器开发者工具获取。需要三个字段：</p>
        <div class="form-group">
          <label for="manual-apptoken">App Token *</label>
          <input id="manual-apptoken" v-model="manualAppToken" type="text" placeholder="从 HTTP 请求头 apptoken 字段复制" :disabled="manualAuthBusy" />
        </div>
        <div class="form-group">
          <label for="manual-userid">User ID *</label>
          <input id="manual-userid" v-model="manualUserId" type="text" placeholder="从 URL 路径 /users/{user_id}/ 提取" :disabled="manualAuthBusy" />
        </div>
        <div class="form-group">
          <label for="manual-host">Region Host *</label>
          <input id="manual-host" v-model="manualRegionHost" type="text" placeholder="https://api-mifit-us3.zepp.com" :disabled="manualAuthBusy" />
        </div>
        <div class="form-actions">
          <button class="button primary" type="button" :disabled="manualAuthBusy" @click="submitManualAuth">
            {{ manualAuthBusy ? '保存中...' : '保存认证' }}
          </button>
          <button class="button secondary" type="button" :disabled="manualAuthBusy" @click="showManualAuth = false">取消</button>
        </div>
      </div>
    </section>

    <!-- 2 列网格：账户与区域 + 连接设备 -->
    <div class="two-col">
      <!-- 2. 账户与区域 -->
      <section id="account-section" class="settings-card account-card" aria-labelledby="account-title">
        <h2 id="account-title">2. 账户与区域</h2>
        <div class="account-strip">
          <span class="account-avatar">{{ accountInitial }}</span>
          <div class="account-meta">
            <strong>{{ accountLabel }}</strong>
            <span :title="regionHost">区域 {{ regionLabel }} · 上次同步 {{ formatDateTime(appStatus?.last_cloud_sync_at) }}</span>
          </div>
          <span :class="['account-state', { on: accountRecognized }]"><i class="dot"></i>{{ connectionLabel }}</span>
          <button v-if="configuredOnly" class="kv-btn" type="button" :disabled="isSyncing" @click="verifyAndSync">验证并同步</button>
          <button v-else class="kv-btn" type="button" :disabled="loginBusy" @click="startLogin">重新认证</button>
        </div>
      </section>

      <!-- 3. 连接设备 / 数据来源 -->
      <section class="settings-card" aria-labelledby="devices-title">
        <div class="section-heading-row">
          <h2 id="devices-title">3. 连接设备 / 数据来源</h2>
          <button class="button secondary identify-button" type="button" :disabled="deviceRefreshBusy" @click="refreshDevices">
            <Icon name="sync" :size="14" :class="{ spinning: deviceRefreshBusy }" />
            {{ deviceRefreshBusy ? '正在识别…' : '重新识别设备' }}
          </button>
        </div>
        <div v-if="deviceRefreshError" class="alert danger device-alert" role="alert"><Icon name="warning" :size="14" />{{ deviceRefreshError }}</div>
        <div v-if="deviceRefreshMessage" class="alert success device-alert" role="status"><Icon name="circle-check" :size="14" />{{ deviceRefreshMessage }}</div>
        <div v-if="deviceError && !deviceRefreshError" class="alert warning device-alert" role="status"><Icon name="info" :size="14" />设备识别：{{ deviceError }}</div>

        <div v-if="devicesLoading" class="source-list source-list-loading">
          <div class="source-row skeleton-row"></div>
          <div class="source-row skeleton-row"></div>
        </div>
        <div v-else class="source-list">
          <div v-if="!deviceModels.length" class="device-empty">
            <Icon name="watch" :size="16" />尚未识别实体设备；Zepp Cloud 仍可作为云服务同步。
          </div>
          <div v-for="source in dataSources" :key="source.name" class="source-row">
            <span class="source-icon">
              <DeviceVisual v-if="source.kind === 'device'" :src="source.model.image" :alt="source.name" :kind="source.model.kind" compact />
              <DesignIcon v-else name="zepp-cloud" :size="32" />
            </span>
            <div class="source-copy">
              <strong>{{ source.name }}</strong>
              <span>{{ source.sub }}</span>
              <span v-if="source.kind === 'device'">固件 {{ source.model.firmware }} · 最近数据 {{ source.model.lastData }}</span>
              <span v-if="source.kind === 'device'">设备 ID {{ maskIdentifier(source.model.profile.device_id || source.model.profile.serial) }}</span>
            </div>
            <span :class="['source-state', { on: source.state !== '未识别' }]"><i class="dot"></i>{{ source.state }}</span>
          </div>
        </div>
      </section>

    </div>

    <section class="settings-card" aria-labelledby="capability-title">
      <div class="section-heading-row">
        <h2 id="capability-title">你的设备能提供什么</h2>
        <span v-if="capabilityCheckedAt" class="capability-checked">{{ capabilityCheckedAt }}</span>
      </div>
      <p class="section-description">
        以下是 ZeppBridge 目前能从你的账号读到的数据。这份清单在同步时自动更新，无需手动操作。
      </p>
      <div v-if="capabilityError" class="alert danger device-alert" role="alert">
        <Icon name="warning" :size="14" />{{ capabilityError }}
      </div>

      <div v-if="capabilityOverview" class="capability-columns">
        <div class="capability-column">
          <p class="capability-heading">可提供给 AI<em>{{ capabilityAvailable.length }}</em></p>
          <ul class="capability-list">
            <li v-for="row in capabilityAvailable" :key="row.key" class="capability-row">
              <Icon name="circle-check" :size="15" class="capability-yes" />
              <span class="capability-copy">
                <strong>{{ row.label }}</strong>
                <span>{{ row.detail }}</span>
              </span>
            </li>
            <li v-if="!capabilityAvailable.length" class="capability-empty">尚未同步到任何数据。</li>
          </ul>
        </div>
        <div class="capability-column">
          <p class="capability-heading">暂未获取到<em>{{ capabilityMissing.length }}</em></p>
          <ul class="capability-list">
            <li v-for="row in capabilityMissing" :key="row.key" class="capability-row">
              <Icon name="dots" :size="15" class="capability-no" />
              <span class="capability-copy">
                <strong>{{ row.label }}</strong>
                <span>{{ row.detail }}</span>
              </span>
            </li>
            <li v-if="!capabilityMissing.length" class="capability-empty">全部数据流都已获取。</li>
          </ul>
        </div>
      </div>

      <details class="probe-diagnostics">
        <summary>接口诊断详情</summary>
        <p class="probe-selfcheck">
          「暂未获取到」不等于设备不支持：Zepp 的接口对不存在的数据流也返回空响应，
          只有接口明确拒绝时才会写成「你的设备不提供」。
        </p>
        <button class="button secondary identify-button" type="button" :disabled="probeBusy" @click="runCapabilityProbe">
          <Icon name="sync" :size="14" :class="{ spinning: probeBusy }" />
          {{ probeBusy ? '正在检测…' : '立即重新检测' }}
        </button>
        <ul>
          <li v-for="line in probeDiagnostics" :key="line">{{ line }}</li>
        </ul>
      </details>
    </section>

    <div class="three-col">
      <!-- 4. 隐私安全 -->
      <section id="privacy-section" class="settings-card" aria-labelledby="privacy-title">
        <h2 id="privacy-title">4. 隐私与安全</h2>
        <div class="toggle-list">
          <div class="toggle-row">
            <span class="toggle-icon"><Icon name="lock" :size="14" /></span>
            <div class="toggle-copy">
              <strong>本地数据加密</strong>
              <span>对本地存储的穿戴健康记录进行加密保护</span>
            </div>
            <button class="switch" type="button" role="switch" :aria-checked="localEncrypt" @click="toggleEncrypt"><span></span></button>
          </div>
          <div class="toggle-row">
            <span class="toggle-icon"><Icon name="shield" :size="14" /></span>
            <div class="toggle-copy">
              <strong>启动解锁保护</strong>
              <span>启动应用时验证本地身份权限</span>
            </div>
            <button class="switch" type="button" role="switch" :aria-checked="launchLock" @click="toggleLaunchLock"><span></span></button>
          </div>
          <div class="toggle-row">
            <span class="toggle-icon"><Icon name="user" :size="14" /></span>
            <div class="toggle-copy">
              <strong>匿名使用洞察</strong>
              <span>仅限本地脱敏统计，绝不上传生物特征</span>
            </div>
            <button class="switch" type="button" role="switch" :aria-checked="anonymousUsage" @click="toggleAnonymous"><span></span></button>
          </div>
        </div>
        <button class="privacy-link-btn" type="button" @click="privacyModalOpen = true">
          <Icon name="shield" :size="13" />查看本地隐私与脱敏原则
        </button>
        <div class="diagnostic-panel">
          <strong>设备与运动类型诊断</strong>
          <p>只包含字段名、JSON 类型、布尔状态、计数、目录候选和固件版本；不包含账号、token、序列号、设备 ID、GPS、健康数值、原始响应或本机路径。</p>
          <button class="button secondary" type="button" :disabled="diagnosticBusy" @click="copyDiagnosticReport">
            <Icon name="copy" :size="14" />{{ diagnosticBusy ? '正在生成…' : '复制脱敏诊断' }}
          </button>
        </div>
      </section>

      <!-- 5. 数据保留 -->
      <section class="settings-card" aria-labelledby="retention-title">
        <h2 id="retention-title">5. 本地数据保留</h2>
        <div class="field-row">
          <span class="kv-label">保留时长</span>
          <select v-model.number="retentionDays" aria-label="本地数据保留天数" @change="savePrefs">
            <option :value="30">30 天</option>
            <option :value="90">90 天</option>
            <option :value="180">180 天</option>
            <option :value="365">365 天</option>
          </select>
        </div>
        <p class="retain-note">超过保留时长的数据将自动从本地清理，以释放空间并保障隐私。</p>
        <p class="hint-line">{{ storageEstimate?.message || `将在 ${cleanupDate} 自动清理过期数据` }}</p>
        <div class="inline-actions">
          <button class="button secondary" type="button" :disabled="Boolean(dataBusy)" @click="cleanupData">
            {{ dataBusy === 'cleanup' ? '正在清理…' : '立即清理' }}
          </button>
          <button class="button secondary" type="button" :disabled="Boolean(dataBusy)" @click="reprocessLocalData">
            {{ dataBusy === 'reprocess' ? '正在解析…' : '重新解析' }}
          </button>
        </div>
      </section>

      <!-- 6. 导出默认值 -->
      <section class="settings-card" aria-labelledby="export-title">
        <h2 id="export-title">6. 导出与补拉偏好</h2>
        <div class="field-row">
          <span class="kv-label">默认导出格式</span>
          <select v-model="defaultExportFormat" aria-label="默认导出格式" @change="onExportFormatChange">
            <option value="json">JSON（结构化数据）</option>
            <option value="csv">CSV（表格数据）</option>
            <option value="gpx">GPX（运动轨迹）</option>
          </select>
        </div>
        <div class="field-row">
          <span class="kv-label">历史补拉范围</span>
          <select v-model.number="historyDays" aria-label="历史补拉天数" @change="savePrefs">
            <option :value="7">最近 7 天</option>
            <option :value="30">最近 30 天</option>
            <option :value="90">最近 90 天</option>
            <option :value="365">最近 365 天</option>
          </select>
        </div>
        <p class="retain-note">设置「交给 AI」页面的默认格式与云端补拉窗口。</p>
        <div class="inline-actions">
          <button class="button primary" type="button" :disabled="isSyncing || (!connected && !configuredOnly) || prefsBusy" @click="confirmHistorySync">
            开始历史补拉
          </button>
        </div>
      </section>
    </div>

    <!-- 7. 本机 API -->
    <section class="settings-card api-card" aria-labelledby="api-title">
      <div class="api-head">
        <span class="api-icon"><Icon name="braces" :size="20" /></span>
        <div>
          <h2 id="api-title">7. 本机 REST API</h2>
          <p>让其他本机程序直接读取已标准化的运动序列 JSON。</p>
        </div>
        <span :class="['api-state', { on: localApiStatus?.running }]">
          <i aria-hidden="true"></i>{{ localApiStatus?.running ? '正在监听' : '未运行' }}
        </span>
      </div>
      <div class="api-endpoint">
        <code>{{ localApiStatus?.base_url || 'http://127.0.0.1:43921' }}/workouts/{id}/series</code>
        <button class="button secondary" type="button" :disabled="!localApiStatus?.running" @click="copyLocalApiExample">
          <Icon name="copy" :size="14" />复制示例
        </button>
      </div>
      <p v-if="localApiStatus?.error" class="api-error" role="alert">{{ localApiStatus.error }}</p>
      <p v-else class="api-note">仅绑定 127.0.0.1，只读且不开放浏览器跨域；退出 ZeppBridge 后停止。</p>
    </section>

    <!-- 8. 软件更新 -->
    <section class="settings-card update-card" aria-labelledby="update-title">
      <div class="update-head">
        <div>
          <h2 id="update-title">8. 软件更新</h2>
          <p>每天最多静默检查一次，也可随时手动检查。</p>
        </div>
        <button class="button secondary" type="button" :disabled="updateBusy" @click="checkForDesktopUpdate(true)">
          <Icon name="sync" :size="14" :class="{ spinning: updateState.status === 'checking' }" />
          {{ updateState.status === 'checking' ? '检查中…' : '检查更新' }}
        </button>
      </div>
      <div :class="['update-state', `is-${updateState.status}`]" role="status" aria-live="polite">
        <i aria-hidden="true"></i>
        <div>
          <strong>{{ updateStatusLabel }}</strong>
          <p v-if="updateState.status === 'failed'">{{ updateState.error }}</p>
          <p v-else-if="updateState.status === 'available'">当前 {{ updateState.currentVersion }}<template v-if="updateState.sizeBytes"> · {{ formatUpdateBytes(updateState.sizeBytes) }}</template></p>
          <p v-else>版本 {{ updateState.currentVersion || '读取中' }}</p>
        </div>
      </div>
      <progress v-if="updateState.status === 'downloading' && updateProgress !== null" :value="updateProgress" max="100">{{ updateProgress }}%</progress>
      <div v-if="updateState.status === 'available'" class="update-release">
        <div><strong>ZeppBridge {{ updateState.version }}</strong><p>{{ updateState.notes || '本次 Release 未填写更新说明。' }}</p></div>
        <button class="button primary" type="button" @click="updateInstallArmed = true">下载安装</button>
      </div>
      <div v-if="updateInstallArmed" class="update-confirm" role="alert">
        <div><strong>安装 ZeppBridge {{ updateState.version }}？</strong><p>应用会自动重启，本地健康数据不会被删除。</p></div>
        <button class="button secondary" type="button" @click="updateInstallArmed = false">取消</button>
        <button class="button primary" type="button" @click="installUpdate">确认安装</button>
      </div>
    </section>

    <!-- 9. 自动同步 -->
    <section class="settings-card sync-card" aria-labelledby="sync-title">
      <div class="sync-lead">
        <span class="sync-icon"><Icon name="monitor" :size="20" /></span>
        <div>
          <h2 id="sync-title">9. 自动同步</h2>
          <p class="sync-desc">应用打开期间每 {{ autoSyncInterval }} 分钟自动同步云端记录<br />保持开启可获得连续的时序数据。</p>
        </div>
      </div>
      <div class="sync-controls">
        <div class="interval-options" role="radiogroup" aria-label="自动同步间隔" :class="{ 'is-disabled': !autoSyncEnabled }">
          <button
            v-for="minutes in AUTO_SYNC_INTERVALS"
            :key="minutes"
            type="button"
            role="radio"
            :aria-checked="autoSyncInterval === minutes"
            :disabled="!autoSyncEnabled"
            @click="setAutoSyncInterval(minutes)"
          >{{ minutes }} 分钟</button>
        </div>
        <span class="sync-toggle-label">{{ autoSyncEnabled ? '同步已开启' : '同步已关闭' }}</span>
        <button class="switch" type="button" role="switch" :aria-checked="autoSyncEnabled" @click="setAutoSyncEnabled(!autoSyncEnabled)"><span></span></button>
        <button class="button secondary sync-now" type="button" :disabled="isSyncing || !connected" @click="runSync('incremental')">
          <Icon name="sync" :size="14" />{{ isSyncing ? '正在同步…' : '立即同步' }}
        </button>
      </div>
    </section>

    <!-- 高级维护 -->
    <details class="advanced settings-card">
      <summary>
        <span>
          <strong>高级与维护</strong>
          <em>缩放、数据文件夹与认证清除，仅在需要时使用。</em>
        </span>
        <Icon name="chevron-down" :size="16" />
      </summary>
      <div class="advanced-content">
        <div class="advanced-block">
          <p class="advanced-label">界面缩放</p>
          <p class="section-description">100% 为设计基准，也可使用 Ctrl + / Ctrl -。</p>
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
        </div>
        <div class="advanced-block">
          <p class="advanced-label">数据与认证</p>
          <p class="section-description">数据保存在程序目录的 data 文件夹，当前保留 {{ retentionDays }} 天。</p>
          <div class="inline-actions">
            <button class="button secondary" type="button" @click="openDataFolder"><Icon name="folder" :size="15" />打开数据文件夹</button>
            <button class="button danger-button" type="button" @click="clearAuth">清除认证</button>
          </div>
        </div>
        <details class="diag-fold">
          <summary>同步诊断</summary>
          <div class="stream-list">
            <div v-for="stream in appStatus?.streams" :key="stream.stream" class="stream-row">
              <strong>{{ stream.stream }}</strong>
              <span>{{ stream.status }}</span>
              <span>{{ formatDateTime(stream.last_cloud_sync_at) }}</span>
            </div>
            <p v-if="!appStatus?.streams?.length" class="section-description">尚无同步诊断。</p>
          </div>
        </details>
      </div>
    </details>

    <!-- 隐私政策弹窗 -->
    <div v-if="privacyModalOpen" class="modal-backdrop" @click.self="privacyModalOpen = false">
      <div class="privacy-modal surface-card pad">
        <div class="modal-head">
          <div class="modal-title-row">
            <Icon name="shield" :size="18" class="shield-ic" />
            <h3>ZeppBridge 本地隐私保障原则</h3>
          </div>
          <button type="button" class="close-btn" @click="privacyModalOpen = false"><Icon name="x" :size="16" /></button>
        </div>
        <div class="modal-body">
          <p><strong>1. 本地处理优先：</strong>所有健康与运动时序数据仅存储在本地 SQLite 数据库中，解析与脱敏完全在本地完成。</p>
          <p><strong>2. 认证凭据严格隔离：</strong>App Token 与 User ID 等凭据不与任何第三方分享，AI 导出时自动执行不可逆脱敏。</p>
          <p><strong>3. 敏感定位控制：</strong>GPS 经纬度数据默认不注入 AI 剪贴板，严格保障家庭与常用运动路线隐私。</p>
          <p><strong>4. 透明开源：</strong>端到端代码开源，无暗中网络回传逻辑。</p>
        </div>
        <div class="modal-foot">
          <button type="button" class="button primary" @click="privacyModalOpen = false">我知道了</button>
        </div>
      </div>
    </div>

  </section>
</template>

<style scoped>
.page { width: 100%; min-width: 0; margin: 0; display: grid; gap: 14px; }
.page-header { margin-bottom: 0; min-width: 0; }
h1, h2, h3, p { margin-top: 0; }
h1 { font-size: 24px; font-weight: 700; color: var(--ink); }
h2 { margin-bottom: 14px; font-size: 15px; font-weight: 700; color: var(--ink); }
h3 { margin-bottom: 4px; font-size: 13px; font-weight: 700; color: var(--ink); }
.page-intro, .section-description { margin-bottom: 0; color: var(--muted); font-size: 12px; }
.section-description { margin: 0 0 var(--space-3); }
.settings-card { padding: 18px 20px; border: 1px solid var(--line); border-radius: var(--radius-md); background: var(--surface); min-width: 0; }
.api-head { display: grid; grid-template-columns: auto minmax(0, 1fr) auto; align-items: center; gap: 12px; }
.api-head h2 { margin-bottom: 4px; }
.api-head p, .api-note, .api-error { margin: 0; color: var(--subtle); font-size: 11px; line-height: 1.5; }
.api-icon { display: grid; width: 38px; height: 38px; place-items: center; border-radius: 10px; background: var(--accent-soft); color: var(--accent); }
.api-state { display: inline-flex; align-items: center; gap: 6px; color: var(--muted); font-size: 12px; white-space: nowrap; }
.api-state.on { color: var(--accent); }
.api-state i { width: 6px; height: 6px; border-radius: 50%; background: currentColor; }
.api-endpoint { display: grid; grid-template-columns: minmax(0, 1fr) auto; align-items: center; gap: 10px; margin-top: 14px; padding: 10px 12px; border: 1px solid var(--line); border-radius: var(--radius-sm); background: var(--surface-raised); }
.api-endpoint code { overflow: hidden; color: var(--ink); font-family: var(--font-mono); font-size: 11px; text-overflow: ellipsis; white-space: nowrap; }
.api-note, .api-error { margin-top: 9px; }
.api-error { color: var(--danger); }
.update-head, .update-release, .update-confirm { display: grid; grid-template-columns: minmax(0, 1fr) auto; align-items: center; gap: 14px; }
.update-head h2 { margin-bottom: 4px; }
.update-head p, .update-state p, .update-release p, .update-confirm p { margin: 0; color: var(--subtle); font-size: 11px; line-height: 1.5; }
.update-state { display: grid; grid-template-columns: 7px minmax(0, 1fr); align-items: center; gap: 11px; margin-top: 14px; padding: 11px 12px; border: 1px solid var(--line); border-radius: var(--radius-sm); background: var(--surface-raised); }
.update-state i { width: 7px; height: 7px; border-radius: 50%; background: var(--muted); }
.update-state.is-available i, .update-state.is-upToDate i { background: var(--accent); }
.update-state.is-checking i, .update-state.is-downloading i, .update-state.is-installing i { background: var(--warning); }
.update-state.is-failed i { background: var(--danger); }
.update-state strong, .update-release strong, .update-confirm strong { color: var(--ink); font-size: 12px; }
.update-card progress { width: 100%; height: 6px; margin-top: 10px; accent-color: var(--accent); }
.update-release, .update-confirm { margin-top: 10px; padding: 11px 12px; border: 1px solid var(--line); border-radius: var(--radius-sm); background: var(--surface-raised); }
.update-confirm { grid-template-columns: minmax(0, 1fr) auto auto; }
.section-heading-row { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
.section-heading-row h2 { margin-bottom: 14px; }
.identify-button { flex: 0 0 auto; }
.device-alert { margin: 0 0 10px; }
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
.account-avatar { display: grid; width: 36px; height: 36px; flex: 0 0 36px; place-items: center; border-radius: 9px; background: var(--accent-soft); color: var(--accent); font-family: var(--font-mono); font-size: 15px; font-weight: 700; }
.account-meta { display: grid; min-width: 0; gap: 1px; flex: 1; }
.account-meta strong { overflow: hidden; color: var(--ink); font-family: var(--font-mono); font-size: 13px; text-overflow: ellipsis; white-space: nowrap; }
.account-meta span { overflow: hidden; color: var(--subtle); font-size: 11px; text-overflow: ellipsis; white-space: nowrap; }
.account-state { display: inline-flex; align-items: center; gap: 6px; color: var(--muted); font-size: 12px; white-space: nowrap; }
.account-state.on { color: var(--accent); }
.account-state .dot { width: 6px; height: 6px; border-radius: 50%; background: currentColor; }
/* Deliberately the same surface, radius, gap and type scale as `.source-row`
   above: these two cards sit one under the other and describe the same
   devices, so they have to read as one system rather than two. */
.capability-columns { display: grid; grid-template-columns: 1fr 1fr; gap: var(--space-4); }
@media (max-width: 720px) { .capability-columns { grid-template-columns: 1fr; } }
.capability-heading {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  margin: 0 0 var(--space-2);
  color: var(--ink);
  font-size: 13px;
  font-weight: 700;
}
.capability-heading em {
  padding: 1px 8px;
  border: 1px solid var(--line);
  border-radius: 999px;
  background: var(--surface-raised);
  color: var(--muted);
  font-family: var(--font-mono);
  font-size: 11px;
  font-style: normal;
  font-weight: 400;
}
.capability-list { display: grid; gap: var(--space-2); margin: 0; padding: 0; list-style: none; }
.capability-row {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
  padding: 8px 10px;
  border: 1px solid var(--line);
  border-radius: var(--radius-sm);
  background: var(--surface-raised);
}
.capability-copy { display: grid; gap: 1px; min-width: 0; flex: 1; }
.capability-copy strong { color: var(--ink); font-size: 13px; font-weight: 400; }
.capability-copy span { color: var(--subtle); font-size: 11px; overflow-wrap: anywhere; }
.capability-empty {
  padding: 8px 10px;
  border: 1px dashed var(--line-strong);
  border-radius: var(--radius-sm);
  color: var(--subtle);
  font-size: 12px;
}
.capability-checked { color: var(--muted); font-size: 12px; white-space: nowrap; }
.capability-yes { color: var(--accent); flex: 0 0 auto; }
.capability-no { color: var(--faint); flex: 0 0 auto; }
.probe-diagnostics { margin-top: 16px; }
.probe-diagnostics > summary { color: var(--muted); font-size: 12px; cursor: pointer; }
.probe-diagnostics ul { margin: 8px 0 0; padding-left: 18px; }
.probe-diagnostics li,
.probe-selfcheck { color: var(--muted); font-size: 11px; line-height: 1.7; overflow-wrap: anywhere; }
.device-empty { display: flex; align-items: center; gap: 7px; min-height: 60px; padding: 10px; border: 1px dashed var(--line-strong); border-radius: var(--radius-sm); color: var(--muted); font-size: 12px; }
.two-col { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1.1fr); gap: 14px; align-items: start; }
.three-col { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 14px; }
.two-col > *, .three-col > * { min-width: 0; }

/* 认证方式 */
.auth-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 12px; }
.auth-card {
  display: grid;
  gap: 12px;
  align-content: start;
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
.auth-head strong { display: block; font-size: 13px; margin-bottom: 3px; color: var(--ink); }
.auth-head p { margin: 0; color: var(--subtle); font-size: 11px; line-height: 1.5; }
.auth-action {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  min-height: 34px;
  border: 1px solid var(--line);
  border-radius: 9px;
  background: var(--surface);
  color: var(--muted);
  font-size: 12px;
  cursor: pointer;
  transition: all 140ms ease;
}
.auth-action:hover:not(:disabled) { color: var(--accent); border-color: var(--accent); }
.auth-action:disabled { opacity: .5; cursor: not-allowed; }
.auth-action.is-current { border-color: rgba(205, 220, 124, .35); background: var(--accent-soft); color: var(--accent); font-weight: 600; }
.hint-line { display: inline-flex; align-items: center; gap: 6px; margin: 12px 0 0; color: var(--muted); font-size: 12px; }
.hint-line.ok { color: var(--accent); }
.hint-line.ok svg { color: var(--accent); }

/* 账户与区域 */
.kv-list { display: grid; }
.kv-row {
  display: flex;
  align-items: center;
  gap: 12px;
  min-height: 36px;
  padding: 6px 0;
  border-bottom: 1px solid var(--line);
}
.kv-row:last-child { border-bottom: 0; }
.kv-label { flex: 0 0 96px; color: var(--muted); font-size: 12px; }
.kv-value { flex: 1; min-width: 0; color: var(--ink); font-size: 13px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.kv-value.mono { font-family: var(--font-mono); font-size: 12px; }
.kv-btn {
  padding: 5px 14px;
  border: 1px solid var(--line);
  border-radius: 8px;
  background: var(--surface-raised);
  color: var(--accent);
  font-size: 12px;
  cursor: pointer;
}
.kv-btn:hover:not(:disabled) { border-color: var(--accent); }

/* 数据来源 */
.source-list { display: grid; gap: 8px; }
.source-row {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
  padding: 8px 10px;
  border: 1px solid var(--line);
  border-radius: var(--radius-sm);
  background: var(--surface-raised);
}
.source-icon {
  display: grid;
  place-items: center;
  width: 36px;
  height: 36px;
  flex: 0 0 36px;
  border-radius: 9px;
  border: 1px solid var(--line);
  background: var(--surface);
  color: var(--muted);
}
.source-icon :deep(.device-visual) { width: 36px; max-width: 100%; height: 36px; max-height: 100%; min-width: 0; min-height: 0; flex: 0 0 36px; border: 0; border-radius: 9px; background: transparent; }
.source-icon :deep(.device-visual img) { padding: 3px; }
.source-copy { flex: 1; min-width: 0; display: grid; gap: 1px; }
.source-copy strong { font-size: 13px; color: var(--ink); }
.source-copy span { color: var(--subtle); font-size: 11px; }
.source-copy span + span { font-family: var(--font-mono); font-size: 10px; }
.source-state { display: inline-flex; align-items: center; gap: 5px; color: var(--subtle); font-size: 12px; }
.source-state .dot { width: 6px; height: 6px; border-radius: 50%; background: var(--subtle); }
.source-state.on { color: var(--accent); }
.source-state.on .dot { background: var(--accent); }
.source-list-loading { opacity: .65; }
.skeleton-row { min-height: 58px; background: linear-gradient(90deg, var(--surface-raised), var(--surface-hover), var(--surface-raised)); background-size: 200% 100%; animation: device-shimmer 1.4s ease-in-out infinite; }
@keyframes device-shimmer { from { background-position: 0 0; } to { background-position: -200% 0; } }

/* 开关与字段 */
.toggle-list { display: grid; }
.toggle-row {
  display: flex;
  align-items: center;
  gap: 10px;
  min-height: 52px;
  padding: 8px 0;
  border-bottom: 1px solid var(--line);
}
.toggle-row:last-child { border-bottom: 0; }
.toggle-icon {
  display: grid;
  place-items: center;
  width: 26px;
  height: 26px;
  flex: 0 0 26px;
  border-radius: 7px;
  border: 1px solid var(--line);
  background: var(--surface-raised);
  color: var(--accent);
}
.toggle-copy { flex: 1; min-width: 0; display: grid; gap: 1px; }
.toggle-copy strong { font-size: 12px; color: var(--ink); }
.toggle-copy span { color: var(--subtle); font-size: 11px; }
.switch { width: 42px; height: 24px; flex: 0 0 42px; padding: 2px; border: 1px solid var(--line-strong); border-radius: 999px; background: var(--surface-raised); cursor: pointer; }
.switch span { display: block; width: 18px; height: 18px; border-radius: 50%; background: var(--muted); transition: transform 150ms ease, background-color 150ms ease; }
.switch[aria-checked='true'] { border-color: var(--accent); background: var(--accent-soft); }
.switch[aria-checked='true'] span { transform: translateX(18px); background: var(--accent); }

.privacy-link-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  margin-top: 10px;
  padding: 6px 0;
  border: 0;
  background: transparent;
  color: var(--muted);
  font-size: 12px;
  cursor: pointer;
  transition: color 140ms ease;
}
.privacy-link-btn:hover { color: var(--accent); }
.diagnostic-panel { display: grid; gap: 7px; margin-top: 12px; padding: 12px; border: 1px solid var(--line); border-radius: 12px; background: rgba(255,255,255,.025); }
.diagnostic-panel strong { color: var(--ink); font-size: 12px; }
.diagnostic-panel p { margin: 0; color: var(--subtle); font-size: 11px; line-height: 1.55; }
.diagnostic-panel .button { justify-self: start; }

.field-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  min-height: 44px;
  padding: 6px 0;
}
.field-row select {
  min-height: 34px;
  min-width: 140px;
  padding: 5px 10px;
  border: 1px solid var(--line-strong);
  border-radius: 9px;
  background: var(--surface-raised);
  color: var(--ink);
  font-size: 12px;
}
.retain-note { margin: 6px 0 8px; color: var(--muted); font-size: 12px; line-height: 1.6; }
.inline-actions { display: flex; gap: 8px; flex-wrap: wrap; margin-top: 12px; }
.button { display: inline-flex; min-height: 32px; align-items: center; justify-content: center; gap: 6px; padding: 5px 14px; border: 1px solid transparent; border-radius: 9px; background: transparent; font-size: 12px; cursor: pointer; }
.button:disabled { opacity: .5; cursor: not-allowed; }
.button.primary { background: var(--accent); color: var(--accent-ink); font-weight: 600; }
.button.secondary { border-color: var(--line-strong); color: var(--muted); background: var(--surface-raised); }
.button.secondary:hover:not(:disabled) { border-color: var(--accent); color: var(--accent); }
.danger-button { border-color: rgba(240, 97, 106, .35); color: var(--danger); }

/* 自动同步 */
.sync-card { display: flex; align-items: center; justify-content: space-between; gap: 16px; flex-wrap: wrap; }
.sync-lead { display: flex; align-items: flex-start; gap: 12px; min-width: 0; }
.sync-lead h2 { margin-bottom: 4px; }
.sync-icon {
  display: grid;
  place-items: center;
  width: 44px;
  height: 44px;
  flex: 0 0 44px;
  border-radius: 11px;
  border: 1px solid var(--line);
  background: var(--surface-raised);
  color: var(--accent);
}
.sync-desc { margin: 0; color: var(--muted); font-size: 12px; line-height: 1.6; }
.sync-controls { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; }
.sync-toggle-label { color: var(--muted); font-size: 12px; }
.sync-now { min-height: 36px; border-radius: 10px; }
.interval-options { display: flex; flex-wrap: wrap; gap: 6px; }
.interval-options button { min-width: 58px; min-height: 28px; padding: 3px 10px; border: 1px solid var(--line); border-radius: 8px; background: transparent; color: var(--ink); font-size: 12px; cursor: pointer; }
.interval-options button[aria-checked='true'] { border-color: var(--accent); color: var(--accent); background: var(--accent-soft); }
.interval-options.is-disabled { opacity: .5; }
.interval-options.is-disabled button { cursor: not-allowed; }

/* 高级 */
.advanced > summary { display: flex; align-items: center; justify-content: space-between; gap: 12px; cursor: pointer; list-style: none; }
.advanced > summary::-webkit-details-marker { display: none; }
.advanced > summary span { display: grid; gap: 2px; min-width: 0; }
.advanced > summary strong { font-size: 14px; font-weight: 700; color: var(--ink); }
.advanced > summary em { color: var(--muted); font-size: 12px; font-style: normal; }
.advanced[open] > summary > svg { transform: rotate(180deg); }
.advanced-content { display: grid; gap: 16px; margin-top: 12px; border-top: 1px solid var(--line); padding-top: 12px; }
.advanced-block { display: grid; gap: 6px; }
.advanced-label { margin: 0; color: var(--ink); font-size: 13px; font-weight: 600; }
.diag-fold { border-top: 1px solid var(--line); padding-top: 8px; }
.diag-fold > summary { cursor: pointer; color: var(--muted); font-size: 12px; list-style: none; }
.diag-fold > summary::-webkit-details-marker { display: none; }
.diag-fold[open] > summary { color: var(--ink); }
.scale-options { display: flex; flex-wrap: wrap; gap: 6px; }
.scale-options button { min-width: 48px; min-height: 30px; padding: 4px 8px; border: 1px solid var(--line); border-radius: 8px; background: transparent; color: var(--ink); font-variant-numeric: tabular-nums; font-family: 'Inter', var(--font-sans); font-size: 12px; cursor: pointer; }
.scale-options button[aria-checked='true'] { border-color: var(--accent); color: var(--accent); background: var(--accent-soft); }
.stream-list { display: grid; gap: 2px; margin-top: 6px; }
.stream-row { display: grid; grid-template-columns: 110px minmax(0, 1fr) auto; gap: 12px; padding: 7px 0; border-bottom: 1px solid var(--line); color: var(--muted); font-size: 12px; }
.stream-row strong { font-weight: 600; color: var(--ink); }
.alert { display: flex; align-items: flex-start; gap: 7px; padding: 9px 12px; border: 1px solid var(--line); border-radius: var(--radius-sm); background: var(--surface); color: var(--muted); font-size: 12px; }
.alert.success { color: var(--accent); }
.alert.danger { color: var(--danger); }
.alert.warning { color: var(--warning); }
.alert button { margin-left: auto; border: 0; background: transparent; color: inherit; cursor: pointer; font-size: 12px; }
code { color: var(--muted); font-family: var(--font-mono); font-size: 12px; }
.manual-auth-form { margin-top: 16px; padding: 16px; border: 1px solid var(--line); border-radius: var(--radius-md); background: var(--surface-raised); }
.manual-auth-form h3 { margin: 0 0 8px; font-size: 14px; font-weight: 700; color: var(--ink); }
.manual-auth-form .form-hint { margin: 0 0 12px; color: var(--muted); font-size: 12px; }
.manual-auth-form .form-group { margin-bottom: 12px; }
.manual-auth-form .form-group:last-of-type { margin-bottom: 16px; }
.manual-auth-form label { display: block; margin-bottom: 4px; color: var(--ink); font-size: 12px; font-weight: 500; }
.manual-auth-form input { width: 100%; padding: 8px 10px; border: 1px solid var(--line); border-radius: 9px; background: var(--surface); color: var(--ink); font-family: var(--font-mono); font-size: 12px; }
.manual-auth-form input:focus { outline: none; border-color: var(--accent); }
.manual-auth-form input:disabled { opacity: 0.5; cursor: not-allowed; }
.manual-auth-form .form-actions { display: flex; gap: 8px; }

/* 隐私政策弹窗 */
.modal-backdrop { position: fixed; inset: 0; z-index: 100; background: rgba(0, 0, 0, .7); display: grid; place-items: center; padding: 20px; }
.privacy-modal { max-width: 520px; width: 100%; border: 1px solid var(--line-strong); border-radius: var(--radius-md); background: var(--surface-raised); box-shadow: 0 12px 36px rgba(0, 0, 0, .5); }
.modal-head { display: flex; align-items: center; justify-content: space-between; margin-bottom: 14px; padding-bottom: 10px; border-bottom: 1px solid var(--line); }
.modal-title-row { display: flex; align-items: center; gap: 8px; }
.shield-ic { color: var(--accent); }
.close-btn { display: grid; place-items: center; width: 28px; height: 28px; border: 0; border-radius: 6px; background: transparent; color: var(--muted); cursor: pointer; }
.close-btn:hover { background: var(--surface-hover); color: var(--ink); }
.modal-body { display: grid; gap: 10px; color: var(--muted); font-size: 12px; line-height: 1.6; }
.modal-body strong { color: var(--ink); }
.modal-foot { display: flex; justify-content: flex-end; margin-top: 16px; padding-top: 12px; border-top: 1px solid var(--line); }

@media (max-width: 1080px) {
  .three-col { grid-template-columns: minmax(0, 1fr); }
}
@media (max-width: 860px) {
  .two-col { grid-template-columns: minmax(0, 1fr); }
  .auth-grid { grid-template-columns: minmax(0, 1fr); }
  .account-strip { flex-wrap: wrap; }
  .account-meta { flex: 1 1 160px; }
}
@media (prefers-reduced-motion: reduce) { .switch span { transition: none; } .skeleton-row { animation: none; } }
</style>
