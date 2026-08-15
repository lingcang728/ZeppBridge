<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue';
import DeviceVisual from '../components/DeviceVisual.vue';
import Icon from '../components/Icon.vue';
import { useDevices } from '../composables/useDevices';
import { useSyncController } from '../composables/useSyncController';
import { AUTO_SYNC_INTERVALS } from '../lib/autoSync';
import { UI_SCALES, useUiScale, type UiScale } from '../composables/useUiScale';
import { backend, toUserMessage } from '../lib/bridge';
import type { LoginStatus } from '../types';

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
const deviceRefreshBusy = ref(false);
const deviceRefreshMessage = ref<string | null>(null);
const deviceRefreshError = ref<string | null>(null);

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
  void loadDevices();
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
      <section id="account-section" class="settings-card" aria-labelledby="account-title">
        <h2 id="account-title">2. 账户与区域</h2>
        <div class="kv-list">
          <div class="kv-row">
            <span class="kv-label">当前账户</span>
            <span class="kv-value">{{ appStatus?.masked_user_id || '未识别' }}</span>
            <button v-if="configuredOnly" class="kv-btn" type="button" :disabled="isSyncing" @click="verifyAndSync">验证并同步</button>
            <button v-else class="kv-btn" type="button" :disabled="loginBusy" @click="startLogin">重新认证</button>
          </div>
          <div class="kv-row">
            <span class="kv-label">用户 ID</span>
            <span class="kv-value mono">{{ appStatus?.masked_user_id || '未提供' }}</span>
          </div>
          <div class="kv-row">
            <span class="kv-label">区域 / Host</span>
            <span class="kv-value mono">{{ appStatus?.region_host || 'region_host' }}</span>
          </div>
          <div class="kv-row">
            <span class="kv-label">最后认证时间</span>
            <span class="kv-value">{{ formatDateTime(appStatus?.last_cloud_sync_at) }}</span>
          </div>
        </div>
        <p class="hint-line ok">
          <Icon name="shield" :size="13" />
          {{ connected ? '认证状态正常，数据可正常同步。' : `认证状态：${connectionLabel}。` }}
        </p>
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
              <Icon v-else name="cloud" :size="18" />
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
        <p class="device-cache-note">设备缓存：{{ deviceCache?.status || '正常' }}。仅展示必要掩码信息，保护硬件标识隐私。</p>
      </section>
    </div>

    <!-- 3 列网格：隐私 + 数据保留 + 导出默认值 -->
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
        <p class="retain-note">设置导出与提示词页面的默认格式与云端补拉窗口。</p>
        <div class="inline-actions">
          <button class="button primary" type="button" :disabled="isSyncing || (!connected && !configuredOnly) || prefsBusy" @click="confirmHistorySync">
            开始历史补拉
          </button>
        </div>
      </section>
    </div>

    <!-- 7. 自动同步 -->
    <section class="settings-card sync-card" aria-labelledby="sync-title">
      <div class="sync-lead">
        <span class="sync-icon"><Icon name="monitor" :size="20" /></span>
        <div>
          <h2 id="sync-title">7. 自动同步</h2>
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
          <em>界面缩放、数据文件夹与认证清除，仅在需要时使用。</em>
        </span>
        <Icon name="chevron-down" :size="16" />
      </summary>
      <div class="advanced-content">
        <p class="section-description">界面缩放。100% 为设计基准，也可通过 Ctrl + / Ctrl - 快捷键缩放。</p>
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
        <p class="section-description">数据库位于：<code>{{ appStatus?.database_path || '应用数据目录' }}</code>。当前保留 {{ retentionDays }} 天。</p>
        <div class="inline-actions">
          <button class="button secondary" type="button" @click="openDataFolder"><Icon name="folder" :size="15" />打开数据文件夹</button>
          <button class="button danger-button" type="button" @click="clearAuth">清除认证</button>
        </div>
        <p class="section-description">同步数据流诊断：</p>
        <div class="stream-list">
          <div v-for="stream in appStatus?.streams" :key="stream.stream" class="stream-row">
            <strong>{{ stream.stream }}</strong>
            <span>{{ stream.status }}</span>
            <span>{{ formatDateTime(stream.last_cloud_sync_at) }}</span>
          </div>
        </div>
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

    <p class="font-credits">界面字体：MiSans（小米，免费商用许可）与 Inter（OFL）。</p>
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
.section-description { margin: 12px 0 8px; }
.settings-card { padding: 18px 20px; border: 1px solid var(--line); border-radius: var(--radius-md); background: var(--surface); min-width: 0; }
.section-heading-row { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
.section-heading-row h2 { margin-bottom: 14px; }
.identify-button { flex: 0 0 auto; }
.device-alert { margin: 0 0 10px; }
.device-cache-note { margin: 10px 0 0; color: var(--subtle); font-size: 11px; }
.device-empty { display: flex; align-items: center; gap: 7px; min-height: 60px; padding: 10px; border: 1px dashed var(--line-strong); border-radius: var(--radius-sm); color: var(--muted); font-size: 12px; }
.two-col { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1.1fr); gap: 14px; }
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
  min-height: 44px;
  padding: 8px 0;
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
  padding: 10px 12px;
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
.advanced-content { margin-top: 12px; border-top: 1px solid var(--line); padding-top: 4px; }
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
.font-credits { margin: 0; color: var(--subtle); font-size: 12px; }
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
}
@media (prefers-reduced-motion: reduce) { .switch span { transition: none; } .skeleton-row { animation: none; } }
</style>
