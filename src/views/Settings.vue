<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue';
import QrcodeVue from 'qrcode.vue';
import Icon from '../components/Icon.vue';
import { useSyncController } from '../composables/useSyncController';
import { useTheme, type ThemeMode } from '../composables/useTheme';
import { tauriApi, toUserMessage } from '../composables/useTauriApi';
import type { CaptureStatus } from '../types';

type ConnectMode = 'capture' | 'manual';
type CapturePhase = 'idle' | 'starting' | 'waiting' | 'finishing' | 'done' | 'error';

const {
  appStatus,
  statusError,
  syncState,
  syncMessage,
  syncReport,
  isSyncing,
  autoSyncEnabled,
  captureSession,
  captureStatus,
  proxyRestored,
  refreshStatus,
  runSync,
  setAutoSyncEnabled,
  setCaptureSession,
  markProxyRestored,
  markDataChanged,
} = useSyncController();
const { theme, setTheme } = useTheme();

const reconnecting = ref(false);
const connectMode = ref<ConnectMode>('capture');
const manualBusy = ref(false);
const manualError = ref<string | null>(null);
const manualMessage = ref<string | null>(null);
const appToken = ref('');
const userId = ref('');
const regionHost = ref('https://api-mifit.huami.com');

const capturePort = ref('8888');
const selectedLanIp = ref('');
const capturePhase = ref<CapturePhase>('idle');
const captureError = ref<string | null>(null);
const captureUserId = ref('');
let captureTimer: number | undefined;

const dataBusy = ref<string | null>(null);
const dataMessage = ref<string | null>(null);
const dataError = ref<string | null>(null);

const themeOptions: { value: ThemeMode; label: string; icon: 'spark' | 'sun' | 'moon' }[] = [
  { value: 'system', label: '跟随系统', icon: 'spark' },
  { value: 'light', label: '浅色', icon: 'sun' },
  { value: 'dark', label: '深色', icon: 'moon' },
];

const connected = computed(() => appStatus.value?.connection_state === 'connected');
const configuredOnly = computed(() => appStatus.value?.connection_state === 'configured');
const needsReauth = computed(() => appStatus.value?.connection_state === 'needs_reauth');
const showConnectionGuide = computed(() => !connected.value || reconnecting.value || !proxyRestored.value || capturePhase.value === 'done');
const retentionDays = ref(appStatus.value?.retention_days ?? 365);
const historyDays = ref(appStatus.value?.history_sync_days ?? 30);
const storageEstimate = ref(appStatus.value?.storage ?? null);
const prefsBusy = ref(false);
const captureDiagnostics = computed(() => captureStatus.value?.diagnostics);
const captureNeedsUserId = computed(() => captureDiagnostics.value?.stage === 'waiting_for_user_id');

const connectionLabel = computed(() => {
  if (needsReauth.value) return '需要重新连接';
  if (connected.value) return '已连接';
  if (configuredOnly.value) return '待验证';
  return '未连接';
});
const connectionDescription = computed(() => {
  if (needsReauth.value) return 'Zepp 已拒绝当前认证，请重新获取认证信息。';
  if (connected.value) return `账号 ${appStatus.value?.masked_user_id || '已保存'} · ${appStatus.value?.region_host || '区域已配置'}`;
  if (configuredOnly.value) return '认证已保存，但还没有通过云端验证。请点「验证并同步」。';
  return '按下面 5 步完成一次手机辅助连接。之后重启应用不必再走证书。';
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

const validateHost = (value: string): boolean => {
  try {
    const parsed = new URL(value);
    return parsed.protocol === 'https:'
      && !parsed.username && !parsed.password && !parsed.port
      && (!parsed.pathname || parsed.pathname === '/') && !parsed.search && !parsed.hash
      && /^api-mifit[a-z0-9-]*\.(?:zepp|huami)\.com$/i.test(parsed.hostname);
  } catch {
    return false;
  }
};

const saveManualAuth = async () => {
  manualError.value = null;
  manualMessage.value = null;
  const token = appToken.value.trim();
  const id = userId.value.trim();
  const host = regionHost.value.trim().replace(/\/$/, '');
  if (!token || !id || !host) {
    manualError.value = '请填写 App token、用户 ID 和区域地址。';
    return;
  }
  if (!validateHost(host)) {
    manualError.value = '区域地址必须是 Zepp 或 Huami 的 api-mifit HTTPS 根地址。';
    return;
  }
  manualBusy.value = true;
  try {
    await tauriApi.saveAuth({ appToken: token, userId: id, regionHost: host });
    appToken.value = '';
    try {
      await tauriApi.verifyAuth();
      manualMessage.value = '连接验证通过。';
    } catch (error) {
      manualMessage.value = '认证已保存；当前验证未完成，仍可稍后直接同步。';
      manualError.value = toUserMessage(error, '验证暂时未完成');
    }
    await refreshStatus();
    if (appStatus.value?.connection_state === 'connected') {
      reconnecting.value = false;
    } else {
      manualMessage.value = '认证已保存，但验证未通过。请检查网络后点「验证并同步」。';
    }
  } catch (error) {
    manualError.value = toUserMessage(error, '无法保存认证信息');
  } finally {
    manualBusy.value = false;
  }
};

const stopCapturePolling = () => {
  if (captureTimer !== undefined) window.clearInterval(captureTimer);
  captureTimer = undefined;
};
const finishCapturedFlow = async (status: CaptureStatus) => {
  if (!status.captured || capturePhase.value === 'finishing' || capturePhase.value === 'done') return;
  capturePhase.value = 'finishing';
  stopCapturePolling();
  proxyRestored.value = false;
  try {
    await tauriApi.stopCapture();
    await tauriApi.verifyAuth();
    await refreshStatus();
    void runSync('history', historyDays.value);
    capturePhase.value = 'done';
    reconnecting.value = false;
  } catch (error) {
    capturePhase.value = 'error';
    captureError.value = toUserMessage(error, '连接收尾未完成');
  }
};
const checkCaptureStatus = async () => {
  if (capturePhase.value !== 'waiting') return;
  try {
    const status = await tauriApi.getCaptureStatus();
    captureStatus.value = status;
    if (status.session) setCaptureSession(status.session, status);
    if (status.error || /error|fail/i.test(status.state)) {
      capturePhase.value = 'error';
      captureError.value = toUserMessage(status.error || status.message, '捕获未完成');
      stopCapturePolling();
    } else if (status.captured) {
      await finishCapturedFlow(status);
    }
  } catch (error) {
    captureError.value = toUserMessage(error, '无法读取捕获状态');
  }
};
const startCapture = async () => {
  captureError.value = null;
  const port = Number.parseInt(capturePort.value, 10);
  if (!Number.isInteger(port) || port < 1024 || port > 65535) {
    captureError.value = '端口需要是 1024–65535 之间的整数。';
    return;
  }
  capturePhase.value = 'starting';
  try {
    const session = await tauriApi.startCapture(port);
    selectedLanIp.value = session.lan_ip;
    setCaptureSession(session, { state: session.state, session });
    capturePhase.value = 'waiting';
    captureTimer = window.setInterval(() => void checkCaptureStatus(), 1400);
    void checkCaptureStatus();
  } catch (error) {
    capturePhase.value = 'error';
    captureError.value = toUserMessage(error, '无法启动本机捕获服务');
  }
};
const completeCaptureUserId = async () => {
  const id = captureUserId.value.trim();
  if (!id || !/^[A-Za-z0-9_-]{1,64}$/.test(id)) {
    captureError.value = '用户 ID 需为 1–64 个字母、数字、短横线或下划线。';
    return;
  }
  try {
    const status = await tauriApi.completeCaptureUserId(id);
    captureStatus.value = status;
    if (status.session) setCaptureSession({ ...status.session, lan_ips: status.session.lan_ips ? [...status.session.lan_ips] : undefined }, status);
    else setCaptureSession(null, status);
    if (status.captured) await finishCapturedFlow(status);
  } catch (error) {
    captureError.value = toUserMessage(error, '无法补充用户 ID');
  }
};
const cancelCapture = async () => {
  stopCapturePolling();
  try {
    if (captureSession.value) await tauriApi.stopCapture();
  } catch {
    // The local proxy may already have stopped after a completed capture.
  }
  capturePhase.value = 'idle';
  setCaptureSession(null, null);
};
const copyTextSafe = async (value: string) => {
  try { await navigator.clipboard.writeText(value); }
  catch { /* WebView 可能拒绝剪贴板 */ }
};
const confirmProxyRestored = async () => {
  markProxyRestored();
  capturePhase.value = 'idle';
  setCaptureSession(null, null);
};

const clearAuth = async () => {
  if (!window.confirm('确定清除认证信息吗？本地健康数据会保留。')) return;
  dataError.value = null;
  try {
    await tauriApi.clearAuth();
    await refreshStatus();
    reconnecting.value = false;
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
    const result = await tauriApi.reprocessLocalData();
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
    await tauriApi.cleanupOldData(retentionDays.value);
    dataMessage.value = `已清理 ${retentionDays.value} 天以前的数据。`;
    markDataChanged();
  } catch (error) {
    dataError.value = toUserMessage(error, '清理旧数据失败');
  } finally {
    dataBusy.value = null;
  }
};
const openDataFolder = async () => {
  try { await tauriApi.openDataFolder(); }
  catch (error) { dataError.value = toUserMessage(error, '无法打开数据文件夹'); }
};

const savePrefs = async () => {
  const retention = Number(retentionDays.value);
  const history = Number(historyDays.value);
  if (!(retention >= 1 && retention <= 365) || !(history >= 1 && history <= 365)) {
    dataError.value = '保留天数和补拉天数都必须在 1–365。';
    return;
  }
  if (retention < (appStatus.value?.retention_days ?? 365)) {
    if (!window.confirm(`下次成功同步将删除 ${retention} 天以前的本地数据，不可恢复。确定吗？`)) return;
  }
  prefsBusy.value = true;
  try {
    const prefs = await tauriApi.setUserPrefs(retention, history);
    retentionDays.value = prefs.retention_days;
    historyDays.value = prefs.history_sync_days;
    storageEstimate.value = await tauriApi.getStorageEstimate(history);
    dataMessage.value = '已保存本地保留与历史补拉设置。';
    await refreshStatus();
  } catch (error) {
    dataError.value = toUserMessage(error, '无法保存设置');
  } finally {
    prefsBusy.value = false;
  }
};
const confirmHistorySync = async () => {
  const days = Number(historyDays.value);
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
});
onUnmounted(() => {
  stopCapturePolling();
});
</script>

<template>
  <section class="page settings-page" aria-labelledby="settings-title">
    <header class="page-header">
      <div>
        <p class="eyebrow">连接、同步与本地数据</p>
        <h1 id="settings-title">设置</h1>
        <p class="page-intro">常用设置保持在前；认证教程和维护工具仅在需要时展开。</p>
      </div>
    </header>

    <div v-if="statusError" class="alert danger" role="alert"><Icon name="warning" :size="15" />{{ statusError }}<button type="button" @click="refreshStatus">重试</button></div>

    <section class="settings-section" aria-labelledby="connection-title">
      <div class="section-heading">
        <div><p class="eyebrow">连接状态</p><h2 id="connection-title">Zepp 云端</h2></div>
        <span :class="['state-chip', needsReauth ? 'danger' : connected ? 'success' : 'neutral']"><span class="status-dot"></span>{{ connectionLabel }}</span>
      </div>
      <p class="section-description">{{ connectionDescription }}</p>
      <div v-if="(connected || configuredOnly) && !reconnecting" class="connection-actions">
        <button v-if="configuredOnly" class="button primary" type="button" :disabled="isSyncing" @click="tauriApi.verifyAuth().then(refreshStatus).then(() => runSync('incremental'))">验证并同步</button>
        <button v-else class="button primary" type="button" :disabled="isSyncing" @click="runSync('incremental')"><Icon name="sync" :size="15" />{{ isSyncing ? '正在同步…' : '同步最近 7 天' }}</button>
        <button class="button secondary" type="button" @click="reconnecting = true">重新连接</button>
      </div>
      <div v-if="syncState !== 'idle'" :class="['sync-result', syncState]" role="status">
        <Icon :name="syncState === 'failed' ? 'warning' : syncState === 'updated' ? 'circle-check' : 'info'" :size="15" />
        <div><strong>{{ syncMessage }}</strong><span>最近云端同步：{{ formatDateTime(appStatus?.last_cloud_sync_at) }}</span></div>
      </div>

      <div v-if="showConnectionGuide" class="connection-guide">
        <div class="mode-tabs" role="tablist" aria-label="连接方式">
          <button type="button" role="tab" :aria-selected="connectMode === 'capture'" @click="connectMode = 'capture'">手机辅助连接</button>
          <button type="button" role="tab" :aria-selected="connectMode === 'manual'" @click="connectMode = 'manual'">手动填写</button>
        </div>
        <button v-if="reconnecting && connected" class="text-button cancel-reconnect" type="button" @click="reconnecting = false">取消重新连接</button>

        <div v-if="connectMode === 'capture'" class="guide-content" role="tabpanel">
          <ol class="step-list">
            <li>电脑和手机连同一个 Wi‑Fi，不要用访客网络或客户端隔离。</li>
            <li>扫描右侧二维码或打开证书地址，把证书装进系统并设为信任。这是证书，不是代理。</li>
            <li>手机当前 Wi‑Fi 代理选「手动」，主机填下面的局域网 IP，端口填页面上的数字。不要填 127.0.0.1。</li>
            <li>打开 Zepp，进入健康 / 睡眠 / 运动并下拉刷新。</li>
            <li>连上以后立刻把手机代理改回「无」，共享设备建议卸掉这次装的用户证书。</li>
          </ol>
          <div v-if="capturePhase === 'idle' || capturePhase === 'error'" class="inline-form">
            <label><span>代理端口</span><input v-model="capturePort" inputmode="numeric" /></label>
            <button class="button primary" type="button" @click="startCapture"><Icon name="wifi" :size="15" />开始连接</button>
          </div>
          <div v-else-if="captureSession" class="capture-session">
            <div class="capture-address">
              <span>手机 HTTP 代理</span>
              <strong>{{ selectedLanIp || captureSession.lan_ip }}:{{ captureSession.port }}</strong>
              <button class="text-button" type="button" @click="copyTextSafe(`${selectedLanIp || captureSession.lan_ip}:${captureSession.port}`)">复制</button>
            </div>
            <label v-if="(captureSession.lan_ips || []).length > 1"><span>本机网卡</span>
              <select v-model="selectedLanIp">
                <option v-for="ip in captureSession.lan_ips" :key="ip" :value="ip">{{ ip }}</option>
              </select>
            </label>
            <div class="qr-wrap"><QrcodeVue :value="captureSession.certificate_url" :size="112" level="M" /></div>
            <p class="qr-caption">扫码下载证书，不是代理配置。</p>
            <div><span>证书地址</span><code>{{ captureSession.certificate_url }}</code><button class="text-button" type="button" @click="copyTextSafe(captureSession.certificate_url)">复制</button></div>
            <p>{{ capturePhase === 'waiting' ? (captureStatus?.diagnostics?.guidance || '等待 Zepp 请求…') : capturePhase === 'finishing' ? '正在验证并同步…' : '连接完成。请先把手机代理改回「无」，再点下面的确认。' }}</p>
            <p v-if="captureStatus?.message" class="section-description">{{ captureStatus.message }}</p>
            <dl v-if="captureDiagnostics" class="capture-diagnostics">
              <div><dt>手机连接</dt><dd>{{ captureDiagnostics.phone_connect_count }}</dd></div>
              <div><dt>Zepp API</dt><dd>{{ captureDiagnostics.zepp_connect_count }}</dd></div>
              <div><dt>HTTPS 请求</dt><dd>{{ captureDiagnostics.zepp_http_request_count }}</dd></div>
            </dl>
            <div v-if="captureNeedsUserId" class="inline-form"><label><span>Zepp 用户 ID（只补这一项，token 已在本次内存）</span><input v-model="captureUserId" /></label><button class="button secondary" type="button" @click="completeCaptureUserId">补充并继续</button></div>
            <button v-if="capturePhase === 'done'" class="button primary" type="button" @click="confirmProxyRestored">我已关闭手机代理</button>
            <button v-if="capturePhase !== 'done'" class="button quiet" type="button" @click="cancelCapture">停止连接</button>
          </div>
          <div v-if="captureError" class="alert danger" role="alert"><Icon name="warning" :size="15" />{{ captureError }}</div>
        </div>

        <form v-else class="guide-content manual-form" role="tabpanel" @submit.prevent="saveManualAuth">
          <p>切手动填写会丢掉这次已经捕获的 token。只有你已经合法拿到自己的 token 时才用这一栏。</p>
          <label><span>App token</span><input v-model="appToken" type="password" autocomplete="off" /></label>
          <label><span>用户 ID</span><input v-model="userId" autocomplete="off" /></label>
          <label><span>区域地址</span><input v-model="regionHost" inputmode="url" /></label>
          <button class="button primary" type="submit" :disabled="manualBusy">{{ manualBusy ? '正在连接…' : '保存并连接' }}</button>
          <div v-if="manualMessage" class="alert success"><Icon name="circle-check" :size="15" />{{ manualMessage }}</div>
          <div v-if="manualError" class="alert danger" role="alert"><Icon name="warning" :size="15" />{{ manualError }}</div>
        </form>
      </div>
    </section>

    <section class="settings-section" aria-labelledby="data-window-title">
      <div><p class="eyebrow">本地数据</p><h2 id="data-window-title">保留与历史补拉</h2></div>
      <p class="section-description">最多回看 1 年，不会同步全部历史。超过保留天数的记录会在<strong>下一次成功同步后</strong>清理，不可恢复。</p>
      <div class="date-grid" style="margin-top:14px">
        <label><span>本地保留（1–365 天）</span><input v-model.number="retentionDays" type="number" min="1" max="365" /></label>
        <label><span>补拉历史（1–365 天）</span><input v-model.number="historyDays" type="number" min="1" max="365" /></label>
      </div>
      <p class="section-description" style="margin-top:10px">{{ storageEstimate?.message || '正在读取磁盘空间…' }}</p>
      <div class="button-row">
        <button class="button secondary" type="button" :disabled="prefsBusy" @click="savePrefs">保存天数</button>
        <button class="button primary" type="button" :disabled="isSyncing || (!connected && !configuredOnly)" @click="confirmHistorySync">按上面的天数补拉历史</button>
      </div>
    </section>

    <section class="settings-section" aria-labelledby="automatic-title">
      <div class="setting-row">
        <div><p class="eyebrow">自动同步</p><h2 id="automatic-title">打开或托盘驻留时检查更新</h2><p>启动后同步一次最近 7 天，之后每 15 分钟检查。关窗口会留在托盘，点托盘「退出」才停止。</p></div>
        <button class="switch" type="button" role="switch" :aria-checked="autoSyncEnabled" @click="setAutoSyncEnabled(!autoSyncEnabled)"><span></span></button>
      </div>
    </section>

    <section class="settings-section" aria-labelledby="appearance-title">
      <div><p class="eyebrow">外观</p><h2 id="appearance-title">主题</h2></div>
      <div class="theme-options" role="radiogroup" aria-label="主题">
        <button v-for="option in themeOptions" :key="option.value" type="button" role="radio" :aria-checked="theme === option.value" @click="setTheme(option.value)"><Icon :name="option.icon" :size="16" /><span>{{ option.label }}</span><Icon v-if="theme === option.value" name="check" :size="14" /></button>
      </div>
    </section>

    <details class="advanced settings-section">
      <summary><span><span class="eyebrow">按需使用</span><strong>高级与隐私</strong></span><Icon name="chevron-down" :size="16" /></summary>
      <div class="advanced-content">
        <section class="advanced-block">
          <div class="block-heading"><div><h3>同步诊断</h3><p>样本时间与云端拉取时间分开显示；记录数只用于技术排查。</p></div><button class="button secondary" type="button" :disabled="isSyncing || (!connected && !configuredOnly)" @click="confirmHistorySync">补拉历史</button></div>
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
          <div class="button-row"><button class="button secondary" type="button" @click="openDataFolder"><Icon name="folder" :size="15" />打开数据文件夹</button><button class="button secondary" type="button" :disabled="Boolean(dataBusy)" @click="reprocessLocalData">{{ dataBusy === 'reprocess' ? '正在解析…' : '重新解析本地数据' }}</button><button class="button danger-button" type="button" :disabled="Boolean(dataBusy)" @click="cleanupData">清理旧数据</button><button class="button danger-button" type="button" @click="clearAuth">清除认证</button></div>
          <div v-if="dataMessage" class="alert success">{{ dataMessage }}</div><div v-if="dataError" class="alert danger" role="alert">{{ dataError }}</div>
        </section>
      </div>
    </details>
  </section>
</template>

<style scoped>
.page { width: min(100%, 920px); margin: 0 auto; padding: 36px 32px 64px; }
.page-header { margin-bottom: 22px; }
.eyebrow { display: block; margin: 0 0 6px; color: var(--muted); font-size: 10px; font-weight: 700; letter-spacing: .12em; text-transform: uppercase; }
h1, h2, h3, p { margin-top: 0; }
h1 { margin-bottom: 8px; font-size: clamp(32px, 4vw, 46px); font-weight: 650; letter-spacing: -.045em; line-height: 1.08; }
h2 { margin-bottom: 0; font-size: 18px; font-weight: 650; letter-spacing: -.02em; }
h3 { margin-bottom: 7px; font-size: 15px; }
.page-intro, .section-description, .setting-row p, .advanced-block p { margin-bottom: 0; color: var(--muted); }
.settings-section { margin-top: 10px; padding: 20px 22px; border: 1px solid var(--line); border-radius: var(--radius-md); background: var(--surface); }
.section-heading, .setting-row, .block-heading { display: flex; align-items: center; justify-content: space-between; gap: 18px; }
.state-chip { display: inline-flex; min-height: 28px; align-items: center; gap: 7px; padding: 4px 9px; border: 1px solid var(--line); border-radius: 999px; color: var(--muted); font-size: 11px; }
.state-chip.success, .stream-state.success { color: var(--accent); }.state-chip.danger, .stream-state.danger { color: var(--danger); }.stream-state.warning { color: var(--warning); }
.status-dot { width: 6px; height: 6px; border-radius: 50%; background: currentColor; }
.connection-actions, .button-row { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 17px; }
.button { display: inline-flex; min-height: 40px; align-items: center; justify-content: center; gap: 7px; padding: 8px 13px; border: 1px solid transparent; border-radius: var(--radius-sm); background: transparent; font-size: 12px; font-weight: 650; cursor: pointer; }
.button:disabled { opacity: .5; cursor: not-allowed; }.button.primary { background: var(--accent); color: var(--accent-ink); }.button.secondary, .button.quiet { border-color: var(--line); color: var(--muted); }.button.secondary:hover, .button.quiet:hover { border-color: var(--accent); color: var(--accent); }.danger-button { border-color: color-mix(in srgb, var(--danger) 45%, var(--line)); color: var(--danger); }
.sync-result { display: flex; align-items: flex-start; gap: 9px; margin-top: 16px; padding-top: 14px; border-top: 1px solid var(--line); color: var(--muted); }.sync-result.updated { color: var(--accent); }.sync-result.partial { color: var(--warning); }.sync-result.no_new_data { color: var(--muted); }.sync-result.failed { color: var(--danger); }.sync-result strong, .sync-result span { display: block; }.sync-result span { margin-top: 3px; color: var(--muted); font-size: 10px; }
.connection-guide { position: relative; margin-top: 20px; padding-top: 18px; border-top: 1px solid var(--line); }.mode-tabs { display: inline-flex; gap: 3px; padding: 3px; border-radius: var(--radius-sm); background: var(--surface-raised); }.mode-tabs button { min-height: 34px; padding: 6px 10px; border: 0; border-radius: 6px; background: transparent; color: var(--muted); font-size: 11px; cursor: pointer; }.mode-tabs button[aria-selected='true'] { background: var(--surface); color: var(--ink); box-shadow: 0 0 0 1px var(--line); }.cancel-reconnect { position: absolute; top: 22px; right: 0; }.text-button { border: 0; background: transparent; color: var(--muted); cursor: pointer; }
.guide-content { margin-top: 16px; }.guide-content > p { color: var(--muted); }
.step-list { margin: 0 0 14px; padding-left: 18px; color: var(--muted); font-size: 12px; line-height: 1.55; }
.step-list li { margin-bottom: 6px; }
.qr-caption { margin: 0; color: var(--muted); font-size: 11px; }
select { width: 100%; min-height: 40px; padding: 8px 10px; border: 1px solid var(--line-strong); border-radius: var(--radius-sm); background: var(--surface-raised); color: var(--ink); }.inline-form, .date-grid { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 10px; align-items: end; }.manual-form { display: grid; gap: 12px; }.manual-form .button { justify-self: start; }label span, .capture-session span { display: block; margin-bottom: 5px; color: var(--muted); font-size: 10px; }input { width: 100%; min-height: 40px; padding: 8px 10px; border: 1px solid var(--line-strong); border-radius: var(--radius-sm); outline: 0; background: var(--surface-raised); color: var(--ink); }input:focus { border-color: var(--accent); }
.capture-session { display: grid; gap: 12px; }.capture-address strong { font-family: var(--font-mono); font-size: 18px; }.qr-wrap { width: max-content; padding: 8px; border-radius: 6px; background: white; }.capture-session code, .path-value { display: block; overflow-wrap: anywhere; color: var(--muted); font-family: var(--font-mono); font-size: 10px; }.capture-diagnostics { display: grid; grid-template-columns: repeat(3, 1fr); gap: 1px; margin: 0; background: var(--line); }.capture-diagnostics div { padding: 9px; background: var(--surface-raised); }.capture-diagnostics dt { color: var(--muted); font-size: 9px; }.capture-diagnostics dd { margin: 3px 0 0; }
.setting-row > div { min-width: 0; }.switch { width: 44px; height: 25px; flex: 0 0 44px; padding: 3px; border: 1px solid var(--line-strong); border-radius: 999px; background: var(--surface-raised); cursor: pointer; }.switch span { display: block; width: 17px; height: 17px; border-radius: 50%; background: var(--muted); transition: transform 150ms ease, background-color 150ms ease; }.switch[aria-checked='true'] { border-color: var(--accent); background: color-mix(in srgb, var(--accent) 24%, var(--surface-raised)); }.switch[aria-checked='true'] span { transform: translateX(19px); background: var(--accent); }
.theme-options { display: grid; grid-template-columns: repeat(3, 1fr); gap: 7px; margin-top: 15px; }.theme-options button { display: flex; min-height: 44px; align-items: center; gap: 8px; padding: 9px 11px; border: 1px solid var(--line); border-radius: var(--radius-sm); background: transparent; color: var(--muted); cursor: pointer; }.theme-options button span { flex: 1; color: var(--ink); text-align: left; }.theme-options button[aria-checked='true'] { border-color: var(--accent); color: var(--accent); background: color-mix(in srgb, var(--accent) 7%, transparent); }
.advanced > summary { display: flex; align-items: center; justify-content: space-between; cursor: pointer; list-style: none; }.advanced > summary::-webkit-details-marker { display: none; }.advanced > summary strong { font-size: 17px; }.advanced[open] > summary > svg { transform: rotate(180deg); }.advanced-content { margin-top: 18px; border-top: 1px solid var(--line); }.advanced-block { padding: 20px 0; border-bottom: 1px solid var(--line); }.advanced-block:last-child { border-bottom: 0; padding-bottom: 0; }
.stream-list { margin-top: 14px; border-top: 1px solid var(--line); }.stream-row { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 6px 18px; padding: 13px 0; border-bottom: 1px solid var(--line); }.stream-main { display: flex; flex-wrap: wrap; gap: 5px 14px; }.stream-main strong { min-width: 90px; }.stream-main span { color: var(--muted); font-size: 10px; }.stream-state { font-size: 11px; }.stream-row details { grid-column: 1 / -1; }.stream-row details summary, .capability-details summary { color: var(--muted); font-size: 10px; cursor: pointer; }.stream-row details p { margin: 7px 0 0; font-family: var(--font-mono); font-size: 10px; }.capability-details { margin-top: 13px; }.capability-details ul { margin: 8px 0 0; padding: 0; list-style: none; }.capability-details li { display: flex; justify-content: space-between; gap: 15px; padding: 7px 0; border-bottom: 1px solid var(--line); color: var(--muted); font-size: 10px; }.capability-details strong { max-width: 65%; color: var(--ink); text-align: right; }.technical-note { margin-top: 10px; color: var(--muted); font-family: var(--font-mono); font-size: 10px; }
.date-grid { grid-template-columns: 1fr 1fr; }
.alert { display: flex; align-items: flex-start; gap: 7px; margin-top: 12px; padding: 10px 11px; border: 1px solid var(--line); border-radius: var(--radius-sm); color: var(--muted); font-size: 11px; }.alert.success { color: var(--accent); }.alert.danger { color: var(--danger); }.alert button { margin-left: auto; border: 0; background: transparent; color: inherit; cursor: pointer; }
code { color: var(--muted); font-family: var(--font-mono); font-size: 10px; }
@media (max-width: 760px) { .page { padding: 24px 16px 38px; }.settings-section { padding: 17px 16px; }.section-heading, .setting-row, .block-heading { align-items: flex-start; }.block-heading { flex-direction: column; }.theme-options { grid-template-columns: 1fr; }.inline-form, .date-grid { grid-template-columns: 1fr; }.cancel-reconnect { position: static; display: block; margin-top: 8px; }.stream-main { display: grid; }.capture-diagnostics { grid-template-columns: 1fr; } }
@media (prefers-reduced-motion: reduce) { .switch span { transition: none; } }
</style>
