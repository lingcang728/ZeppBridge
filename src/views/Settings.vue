<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue';
import { RouterLink } from 'vue-router';
import BackupPanel from '../components/BackupPanel.vue';
import DesignIcon from '../components/DesignIcon.vue';
import DeviceVisual from '../components/DeviceVisual.vue';
import HistoryArchivePanel from '../components/HistoryArchivePanel.vue';
import Icon from '../components/Icon.vue';
import SelectMenu from '../components/SelectMenu.vue';
import { deviceStateLabel, useDeviceAssignment, useDevices } from '../composables/useDevices';
import { useSyncController } from '../composables/useSyncController';
import { AUTO_SYNC_INTERVALS } from '../lib/autoSync';
import { UI_SCALES, useUiScale, type UiScale } from '../composables/useUiScale';
import { backend, toUserMessage } from '../lib/bridge';
import { regionShortName } from '../lib/deviceCopy';
import { BACKFILL_RANGE_DAYS, rangeOptions } from '../lib/rangeOptions';
import type {
  CapabilityItem,
  CapabilityOverview,
  CapabilityProbe,
  LocalApiStatus,
  LoginStatus,
  UserPrefs,
  WorkoutCodeLabel,
} from '../types';
import { checkForDesktopUpdate, downloadAndInstallDesktopUpdate, updateState } from '../services/updateService';
import { settingsMessages } from './Settings.i18n';
import { intlLocale, locale, LOCALES, LOCALE_LABELS, setLocale, useMessages } from '../i18n';
import {
  DISTANCE_UNITS,
  distanceUnit,
  distanceUnitOptionLabel,
  setDistanceUnit,
} from '../lib/units';
import { errorTextFor } from '../i18n/errors';
import { backendText } from '../i18n/backendText';
import { storageEstimateText } from '../lib/storageEstimateText';

const t = useMessages(settingsMessages);

const lookup = (table: unknown, key: string): string | undefined =>
  (table as Record<string, string | undefined>)[key];

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

/* 设备型号指认与未识别运动编号命名。
   两者都是「本机推不出来，就问用户」，而不是让应用去猜：
   有些账号的设备响应里根本没有任何产品名字段（只有 deviceSource / deviceType
   这类数字），Zepp 的自定义训练模板也只给编号不给名字。 */
/* 指认动作本身住在设备二级页（/devices/:deviceKey）；这里只显示它留下的结果，
   状态共享自 useDeviceAssignment，两处不会各说各话。 */
const { assignError: deviceAssignError, assignMessage: deviceAssignMessage } = useDeviceAssignment();
const unknownCodes = ref<WorkoutCodeLabel[]>([]);
const codeDrafts = ref<Record<number, string>>({});
const codeBusy = ref<number | null>(null);
const codeError = ref<string | null>(null);
const codeMessage = ref<string | null>(null);

/* 一块板子上的所有数据流，按「已获取 → 云端有但本机没收 → 还没拿到」排。
   状态分三档而不是两档：「云端有、本机未收录」既不是拿到了，也不是没有，
   压成任何一档都会骗人。 */
const capabilityBoard = computed(() => [
  ...capabilityAvailable.value.map((row) => ({ ...row, state: 'on', lamp: 'on', note: undefined as string | undefined })),
  ...capabilityNotIngested.value.map((row) => ({ ...row, state: 'pending', lamp: 'pending' })),
  ...capabilityMissing.value.map((row) => ({ ...row, state: 'off', lamp: 'off', note: undefined as string | undefined })),
]);

const compactBusy = ref(false);
const compactMessage = ref<string | null>(null);
const compactError = ref<string | null>(null);

const formatBytes = (bytes: number): string => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1048576).toFixed(1)} MB`;
  return `${(bytes / 1073741824).toFixed(2)} GB`;
};

const runCompactPayloads = async () => {
  compactBusy.value = true;
  compactError.value = null;
  compactMessage.value = null;
  try {
    const result = await backend.compactRawPayloads();
    if (!result.compacted && !result.skipped) {
      compactMessage.value = t.value.nothingToCompact;
    } else {
      const saved = result.bytesBefore - result.bytesAfter;
      const skipped = result.skipped ? t.value.compactSkipped(result.skipped) : '';
      compactMessage.value = t.value.compactDone(
        result.compacted,
        formatBytes(result.bytesBefore),
        formatBytes(result.bytesAfter),
        formatBytes(saved),
        skipped,
      );
    }
    try {
      storageEstimate.value = await backend.getStorageEstimate(historyDays.value);
    } catch {
      // 估算刷新失败不影响压缩本身已经完成的事实
    }
  } catch (error) {
    compactError.value = toUserMessage(error, t.value.compactFailed);
  } finally {
    compactBusy.value = false;
  }
};

const MCP_TOOLS = computed(() => [
  { name: 'list_workouts', detail: t.value.mcpToolListWorkouts },
  { name: 'get_workout_insight', detail: t.value.mcpToolWorkoutInsight },
  { name: 'get_metric_series', detail: t.value.mcpToolMetricSeries },
  { name: 'get_sleep_detail', detail: t.value.mcpToolSleepDetail },
  { name: 'get_data_health', detail: t.value.mcpToolDataHealth },
]);

/* 与其在界面上写一大篇配置教程，不如给用户一段能直接丢给 AI 的话。
   配置细节因工具、因操作系统、因安装路径而异，AI 看着他的实际情况给指引，
   比这里写死的四步准得多；用户本来也就是要截图去问 AI 的。
   两种语言的提示词都在 Settings.i18n.ts 里。 */
const mcpConfigExample = computed(() => `{
  "mcpServers": {
    "zeppbridge": {
      "command": "${t.value.mcpConfigPathPlaceholder}",
      "args": []
    }
  }
}`);

const mcpMessage = ref<string | null>(null);
const copyMcpPrompt = async () => {
  try {
    await navigator.clipboard.writeText(t.value.mcpSetupPrompt);
    mcpMessage.value = t.value.mcpPromptCopied;
  } catch {
    mcpMessage.value = t.value.mcpPromptCopyFailed;
  }
};

const copyMcpConfig = async () => {
  try {
    await navigator.clipboard.writeText(mcpConfigExample.value);
    mcpMessage.value = t.value.mcpConfigCopied;
  } catch {
    mcpMessage.value = t.value.mcpConfigCopyFailed;
  }
};

const RETENTION_CHOICES = computed(() =>
  [30, 90, 180, 365].map((days) => ({ value: days, label: t.value.days(days) })));
/* 选项来自 lib/rangeOptions.ts 的那条唯一梯子。以前这里写死 [7,30,90,365]，
   而后端的补拉默认值是 180——180 不在选项里，下拉就匹配不到任何一项，
   全新安装时这个框是空的。 */
const HISTORY_CHOICES = computed(() =>
  rangeOptions(BACKFILL_RANGE_DAYS).map((range) => ({ value: range.days, label: range.label })));
const EXPORT_FORMAT_CHOICES = computed(() => [
  { value: 'json', label: 'JSON', hint: t.value.formatJsonHint },
  { value: 'csv', label: 'CSV', hint: t.value.formatCsvHint },
  { value: 'gpx', label: 'GPX', hint: t.value.formatGpxHint },
]);

const unnamedCodeCount = computed(() => unknownCodes.value.filter((entry) => !entry.label).length);

const deviceKeyFor = (model: { profile: { device_id?: string | null; serial?: string | null } }): string =>
  (model.profile.device_id || model.profile.serial || '').trim();

const loadCorrections = async () => {
  const codes = await backend.getUnknownWorkoutCodes().catch(() => [] as WorkoutCodeLabel[]);
  unknownCodes.value = codes;
  codeDrafts.value = Object.fromEntries(codes.map((entry) => [entry.zeppType, entry.label]));
};

/* 起名字的快捷入口。这些只是「少打几个字」，不是对编号的识别结论——
   点一下只是把文本填进输入框，用户仍然可以改成任何名字。 */
const CODE_NAME_SUGGESTIONS = computed(() => t.value.codeSuggestions);



const saveCodeLabel = async (zeppType: number) => {
  codeBusy.value = zeppType;
  codeError.value = null;
  codeMessage.value = null;
  try {
    const draft = (codeDrafts.value[zeppType] || '').trim();
    unknownCodes.value = await backend.setWorkoutCodeLabel(zeppType, draft || null);
    codeDrafts.value = Object.fromEntries(unknownCodes.value.map((entry) => [entry.zeppType, entry.label]));
    codeMessage.value = draft
      ? t.value.codeSaved(zeppType, draft)
      : t.value.codeCleared(zeppType);
    markDataChanged();
  } catch (error) {
    codeError.value = toUserMessage(error, t.value.codeSaveFailed);
  } finally {
    codeBusy.value = null;
  }
};

/* 这里曾有三个只写 localStorage、没有任何后端行为的开关（本地数据加密 /
   启动解锁保护 / 匿名使用洞察）。一个默认打开、写着「加密保护」却什么都不做的
   开关，和把缺失值填成 0 的曲线是同一种错误，所以它们被删掉，而不是留成
   「计划中」继续占位。顺手清掉旧安装遗留的偏好值。 */
const STALE_PRIVACY_PREF_KEYS = [
  'zeppbridge-pref-encrypt',
  'zeppbridge-pref-launch-lock',
  'zeppbridge-pref-anon',
];
const clearStalePrivacyPrefs = () => {
  for (const key of STALE_PRIVACY_PREF_KEYS) window.localStorage.removeItem(key);
};

/* 本机 API 的界面状态。token 默认遮罩，只有用户点「显示」或「复制」才会向
   后端要明文。 */
const localApiBusy = ref(false);
const localApiToken = ref<string | null>(null);
const localApiTokenVisible = ref(false);
const localApiMessage = ref<string | null>(null);
const localApiError = ref<string | null>(null);
const maskedToken = computed(() => {
  const token = localApiToken.value;
  if (!token) return '••••••••••••••••';
  return `${token.slice(0, 8)}${'•'.repeat(16)}${token.slice(-4)}`;
});

/* 默认导出格式持久化 */
const defaultExportFormat = ref(window.localStorage.getItem('zeppbridge-default-export-format') || 'json');
const onExportFormatChange = () => {
  window.localStorage.setItem('zeppbridge-default-export-format', defaultExportFormat.value);
};

/* 隐私政策弹窗 */
const privacyModalOpen = ref(false);
const updateNotesOpen = ref(false);

/** 卡片上只放第一行；完整说明在弹窗里，免得把一整篇 Release notes 压成一段。 */
const releaseTeaser = computed(() => {
  const notes = updateState.notes.trim();
  if (!notes) return t.value.releaseNotesEmpty;
  const firstLine = notes
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find(Boolean) ?? notes;
  return firstLine.length > 60 ? `${firstLine.slice(0, 60)}…` : firstLine;
});

/* 一发现新版本就把「更新了什么」摆到用户面前。
   只报一个版本号的话，用户没有任何依据判断这次该不该更新。 */
watch(() => updateState.status, (status) => {
  if (status === 'available') updateNotesOpen.value = true;
});
const updateBusy = computed(() => ['checking', 'downloading', 'installing'].includes(updateState.status));
const updateProgress = computed(() => updateState.totalBytes
  ? Math.min(100, Math.round(updateState.downloadedBytes / updateState.totalBytes * 100))
  : null);
const updateStatusLabel = computed(() => ({
  idle: t.value.updateStatusIdle,
  checking: t.value.updateStatusChecking,
  available: t.value.updateStatusAvailable(updateState.version),
  downloading: updateProgress.value === null
    ? t.value.updateStatusDownloading
    : t.value.updateStatusDownloadingPercent(updateProgress.value),
  installing: t.value.updateStatusInstalling,
  failed: t.value.updateStatusFailed,
  upToDate: t.value.updateStatusUpToDate,
  unmanaged: t.value.updateStatusUnmanaged,
}[updateState.status]));

const formatUpdateBytes = (bytes: number) => bytes < 1024 * 1024
  ? `${(bytes / 1024).toFixed(1)} KB`
  : `${(bytes / 1024 / 1024).toFixed(1)} MB`;

/* 弹窗全程不关：下载和安装的进度都显示在更新说明下面。
   用户想干别的可以点「在后台继续」把弹窗收起来，下载不受影响。 */
const installUpdate = async () => {
  await downloadAndInstallDesktopUpdate();
};

const connected = computed(() => appStatus.value?.connection_state === 'connected');
const configuredOnly = computed(() => appStatus.value?.connection_state === 'configured');
const accountRecognized = computed(() => connected.value || configuredOnly.value);
const unknownDeviceDetected = computed(() => accountRecognized.value && (
  deviceModels.value.length === 0
  || deviceModels.value.some((model) => model.profile.match_status === 'unknown')
));
const loginInProgress = computed(() => ['waiting', 'extracting', 'verifying'].includes(String(loginStatus.value.state)));
const retentionDays = ref(appStatus.value?.retention_days ?? 365);
const historyDays = ref(appStatus.value?.history_sync_days ?? 30);
const storageEstimate = ref(appStatus.value?.storage ?? null);
const prefsBusy = ref(false);
/** 完整偏好（含归档开关）。AppStatus 只带保留期与补拉窗口。 */
const userPrefs = ref<UserPrefs | null>(null);

/* 登录窗口那几行进度和失败原因原本直接显示后端字符串——全是中文。后端现在
   给的是稳定码，这里按界面语言取文案，取不到才回落到那句中文原文。 */
const BUILD_STAMP = __BUILD_STAMP__;

const estimateText = computed(() => storageEstimateText(storageEstimate.value));

const loginMessage = computed(() => {
  const status = loginStatus.value;
  if (!status.message && !status.code) return '';
  return errorTextFor(status.code) ?? backendText(status.message, '');
});

const connectionLabel = computed(() => {
  if (loginInProgress.value) {
    if (loginStatus.value.state === 'extracting') return t.value.connExtracting;
    if (loginStatus.value.state === 'verifying') return t.value.connVerifying;
    return t.value.connWaiting;
  }
  if (loginStatus.value.state === 'failed') return t.value.connFailed;
  if (connected.value || configuredOnly.value) return deviceStateLabel('account');
  return deviceStateLabel('unknown');
});

const accountLabel = computed(() => appStatus.value?.masked_user_id || t.value.unidentified);
const accountInitial = computed(() =>
  accountLabel.value.match(/[A-Za-z0-9]/)?.[0]?.toUpperCase() || t.value.unidentifiedInitial);
const regionLabel = computed(() => regionShortName(appStatus.value?.region_host));
const regionHost = computed(() => appStatus.value?.region_host || t.value.notProvided);

const formatDateTime = (value?: string): string => {
  if (!value) return t.value.noRecords;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return t.value.timeUnknown;
  return new Intl.DateTimeFormat(intlLocale(), {
    year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
  }).format(date).replace(/\//g, '-');
};

/* 保留天数是「往回保留最近 N 天」，不是「N 天后清理」，而且清理只在每次成功
   同步之后执行。所以这里显示会被保留的最早日期，不再显示一个算错的未来日期。 */
const retentionCutoffDate = computed(() => {
  const date = new Date();
  date.setDate(date.getDate() - Number(retentionDays.value || 30));
  return new Intl.DateTimeFormat(intlLocale(), { year: 'numeric', month: '2-digit', day: '2-digit' }).format(date).replace(/\//g, '-');
});

const dataSources = computed(() => [
  {
    kind: 'cloud' as const,
    name: 'Zepp Cloud',
    sub: t.value.cloudService,
    icon: 'cloud' as const,
    state: accountRecognized.value ? ('account' as const) : ('unknown' as const),
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
      deviceRefreshError.value = t.value.refreshFailed(
        refreshError ? t.value.refreshFailedReason(refreshError) : t.value.refreshFailedPeriod,
      );
    } else if (deviceCache.value?.refreshed) {
      deviceRefreshMessage.value = t.value.refreshDone(deviceModels.value.length);
    } else {
      deviceRefreshMessage.value = t.value.refreshNoNewList;
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
    // status.message 是后端的中文原文，只能兜底；先按码取当前语言的说法。
    loginError.value = errorTextFor(status.code)
      ?? backendText(status.message, t.value.loginIncomplete);
  }
};

const startLogin = async () => {
  loginError.value = null;
  loginBusy.value = true;
  reconnecting.value = true;
  try {
    await applyLoginStatus(await backend.startWebLogin(locale.value));
  } catch (error) {
    loginStatus.value = { state: 'failed', message: toUserMessage(error, t.value.loginWindowFailed), page_url: '' };
    loginError.value = toUserMessage(error, t.value.loginWindowFailed);
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
    loginError.value = toUserMessage(error, t.value.loginCancelFailed);
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
      filters: [{ name: t.value.harFilter, extensions: ['har', 'json'] }],
    });
    if (!selected) return;
    loginBusy.value = true;
    loginError.value = null;
    try {
      const harPath = typeof selected === 'string' ? selected : (selected as { path: string }).path;
      await backend.importFromHar(harPath);
      await refreshStatus();
      loginError.value = null;
      dataMessage.value = t.value.harImported;
    } catch (error) {
      loginError.value = toUserMessage(error, t.value.harImportFailed);
    } finally {
      loginBusy.value = false;
    }
  } catch (error) {
    loginError.value = toUserMessage(error, t.value.filePickerFailed);
  }
};

// 手动认证
const submitManualAuth = async () => {
  if (!manualAppToken.value || !manualUserId.value || !manualRegionHost.value) {
    loginError.value = t.value.fillAllFields;
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
    dataMessage.value = t.value.manualAuthDone;
  } catch (error) {
    loginError.value = toUserMessage(error, t.value.manualAuthFailed);
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
    dataError.value = toUserMessage(error, t.value.verifyFailed);
  }
};

const clampDays = (value: number) => Math.min(365, Math.max(1, Math.round(value) || 1));

const clearAuth = async () => {
  if (!window.confirm(t.value.clearAuthConfirm)) return;
  dataError.value = null;
  try {
    await backend.clearAuth();
    await refreshStatus();
    reconnecting.value = false;
    loginStatus.value = { state: 'idle', message: '', page_url: '' };
    dataMessage.value = t.value.authCleared;
  } catch (error) {
    dataError.value = toUserMessage(error, t.value.clearAuthFailed);
  }
};

const reprocessLocalData = async () => {
  dataBusy.value = 'reprocess';
  dataError.value = null;
  dataMessage.value = null;
  try {
    const result = await backend.reprocessLocalData();
    dataMessage.value = t.value.reprocessed(result.total_records);
    markDataChanged();
    await refreshStatus();
  } catch (error) {
    dataError.value = toUserMessage(error, t.value.reprocessFailed);
  } finally {
    dataBusy.value = null;
  }
};

const cleanupData = async () => {
  if (!window.confirm(t.value.cleanupConfirm(retentionDays.value))) return;
  dataBusy.value = 'cleanup';
  dataError.value = null;
  try {
    await backend.cleanupOldData(retentionDays.value);
    dataMessage.value = t.value.cleanupDone(retentionDays.value);
    storageEstimate.value = await backend.getStorageEstimate(retentionDays.value).catch(() => null);
    markDataChanged();
  } catch (error) {
    dataError.value = toUserMessage(error, t.value.cleanupFailed);
  } finally {
    dataBusy.value = null;
  }
};

const openDataFolder = async () => {
  try { await backend.openDataFolder(); }
  catch (error) { dataError.value = toUserMessage(error, t.value.openFolderFailed); }
};

const ensureLocalApiToken = async (): Promise<string | null> => {
  if (localApiToken.value) return localApiToken.value;
  try {
    localApiToken.value = await backend.revealLocalApiToken();
    return localApiToken.value;
  } catch (error) {
    localApiError.value = toUserMessage(error, t.value.apiTokenReadFailed);
    return null;
  }
};

const toggleLocalApi = async () => {
  const next = !localApiStatus.value?.enabled;
  localApiBusy.value = true;
  localApiError.value = null;
  localApiMessage.value = null;
  try {
    localApiStatus.value = await backend.setLocalApiEnabled(next);
    if (localApiStatus.value.error) {
      localApiError.value = localApiStatus.value.error;
    } else if (next) {
      localApiMessage.value = t.value.apiEnabled;
    } else {
      localApiToken.value = null;
      localApiTokenVisible.value = false;
      localApiMessage.value = t.value.apiDisabled;
    }
  } catch (error) {
    localApiError.value = toUserMessage(error, t.value.apiToggleFailed);
  } finally {
    localApiBusy.value = false;
  }
};

const toggleTokenVisibility = async () => {
  if (localApiTokenVisible.value) {
    localApiTokenVisible.value = false;
    return;
  }
  localApiError.value = null;
  if (await ensureLocalApiToken()) localApiTokenVisible.value = true;
};

const copyLocalApiToken = async () => {
  localApiError.value = null;
  localApiMessage.value = null;
  const token = await ensureLocalApiToken();
  if (!token) return;
  try {
    await navigator.clipboard.writeText(token);
    localApiMessage.value = t.value.apiTokenCopied;
  } catch {
    localApiError.value = t.value.apiTokenCopyFailed;
  }
};

const regenerateLocalApiToken = async () => {
  if (!window.confirm(t.value.apiRegenerateConfirm)) return;
  localApiBusy.value = true;
  localApiError.value = null;
  localApiMessage.value = null;
  try {
    localApiToken.value = await backend.rotateLocalApiToken();
    localApiTokenVisible.value = true;
    localApiStatus.value = await backend.getLocalApiStatus();
    localApiMessage.value = t.value.apiTokenRegenerated;
  } catch (error) {
    localApiError.value = toUserMessage(error, t.value.apiRegenerateFailed);
  } finally {
    localApiBusy.value = false;
  }
};

const copyLocalApiExample = async () => {
  localApiError.value = null;
  localApiMessage.value = null;
  const baseUrl = localApiStatus.value?.base_url || 'http://127.0.0.1:43921';
  const token = await ensureLocalApiToken();
  if (!token) return;
  try {
    await navigator.clipboard.writeText(
      `curl.exe -H "Authorization: Bearer ${token}" "${baseUrl}/workouts/WORKOUT_ID/series"`,
    );
    localApiMessage.value = t.value.apiExampleCopied;
  } catch {
    localApiError.value = t.value.apiExampleCopyFailed;
  }
};

/* 用户自己写的一句说明。
 *
 * 只发字段结构和编号时，收到报告的人经常判断不出这是哪一款表；
 * 「我的表是 Balance 2，但显示未识别」这一句往往比十个字段都管用。
 * 自由文本会在后端过一遍脱敏（本机路径、邮箱、长串标识）并截到 500 字。 */
const DIAGNOSTIC_NOTE_MAX = 500;
/* 让用户自己说要报什么。
   本机的自动检测只能发现「有未识别的设备或运动编号」；用户遇到的可能是
   别的（数据对不上、某项一直是空）。以前这些人会被「无需提交报告」顶回去，
   而界面上又没有任何地方能说明情况。 */
const REPORT_CATEGORIES = computed(() =>
  (['device', 'workout', 'data', 'other'] as const).map((value) => ({
    value,
    label: t.value.reportCategory[value].label,
    hint: t.value.reportCategory[value].hint,
  })));
const diagnosticCategory = ref<string>('');
const diagnosticNote = ref('');
const diagnosticResult = ref<{ reportId: string; submittedAt: string } | null>(null);
const diagnosticError = ref<string | null>(null);

const submitDiagnosticReport = async () => {
  const confirmed = window.confirm(t.value.reportConfirm);
  if (!confirmed) return;
  diagnosticBusy.value = true;
  diagnosticError.value = null;
  diagnosticResult.value = null;
  dataError.value = null;
  dataMessage.value = null;
  try {
    const note = diagnosticNote.value.trim();
    const result = await backend.submitDiagnosticReport(
      note || undefined,
      diagnosticCategory.value || undefined,
    );
    diagnosticResult.value = { reportId: result.reportId, submittedAt: result.submittedAt };
    diagnosticNote.value = '';
    diagnosticCategory.value = '';
  } catch (error) {
    diagnosticError.value = toUserMessage(error, t.value.reportFailed);
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
    if (!window.confirm(t.value.retentionConfirm(retention))) return;
  }
  prefsBusy.value = true;
  try {
    const prefs = await backend.setUserPrefs(retention, history);
    userPrefs.value = prefs;
    retentionDays.value = prefs.retention_days;
    historyDays.value = prefs.history_sync_days;
    try {
      storageEstimate.value = await backend.getStorageEstimate(history);
    } catch {
      dataError.value = t.value.prefsSavedNoEstimate;
    }
    dataMessage.value = t.value.prefsSaved;
    await refreshStatus();
  } catch (error) {
    dataError.value = toUserMessage(error, t.value.prefsSaveFailed);
  } finally {
    prefsBusy.value = false;
  }
};

/** 归档面板改了偏好，回写到设置页自己的几个 ref，避免两处说法不一致。 */
const applyPrefsChange = (prefs: UserPrefs) => {
  userPrefs.value = prefs;
  retentionDays.value = prefs.retention_days;
  historyDays.value = prefs.history_sync_days;
  void refreshStatus();
};

const confirmHistorySync = async () => {
  if (isSyncing.value) {
    dataError.value = t.value.syncInProgress;
    return;
  }
  const days = clampDays(Number(historyDays.value));
  historyDays.value = days;
  if (days >= 90) {
    const minutes = Math.max(2, Math.round(0.75 + days * 0.05));
    const extra = days >= 365 ? t.value.backfillYearCap : '';
    if (!window.confirm(t.value.backfillConfirm(days, minutes, minutes + 3, extra))) return;
  }
  // 这两句原本直接显示后端的 `message`——那是中文原文，英文界面上就这么露出来了。
  // 文案实现只有 lib/storageEstimateText.ts 一份，不要在这里再抄一遍。
  if (storageEstimate.value && !storageEstimate.value.allow_long_history && days >= 90) {
    dataError.value = storageEstimateText(storageEstimate.value);
    return;
  }
  if (storageEstimate.value?.warn_tight_space
    && !window.confirm(
      t.value.backfillTightSpace(storageEstimateText(storageEstimate.value), days),
    )) return;
  await runSync('history', days);
};

onMounted(async () => {
  clearStalePrivacyPrefs();
  void loadCapabilityOverview();
  void loadDevices();
  void loadCorrections();
  localApiStatus.value = await backend.getLocalApiStatus().catch(() => null);
  if (localApiStatus.value?.error) localApiError.value = localApiStatus.value.error;
  const status = await refreshStatus();
  retentionDays.value = status?.retention_days ?? 365;
  historyDays.value = status?.history_sync_days ?? 30;
  storageEstimate.value = status?.storage ?? null;
  userPrefs.value = await backend.getUserPrefs().catch(() => null);
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

/* 数据流名在 Settings.i18n.ts。特别注意 spo2 那一项：它数的是 daily_metrics
   里 spo2_* 那几项（ODI、夜间评分、实测时长），全部来自夜间测量；身体状态页
   画的是 metric_samples 里的逐条读数，两者是不同的东西。都叫「血氧」会让人
   以为「有数据」却看不到曲线，所以这里叫「夜间血氧指标」。 */
const streamLabel = (stream: string): string => lookup(t.value.stream, stream) ?? stream;

const surfaceLabels: Record<string, string> = {
  v2_events: '/v2/users/me/events',
  user_events: '/users/{id}/events',
  user_events_day: '/users/{id}/events/dateString',
  file_info_events: '/users/me/fileInfo/events',
};

const capabilityRow = (item: CapabilityItem) => ({
  key: item.stream,
  label: streamLabel(item.stream),
  detail:
    item.status === 'available' && item.ingested !== false
      ? t.value.capabilityLocal(item.records, unitLabel(item), item.latestDate ?? '')
      : item.status === 'available'
        // 数量前面必须写清是云端的，否则读起来就像本机已经有了。
        ? t.value.capabilityCloud(item.records, unitLabel(item), item.latestDate ?? '')
        : capabilityNote(item),
  note: item.ingested === false ? capabilityNote(item) : null,
});

/* 单位和说明都按后端发来的码渲染，不用后端那份中文。
   后端仍然带着中文 recordsUnit / note，那是 CLI、MCP 和本机 API 的输出，
   不跟界面语言走。 */
const unitLabel = (item: CapabilityItem): string =>
  (item.recordsUnitCode === 'days' ? t.value.unitDays : t.value.unitRecords);

const capabilityNote = (item: CapabilityItem): string => {
  const windowDays = item.windowDays ?? 0;
  if (item.status === 'available' && item.ingested === false) return t.value.capabilityNotIngested;
  if (item.status === 'unsupported') return t.value.capabilityUnsupported;
  if (item.status === 'unknown') return t.value.capabilityNotProbed;
  if (item.status === 'no_records') {
    return item.source === 'probed'
      ? t.value.capabilityNoneProbed(windowDays)
      : t.value.capabilityNoRecords(windowDays);
  }
  // 后端加了新的状态而界面还不认识：英文界面下不吐中文原文。
  return backendText(item.note, '');
};

/* 三分，不是两分。
 *
 * 「云端有」和「本机有」是两件事：血压和体重目前只做探测，不做归一化——
 * 缺少可核对的报文样本，贸然解析只会产出没人能验证的数字。把它们和真正
 * 收录了的数据流并排放在「可提供给 AI」里，会让人以为 ZeppBridge 已经
 * 存着他的血压，那是这个产品最不该给出的错觉。 */
const capabilityAvailable = computed(() =>
  (capabilityOverview.value?.items ?? [])
    .filter((item) => item.status === 'available' && item.ingested !== false)
    .map(capabilityRow),
);

const capabilityNotIngested = computed(() =>
  (capabilityOverview.value?.items ?? [])
    .filter((item) => item.status === 'available' && item.ingested === false)
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
  return days <= 0 ? t.value.probedToday : t.value.probedDaysAgo(days);
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
        ? t.value.probeRecords(probe.records, probe.latestDate ?? '')
        : probe.status === 'empty'
          ? t.value.probeEmpty
          : probe.status === 'unavailable'
            ? t.value.probeRefused
            : t.value.probeFailed;
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
        <h1 id="settings-title">{{ t.title }}</h1>
        <p class="page-intro">{{ t.intro }}</p>
      </div>
      <!-- 语言开关标签是双语的，而且不跟着界面语言变：一个看不懂中文的人
           必须能在中文界面上找到它，反过来也一样。 -->
      <div class="locale-switch">
        <p class="advanced-label">语言 · Language</p>
        <div class="scale-options" role="radiogroup" aria-label="语言 · Language">
          <button
            v-for="option in LOCALES"
            :key="option"
            type="button"
            role="radio"
            :aria-checked="locale === option"
            @click="setLocale(option)"
          >{{ LOCALE_LABELS[option] }}</button>
        </div>
      </div>
      <!-- 单位就放在语言旁边：问「怎么把 km 换成 miles」的人（Reddit
           u/Andrew-Scoggins）第一个会找的就是这里。导出永远是公制，界面才跟着这个走。 -->
      <div class="locale-switch">
        <p class="advanced-label">{{ t.distanceUnitLabel }}</p>
        <div class="scale-options" role="radiogroup" :aria-label="t.distanceUnitLabel">
          <button
            v-for="option in DISTANCE_UNITS"
            :key="option"
            type="button"
            role="radio"
            :aria-checked="distanceUnit === option"
            @click="setDistanceUnit(option)"
          >{{ distanceUnitOptionLabel(option) }}</button>
        </div>
      </div>
    </header>

    <div v-if="statusError" class="alert danger" role="alert">
      <Icon name="warning" :size="15" />{{ statusError }}
      <button type="button" @click="() => refreshStatus()">{{ t.retry }}</button>
    </div>
    <div v-if="syncState !== 'idle'" :class="['alert', syncState === 'failed' ? 'danger' : 'success']" role="status">
      <Icon :name="syncState === 'failed' ? 'warning' : 'info'" :size="15" />{{ syncMessage }}
    </div>
    <div v-if="loginError" class="alert danger" role="alert"><Icon name="warning" :size="15" />{{ loginError }}</div>
    <div v-if="dataMessage" class="alert success"><Icon name="circle-check" :size="15" />{{ dataMessage }}</div>
    <div v-if="dataError" class="alert danger" role="alert"><Icon name="warning" :size="15" />{{ dataError }}</div>

    <!-- 1. 认证方式 -->
    <section class="settings-card" aria-labelledby="auth-title">
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
          <input id="manual-apptoken" v-model="manualAppToken" type="text" :placeholder="t.manualTokenPlaceholder" :disabled="manualAuthBusy" />
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

    <!-- 2 列网格：账户与区域 + 连接设备 -->
    <div class="two-col">
      <!-- 2. 账户与区域 -->
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

      <!-- 3. 连接设备 / 数据来源 -->
      <section class="settings-card" aria-labelledby="devices-title">
        <div class="section-heading-row">
          <h2 id="devices-title">{{ t.devicesTitle }}</h2>
          <button class="button secondary identify-button" type="button" :disabled="deviceRefreshBusy" @click="refreshDevices">
            <Icon name="sync" :size="14" :class="{ spinning: deviceRefreshBusy }" />
            {{ deviceRefreshBusy ? t.identifying : t.identifyDevices }}
          </button>
        </div>
        <div v-if="deviceRefreshError" class="alert danger device-alert" role="alert"><Icon name="warning" :size="14" />{{ deviceRefreshError }}</div>
        <div v-if="deviceRefreshMessage" class="alert success device-alert" role="status"><Icon name="circle-check" :size="14" />{{ deviceRefreshMessage }}</div>
        <div v-if="deviceError && !deviceRefreshError" class="alert warning device-alert" role="status"><Icon name="info" :size="14" />{{ t.deviceErrorPrefix }}{{ deviceError }}</div>

        <div v-if="devicesLoading" class="source-list source-list-loading">
          <div class="source-row skeleton-row"></div>
          <div class="source-row skeleton-row"></div>
        </div>
        <div v-else class="source-list">
          <div v-if="!deviceModels.length" class="device-empty">
            <Icon name="watch" :size="16" />{{ t.noDevices }}
          </div>
          <template v-for="source in dataSources" :key="source.name">
          <div class="source-row">
            <span class="source-icon">
              <DeviceVisual v-if="source.kind === 'device'" :src="source.model.image" :alt="source.name" :kind="source.model.kind" compact />
              <DesignIcon v-else name="zepp-cloud" :size="32" />
            </span>
            <div class="source-copy">
              <strong>{{ source.name }}</strong>
              <span>{{ source.sub }}</span>
              <span v-if="source.kind === 'device'">{{ t.deviceMeta(source.model.firmware, source.model.lastData) }}</span>
              <span v-if="source.kind === 'device'">{{ t.deviceIdLine(maskIdentifier(source.model.profile.device_id || source.model.profile.serial)) }}</span>
            </div>
            <span :class="['source-state', { on: source.state !== 'unknown' }]"><i class="dot"></i>{{ deviceStateLabel(source.state) }}</span>
            <!-- 入口对每台设备都在。识别对了不代表用户同意，识别错了更不能没有退路。 -->
            <RouterLink
              v-if="source.kind === 'device' && deviceKeyFor(source.model)"
              class="button secondary assign-trigger"
              :to="`/devices/${encodeURIComponent(deviceKeyFor(source.model))}`"
            >
              <Icon name="watch" :size="14" />{{ t.viewOrChange }}
            </RouterLink>
          </div>
          </template>
        </div>
        <div v-if="unknownDeviceDetected && !devicesLoading" class="diagnostic-panel unknown-device-report" role="status">
          <strong>{{ t.unknownDeviceTitle }}</strong>
          <p>
            {{ t.unknownDeviceBodyA }}<strong>{{ t.unknownDeviceNoName }}</strong>{{ t.unknownDeviceBodyB }}
          </p>
          <p>{{ t.unknownDeviceReport }}</p>
          <p v-if="deviceAssignError" class="api-error" role="alert">{{ deviceAssignError }}</p>
          <p v-else-if="deviceAssignMessage" class="hint-line ok">{{ deviceAssignMessage }}</p>
          <div class="diagnostic-note">
            <span>{{ t.reportWhat }}<em>{{ t.reportWhatHint }}</em></span>
            <SelectMenu
              v-model="diagnosticCategory"
              :options="REPORT_CATEGORIES"
              :placeholder="t.reportCategoryPlaceholder"
              :aria-label="t.reportCategoryAria"
            />
          </div>
          <label class="diagnostic-note">
            <span>{{ t.reportNote }}<em>{{ t.reportNoteHint }}</em></span>
            <textarea
              v-model="diagnosticNote"
              rows="3"
              :maxlength="DIAGNOSTIC_NOTE_MAX"
              :placeholder="t.reportNotePlaceholder"
            ></textarea>
            <small>{{ t.reportNoteCounter(diagnosticNote.length, DIAGNOSTIC_NOTE_MAX) }}</small>
          </label>
          <button class="button secondary" type="button" :disabled="diagnosticBusy" @click="submitDiagnosticReport">
            <Icon name="send" :size="14" />{{ diagnosticBusy ? t.reportSubmitting : t.reportSubmit }}
          </button>
          <div v-if="diagnosticResult" class="diagnostic-done" role="status">
            <strong><Icon name="circle-check" :size="14" />{{ t.reportDoneTitle }}</strong>
            <p>{{ t.reportDoneLine(diagnosticResult.reportId, formatDateTime(diagnosticResult.submittedAt)) }}</p>
            <p class="diagnostic-done-note">{{ t.reportDoneNote }}</p>
          </div>
          <p v-if="diagnosticError" class="api-error" role="alert">{{ diagnosticError }}</p>
        </div>
      </section>

    </div>

    <section class="settings-card" aria-labelledby="capability-title">
      <div class="section-heading-row">
        <h2 id="capability-title">{{ t.capabilityTitle }}</h2>
        <span v-if="capabilityCheckedAt" class="capability-checked">{{ capabilityCheckedAt }}</span>
      </div>
      <p class="section-description">{{ t.capabilityIntro }}</p>
      <div v-if="capabilityError" class="alert danger device-alert" role="alert">
        <Icon name="warning" :size="14" />{{ capabilityError }}
      </div>

      <!-- 三列竖排会让最长的那一列决定整块高度，右边两列下面全是空的。
           改成一格一条数据流的指示灯：亮 = 本机已有，暗 = 还没拿到。
           横向铺开，多少条流都能把宽度用满，也一眼看得出「亮了几个」。 -->
      <div v-if="capabilityOverview" class="capability-board">
        <p class="capability-legend">
          <span class="legend-item"><i class="lamp on"></i>{{ t.lampOn(capabilityAvailable.length) }}</span>
          <span v-if="capabilityNotIngested.length" class="legend-item"><i class="lamp pending"></i>{{ t.lampPending(capabilityNotIngested.length) }}</span>
          <span class="legend-item"><i class="lamp off"></i>{{ t.lampOff(capabilityMissing.length) }}</span>
        </p>

        <ul class="capability-grid">
          <li
            v-for="row in capabilityBoard"
            :key="row.key"
            :class="['capability-cell', row.state]"
          >
            <span class="cell-head">
              <i :class="['lamp', row.lamp]" aria-hidden="true"></i>
              <strong>{{ row.label }}</strong>
            </span>
            <span class="cell-detail">{{ row.detail }}</span>
            <span v-if="row.note" class="cell-note">{{ row.note }}</span>
          </li>
          <li v-if="!capabilityBoard.length" class="capability-cell off">
            <span class="cell-head"><i class="lamp off" aria-hidden="true"></i><strong>{{ t.capabilityEmptyTitle }}</strong></span>
            <span class="cell-detail">{{ t.capabilityEmptyBody }}</span>
          </li>
        </ul>
      </div>

      <details class="probe-diagnostics">
        <summary>{{ t.probeSummary }}</summary>
        <p class="probe-selfcheck">{{ t.probeNote }}</p>
        <button class="button secondary identify-button" type="button" :disabled="probeBusy" @click="runCapabilityProbe">
          <Icon name="sync" :size="14" :class="{ spinning: probeBusy }" />
          {{ probeBusy ? t.probing : t.probeRun }}
        </button>
        <ul>
          <li v-for="line in probeDiagnostics" :key="line">{{ line }}</li>
        </ul>
      </details>
    </section>

    <section v-if="unknownCodes.length" class="settings-card" aria-labelledby="codes-title">
      <div class="section-heading-row">
        <h2 id="codes-title">{{ t.codesTitle }}</h2>
        <span v-if="unnamedCodeCount" class="capability-checked">{{ t.codesUnnamed(unnamedCodeCount) }}</span>
      </div>
      <p class="section-description">{{ t.codesIntro }}</p>
      <div class="code-list">
        <div v-for="entry in unknownCodes" :key="entry.zeppType" class="code-row">
          <div class="code-head">
            <span class="code-badge" aria-hidden="true">{{ entry.zeppType }}</span>
            <div class="code-meta">
              <strong>{{ t.codeNumber(entry.zeppType) }}</strong>
              <span>{{ t.codeRecords(entry.records) }}</span>
            </div>
            <span v-if="entry.label" class="code-preview">{{ t.codeShownAs(entry.label) }}</span>
            <span v-else class="code-preview muted">{{ t.codeShownAsUnknown(entry.zeppType) }}</span>
          </div>
          <div class="code-input-row">
            <input
              v-model="codeDrafts[entry.zeppType]"
              type="text"
              maxlength="24"
              :aria-label="t.codeInputAria(entry.zeppType)"
              :placeholder="t.codeInputPlaceholder"
              :disabled="codeBusy === entry.zeppType"
              @keyup.enter="saveCodeLabel(entry.zeppType)"
            />
            <button
              class="button primary"
              type="button"
              :disabled="codeBusy === entry.zeppType"
              @click="saveCodeLabel(entry.zeppType)"
            >{{ codeBusy === entry.zeppType ? t.codeSaving : t.codeSave }}</button>
          </div>
          <div class="code-suggestions">
            <button
              v-for="name in CODE_NAME_SUGGESTIONS"
              :key="name"
              type="button"
              class="filter-chip"
              :disabled="codeBusy === entry.zeppType"
              @click="codeDrafts[entry.zeppType] = name"
            >{{ name }}</button>
          </div>
        </div>
      </div>
      <p v-if="codeError" class="api-error" role="alert">{{ codeError }}</p>
      <p v-else-if="codeMessage" class="hint-line ok">{{ codeMessage }}</p>
      <p class="retain-note">{{ t.codeFootnote }}</p>
    </section>

    <!-- 隐私与安全这一块最高，早先和「本地数据保留」「导出偏好」并排在三栏里，
         网格拉平行高，右边两张卡片下面就空出小半屏没有意义的留白。
         现在它单独一行，另外两块自己配一对。 -->
    <div class="one-col">
      <!-- 4. 隐私安全 -->
      <section id="privacy-section" class="settings-card" aria-labelledby="privacy-title">
        <h2 id="privacy-title">{{ t.privacyTitle }}</h2>
        <ul class="fact-list">
          <li>
            <span class="toggle-icon"><Icon name="lock" :size="14" /></span>
            <div>
              <strong>{{ t.privacyDbTitle }}</strong>
              <span>{{ t.privacyDbBody }}</span>
            </div>
          </li>
          <li>
            <span class="toggle-icon"><Icon name="shield" :size="14" /></span>
            <div>
              <strong>{{ t.privacyTokenTitle }}</strong>
              <span>{{ t.privacyTokenBody }}</span>
            </div>
          </li>
          <li>
            <span class="toggle-icon"><Icon name="user" :size="14" /></span>
            <div>
              <strong>{{ t.privacyTelemetryTitle }}</strong>
              <span>{{ t.privacyTelemetryBody }}</span>
            </div>
          </li>
        </ul>
        <button class="privacy-link-btn" type="button" @click="privacyModalOpen = true">
          <Icon name="shield" :size="13" />{{ t.privacyModalLink }}
        </button>
        <div class="diagnostic-panel">
          <strong>{{ t.privacyReportTitle }}</strong>
          <p>{{ t.privacyReportBody }}</p>
          <div class="diagnostic-note">
            <span>{{ t.reportWhat }}<em>{{ t.reportWhatHint }}</em></span>
            <SelectMenu
              v-model="diagnosticCategory"
              :options="REPORT_CATEGORIES"
              :placeholder="t.reportCategoryPlaceholder"
              :aria-label="t.reportCategoryAria"
            />
          </div>
          <label class="diagnostic-note">
            <span>{{ t.reportNote }}<em>{{ t.reportNoteHint }}</em></span>
            <textarea
              v-model="diagnosticNote"
              rows="3"
              :maxlength="DIAGNOSTIC_NOTE_MAX"
              :placeholder="t.reportNotePlaceholder"
            ></textarea>
            <small>{{ t.reportNoteCounter(diagnosticNote.length, DIAGNOSTIC_NOTE_MAX) }}</small>
          </label>
          <button class="button secondary" type="button" :disabled="diagnosticBusy" @click="submitDiagnosticReport">
            <Icon name="send" :size="14" />{{ diagnosticBusy ? t.reportSubmitting : t.reportSubmit }}
          </button>
          <div v-if="diagnosticResult" class="diagnostic-done" role="status">
            <strong><Icon name="circle-check" :size="14" />{{ t.reportDoneTitle }}</strong>
            <p>{{ t.reportDoneLine(diagnosticResult.reportId, formatDateTime(diagnosticResult.submittedAt)) }}</p>
            <p class="diagnostic-done-note">{{ t.reportDoneNote }}</p>
          </div>
          <p v-if="diagnosticError" class="api-error" role="alert">{{ diagnosticError }}</p>
        </div>
      </section>

    </div>

    <!-- 5. MCP -->
    <section class="settings-card mcp-card" aria-labelledby="mcp-title">
      <div class="section-heading-row">
        <h2 id="mcp-title">{{ t.mcpTitle }}</h2>
        <span class="capability-checked">{{ t.mcpBadge }}</span>
      </div>
      <p class="section-description">
        <strong>{{ t.mcpSkip }}</strong>
        {{ t.mcpCompareA }}<strong>{{ t.mcpCompareStrong }}</strong>{{ t.mcpCompareB }}
      </p>

      <div class="mcp-handoff">
        <p class="mcp-sub">
          {{ t.mcpAskA }}<strong>{{ t.mcpAskStrong }}</strong>{{ t.mcpAskB }}
        </p>
        <pre class="mcp-config"><code>{{ t.mcpSetupPrompt }}</code></pre>
        <div class="inline-actions">
          <button class="button primary" type="button" @click="copyMcpPrompt">
            <Icon name="copy" :size="14" />{{ t.mcpCopyPrompt }}
          </button>
          <button class="button secondary" type="button" @click="copyMcpConfig">
            <Icon name="copy" :size="14" />{{ t.mcpCopyConfig }}
          </button>
        </div>
        <p v-if="mcpMessage" class="hint-line ok" role="status">{{ mcpMessage }}</p>
      </div>

      <p class="mcp-sub">{{ t.mcpToolsLead }}</p>
      <div class="mcp-tools">
        <div v-for="tool in MCP_TOOLS" :key="tool.name" class="mcp-tool">
          <code>{{ tool.name }}</code>
          <span>{{ tool.detail }}</span>
        </div>
      </div>

      <p class="retain-note">
        <code>zeppbridge-mcp</code>{{ t.mcpFootA }}
      </p>
    </section>

    <div class="two-col paired">
      <!-- 6. 数据保留 -->
      <section class="settings-card" aria-labelledby="retention-title">
        <h2 id="retention-title">{{ t.retentionTitle }}</h2>
        <div class="field-row">
          <span class="kv-label">{{ t.retentionLabel }}</span>
          <SelectMenu
            v-model="retentionDays"
            :options="RETENTION_CHOICES"
            :aria-label="t.retentionAria"
            @update:model-value="savePrefs"
          />
        </div>
        <p class="retain-note">{{ t.retentionNote(retentionDays) }}<strong>{{ t.retentionNoteStrong }}</strong>{{ t.retentionNoteTail }}</p>
        <p class="hint-line">{{ estimateText || t.retentionCutoff(retentionCutoffDate) }}</p>
        <div class="inline-actions">
          <button class="button secondary" type="button" :disabled="Boolean(dataBusy)" @click="cleanupData">
            {{ dataBusy === 'cleanup' ? t.cleaningUp : t.cleanupNow }}
          </button>
          <button class="button secondary" type="button" :disabled="Boolean(dataBusy)" @click="reprocessLocalData">
            {{ dataBusy === 'reprocess' ? t.reprocessing : t.reprocessNow }}
          </button>
        </div>
      </section>

      <!-- 7. 导出默认值 -->
      <section class="settings-card" aria-labelledby="export-title">
        <h2 id="export-title">{{ t.exportTitle }}</h2>
        <div class="field-row">
          <span class="kv-label">{{ t.defaultFormatLabel }}</span>
          <SelectMenu
            v-model="defaultExportFormat"
            :options="EXPORT_FORMAT_CHOICES"
            :aria-label="t.defaultFormatAria"
            @update:model-value="onExportFormatChange"
          />
        </div>
        <div class="field-row">
          <span class="kv-label">{{ t.historyRangeLabel }}</span>
          <SelectMenu
            v-model="historyDays"
            :options="HISTORY_CHOICES"
            :aria-label="t.historyRangeAria"
            @update:model-value="savePrefs"
          />
        </div>
        <p class="retain-note">{{ t.exportNote }}</p>
        <div class="inline-actions">
          <button class="button primary" type="button" :disabled="isSyncing || (!connected && !configuredOnly) || prefsBusy" @click="confirmHistorySync">
            {{ t.startBackfill }}
          </button>
        </div>
      </section>
    </div>

    <!-- 历史补拉的账本要和「补拉范围」一起看，所以留在正文；
         数据库快照是灾难恢复工具，进「高级与维护」。 -->
    <div class="one-col wide-panels">
      <HistoryArchivePanel :prefs="userPrefs" @prefs-changed="applyPrefsChange" />
    </div>

    <!-- 8. 软件更新 -->
    <section class="settings-card update-card" aria-labelledby="update-title">
      <div class="update-head">
        <div>
          <h2 id="update-title">{{ t.updateTitle }}</h2>
          <p>{{ t.updateSub }}</p>
        </div>
        <!-- 更新由包管理器管的渠道上不摆这个按钮：按下去只能得到一句
             「这里不管更新」，不如一开始就别给。 -->
        <button
          v-if="updateState.status !== 'unmanaged'"
          class="button secondary"
          type="button"
          :disabled="updateBusy"
          @click="checkForDesktopUpdate(true)"
        >
          <Icon name="sync" :size="14" :class="{ spinning: updateState.status === 'checking' }" />
          {{ updateState.status === 'checking' ? t.updateChecking : t.updateCheck }}
        </button>
      </div>
      <div :class="['update-state', `is-${updateState.status}`]" role="status" aria-live="polite">
        <i aria-hidden="true"></i>
        <div>
          <strong>{{ updateStatusLabel }}</strong>
          <p v-if="updateState.status === 'failed'">{{ updateState.error }}</p>
          <p v-else-if="updateState.status === 'unmanaged'">{{ t.updateUnmanagedHint(updateState.currentVersion || t.updateVersionLoading) }}</p>
          <p v-else-if="updateState.status === 'available'">{{ t.updateCurrent(updateState.currentVersion) }}<template v-if="updateState.sizeBytes"> · {{ formatUpdateBytes(updateState.sizeBytes) }}</template></p>
          <p v-else>{{ t.updateVersion(updateState.currentVersion || t.updateVersionLoading) }}</p>
          <!-- 同一个版本号会构建很多次；报问题时把这一行带上，就不用猜手上是哪个包了。 -->
          <p class="build-stamp">{{ t.buildStamp(BUILD_STAMP) }}</p>
        </div>
      </div>
      <progress v-if="updateState.status === 'downloading' && updateProgress !== null" :value="updateProgress" max="100">{{ updateProgress }}%</progress>
      <div v-if="updateState.status === 'available'" class="update-release">
        <div>
          <strong>ZeppBridge {{ updateState.version }}</strong>
          <p class="release-teaser">{{ releaseTeaser }}</p>
        </div>
        <button class="button primary" type="button" @click="updateNotesOpen = true">{{ t.updateSeeNotes }}</button>
      </div>
    </section>

    <!-- 9. 自动同步 -->
    <section class="settings-card sync-card" aria-labelledby="sync-title">
      <div class="sync-lead">
        <span class="sync-icon"><Icon name="monitor" :size="20" /></span>
        <div>
          <h2 id="sync-title">{{ t.syncTitle }}</h2>
          <p class="sync-desc">{{ t.syncDescA(autoSyncInterval) }}<br />{{ t.syncDescB }}</p>
        </div>
      </div>
      <div class="sync-controls">
        <div class="interval-options" role="radiogroup" :aria-label="t.syncIntervalAria" :class="{ 'is-disabled': !autoSyncEnabled }">
          <button
            v-for="minutes in AUTO_SYNC_INTERVALS"
            :key="minutes"
            type="button"
            role="radio"
            :aria-checked="autoSyncInterval === minutes"
            :disabled="!autoSyncEnabled"
            @click="setAutoSyncInterval(minutes)"
          >{{ t.minutes(minutes) }}</button>
        </div>
        <span class="sync-toggle-label">{{ autoSyncEnabled ? t.syncOn : t.syncOff }}</span>
        <button class="switch" type="button" role="switch" :aria-checked="autoSyncEnabled" @click="setAutoSyncEnabled(!autoSyncEnabled)"><span></span></button>
        <button class="button secondary sync-now" type="button" :disabled="isSyncing || !connected" @click="runSync('incremental')">
          <Icon name="sync" :size="14" />{{ isSyncing ? t.syncing : t.syncNow }}
        </button>
      </div>
    </section>

    <!-- 高级维护 -->
    <details class="advanced settings-card">
      <summary>
        <span>
          <strong>{{ t.advancedTitle }}</strong>
          <em>{{ t.advancedSub }}</em>
        </span>
        <Icon name="chevron-down" :size="16" />
      </summary>
      <div class="advanced-content">
        <div class="advanced-block">
          <p class="advanced-label">{{ t.scaleLabel }}</p>
          <p class="section-description">{{ t.scaleNote }}</p>
          <div class="scale-options" role="radiogroup" :aria-label="t.scaleLabel">
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
          <p class="advanced-label">{{ t.dataAuthLabel }}</p>
          <p class="section-description">{{ t.dataAuthNote(retentionDays) }}</p>
          <div class="inline-actions">
            <button class="button secondary" type="button" @click="openDataFolder"><Icon name="folder" :size="15" />{{ t.openDataFolder }}</button>
            <button class="button danger-button" type="button" @click="clearAuth">{{ t.logout }}</button>
          </div>
        </div>
        <div class="advanced-block">
          <p class="advanced-label">{{ t.healthCheckLabel }}</p>
          <p class="section-description">{{ t.healthCheckNote }}</p>
          <div class="inline-actions">
            <RouterLink class="button secondary" to="/health-check"><Icon name="database" :size="15" />{{ t.healthCheckOpen }}</RouterLink>
          </div>
        </div>
        <div class="advanced-block">
          <p class="advanced-label">{{ t.compactLabel }}</p>
          <p class="section-description">
            {{ t.compactNoteA }}
            <strong>{{ t.compactNoteStrong }}</strong>{{ t.compactNoteB }}
          </p>
          <div class="inline-actions">
            <button class="button secondary" type="button" :disabled="compactBusy" @click="runCompactPayloads">
              {{ compactBusy ? t.compacting : t.compactRun }}
            </button>
          </div>
          <p v-if="compactError" class="api-error" role="alert">{{ compactError }}</p>
          <p v-else-if="compactMessage" class="hint-line ok" role="status">{{ compactMessage }}</p>
        </div>
        <div class="advanced-block">
          <p class="advanced-label">{{ t.backupLabel }}</p>
          <p class="section-description">{{ t.backupNote }}</p>
          <BackupPanel />
        </div>
        <div class="advanced-block">
          <p class="advanced-label">{{ t.localApiLabel }}</p>
          <p class="section-description">{{ t.localApiNote }}</p>
      <section class="settings-card api-card" aria-labelledby="api-title">
        <div class="api-head">
          <span class="api-icon"><Icon name="braces" :size="20" /></span>
          <div>
            <h2 id="api-title">{{ t.apiTitle }}</h2>
            <p>{{ t.apiSub }}</p>
          </div>
          <span :class="['api-state', { on: localApiStatus?.running }]">
            <i aria-hidden="true"></i>{{ localApiStatus?.running ? t.apiListening : (localApiStatus?.enabled ? t.apiEnabledNotListening : t.apiOff) }}
          </span>
        </div>

        <div class="toggle-row api-toggle">
          <div class="toggle-copy">
            <strong>{{ t.apiToggleTitle }}</strong>
            <span>{{ t.apiToggleSub(localApiStatus?.address || '127.0.0.1:43921') }}</span>
          </div>
          <button
            class="switch"
            type="button"
            role="switch"
            :aria-label="t.apiToggleAria"
            :aria-checked="Boolean(localApiStatus?.enabled)"
            :disabled="localApiBusy"
            @click="toggleLocalApi"
          ><span></span></button>
        </div>

        <template v-if="localApiStatus?.enabled">
          <div class="api-endpoint">
            <code>{{ localApiStatus?.base_url || 'http://127.0.0.1:43921' }}/workouts/{id}/series</code>
            <button class="button secondary" type="button" :disabled="localApiBusy" @click="copyLocalApiExample">
              <Icon name="copy" :size="14" />{{ t.apiCopyExample }}
            </button>
          </div>

          <div class="api-token">
            <span class="kv-label">{{ t.apiTokenLabel }}</span>
            <code>{{ localApiTokenVisible && localApiToken ? localApiToken : maskedToken }}</code>
            <div class="inline-actions">
              <button class="button secondary" type="button" :disabled="localApiBusy" @click="toggleTokenVisibility">
                {{ localApiTokenVisible ? t.apiHide : t.apiShow }}
              </button>
              <button class="button secondary" type="button" :disabled="localApiBusy" @click="copyLocalApiToken">
                <Icon name="copy" :size="14" />{{ t.apiCopy }}
              </button>
              <button class="button secondary" type="button" :disabled="localApiBusy" @click="regenerateLocalApiToken">
                {{ t.apiRegenerate }}
              </button>
            </div>
          </div>
          <p class="api-note">{{ t.apiAuthNoteA }}<code>Authorization: Bearer &lt;token&gt;</code>{{ t.apiAuthNoteB }}</p>
        </template>

        <p v-if="localApiError" class="api-error" role="alert">{{ localApiError }}</p>
        <p v-else-if="localApiMessage" class="hint-line ok">{{ localApiMessage }}</p>
        <p class="api-note">{{ t.apiBindNote }}</p>
      </section>
        </div>
        <details class="diag-fold">
          <summary>{{ t.syncDiagnostics }}</summary>
          <div class="stream-list">
            <div v-for="stream in appStatus?.streams" :key="stream.stream" class="stream-row">
              <strong>{{ stream.stream }}</strong>
              <span>{{ stream.status }}</span>
              <span>{{ formatDateTime(stream.last_cloud_sync_at) }}</span>
            </div>
            <p v-if="!appStatus?.streams?.length" class="section-description">{{ t.noSyncDiagnostics }}</p>
          </div>
        </details>
      </div>
    </details>

    <!-- 更新说明弹窗。
         发现新版本时自动弹一次：只给一个版本号，用户没法判断这次值不值得更新。
         Release 说明是 Markdown，这里按纯文本原样显示（保留换行），不做渲染——
         更新说明是别处写的内容，不该在这里当富文本执行。 -->
    <div v-if="updateNotesOpen" class="modal-backdrop" @click.self="updateNotesOpen = false">
      <div class="privacy-modal surface-card pad">
        <div class="modal-head">
          <div class="modal-title-row">
            <Icon name="sync" :size="18" class="shield-ic" />
            <h3>{{ t.updateModalTitle(updateState.version) }}</h3>
          </div>
          <button type="button" class="close-btn" @click="updateNotesOpen = false"><Icon name="x" :size="16" /></button>
        </div>
        <p class="modal-sub">
          {{ t.updateModalCurrent(updateState.currentVersion || t.updateModalUnknownVersion) }}
          <template v-if="updateState.date">{{ t.updateModalReleased(updateState.date.slice(0, 10)) }}</template>
          <template v-if="updateState.sizeBytes"> · {{ formatUpdateBytes(updateState.sizeBytes) }}</template>
        </p>
        <div class="modal-body">
          <pre class="release-notes">{{ updateState.notes || t.releaseNotesEmpty }}</pre>
        </div>
        <!-- 下载进度就放在更新说明下面：等待的这几十秒里，用户正好可以把上面
             的说明读完，而不是盯着一个没有反馈的按钮猜它有没有在动。 -->
        <div v-if="updateState.status === 'downloading' || updateState.status === 'installing'" class="update-progress">
          <div class="progress-head">
            <strong>{{ updateState.status === 'installing' ? t.updateInstalling : t.updateDownloading }}</strong>
            <span v-if="updateState.status === 'downloading' && updateProgress !== null">{{ updateProgress }}%</span>
          </div>
          <div class="progress-track" role="progressbar" :aria-valuenow="updateProgress ?? undefined" aria-valuemin="0" aria-valuemax="100">
            <i :class="{ indeterminate: updateProgress === null || updateState.status === 'installing' }"
               :style="updateState.status === 'downloading' && updateProgress !== null ? { width: `${updateProgress}%` } : undefined"></i>
          </div>
          <p class="progress-note">
            <template v-if="updateState.status === 'installing'">{{ t.updateInstallNote }}</template>
            <template v-else-if="updateState.totalBytes">
              {{ formatUpdateBytes(updateState.downloadedBytes) }} / {{ formatUpdateBytes(updateState.totalBytes) }}{{ t.updateDownloadNoteTail }}
            </template>
            <template v-else>{{ t.updateDownloadNote }}</template>
          </p>
        </div>

        <p v-else-if="updateState.status === 'failed'" class="progress-note bad" role="alert">
          {{ t.updateFailedPrefix(updateState.error) }}
        </p>
        <p v-else class="progress-note">{{ t.updateRestartNote }}</p>

        <div class="modal-foot">
          <button
            type="button"
            class="button secondary"
            @click="updateNotesOpen = false"
          >{{ updateState.status === 'downloading' || updateState.status === 'installing' ? t.updateBackground : t.updateLater }}</button>
          <button
            v-if="updateState.status !== 'downloading' && updateState.status !== 'installing'"
            type="button"
            class="button primary"
            @click="installUpdate"
          >{{ updateState.status === 'failed' ? t.updateRetry : t.updateInstall }}</button>
        </div>
      </div>
    </div>

    <!-- 隐私政策弹窗 -->
    <div v-if="privacyModalOpen" class="modal-backdrop" @click.self="privacyModalOpen = false">
      <div class="privacy-modal surface-card pad">
        <div class="modal-head">
          <div class="modal-title-row">
            <Icon name="shield" :size="18" class="shield-ic" />
            <h3>{{ t.privacyModalTitle }}</h3>
          </div>
          <button type="button" class="close-btn" @click="privacyModalOpen = false"><Icon name="x" :size="16" /></button>
        </div>
        <div class="modal-body">
          <p><strong>{{ t.privacyPoint1Title }}</strong>{{ t.privacyPoint1 }}</p>
          <p><strong>{{ t.privacyPoint2Title }}</strong>{{ t.privacyPoint2 }}</p>
          <p><strong>{{ t.privacyPoint3Title }}</strong>{{ t.privacyPoint3 }}</p>
          <p><strong>{{ t.privacyPoint4Title }}</strong>{{ t.privacyPoint4 }}</p>
          <p><strong>{{ t.privacyPoint5Title }}</strong>{{ t.privacyPoint5 }}</p>
        </div>
        <div class="modal-foot">
          <button type="button" class="button primary" @click="privacyModalOpen = false">{{ t.privacyModalOk }}</button>
        </div>
      </div>
    </div>

  </section>
</template>

<style scoped>
.build-stamp { color: var(--subtle); font-size: 11px; font-family: var(--font-mono); }
.page { width: 100%; min-width: 0; margin: 0; display: grid; gap: 14px; }
.page-header { display: flex; align-items: flex-start; justify-content: space-between; gap: 16px; flex-wrap: wrap; margin-bottom: 0; min-width: 0; }
.locale-switch { flex: 0 0 auto; text-align: right; }
.locale-switch .advanced-label { margin-bottom: 6px; }
.locale-switch .scale-options { justify-content: flex-end; }
.locale-switch .scale-options button { min-width: 62px; }
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
.api-note code { padding: 1px 5px; border-radius: 4px; background: var(--surface-raised); font-family: var(--font-mono); font-size: 10px; }
.api-toggle { margin-top: 12px; border-bottom: 0; }
.api-token { display: grid; grid-template-columns: auto minmax(0, 1fr); align-items: center; gap: 10px 12px; margin-top: 10px; padding: 10px 12px; border: 1px solid var(--line); border-radius: var(--radius-sm); background: var(--surface-raised); }
.api-token code { overflow: hidden; color: var(--ink); font-family: var(--font-mono); font-size: 11px; text-overflow: ellipsis; white-space: nowrap; }
.api-token .inline-actions { grid-column: 1 / -1; }
.fact-list { display: grid; gap: 12px; margin: 0; padding: 0; list-style: none; }
.fact-list li { display: grid; grid-template-columns: auto minmax(0, 1fr); gap: 10px; align-items: start; }
.fact-list strong { display: block; margin-bottom: 3px; color: var(--ink); font-size: 12px; font-weight: 500; }
.fact-list span { color: var(--subtle); font-size: 11px; line-height: 1.55; }
.code-list { display: grid; gap: 10px; margin-top: 12px; }
.code-row { display: grid; gap: 10px; padding: 12px; border: 1px solid var(--line); border-radius: 12px; background: var(--surface-raised); }
.code-head { display: grid; grid-template-columns: auto minmax(0, 1fr) auto; align-items: center; gap: 10px; }
.code-badge { display: grid; place-items: center; width: 34px; height: 34px; border: 1px solid var(--line); border-radius: 10px; color: var(--muted); font-family: var(--font-mono); font-size: 11px; }
.code-meta { display: grid; gap: 2px; }
.code-meta strong { color: var(--ink); font-size: 12px; font-weight: 500; }
.code-meta span { color: var(--subtle); font-size: 11px; }
.code-preview { color: var(--accent); font-size: 11px; text-align: right; }
.code-preview.muted { color: var(--muted); }
.code-input-row { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 8px; }
.code-suggestions { display: flex; flex-wrap: wrap; gap: 6px; }
.code-suggestions .filter-chip { padding: 3px 10px; border: 1px solid var(--line); border-radius: 999px; background: transparent; color: var(--muted); font-size: 11px; cursor: pointer; }
.code-suggestions .filter-chip:hover { border-color: var(--accent); color: var(--accent); }
.assign-trigger { justify-self: end; }
.api-error { color: var(--danger); }
.update-head, .update-release { display: grid; grid-template-columns: minmax(0, 1fr) auto; align-items: center; gap: 14px; }
.update-head h2 { margin-bottom: 4px; }
.update-head p, .update-state p, .update-release p { margin: 0; color: var(--subtle); font-size: 11px; line-height: 1.5; }
.update-state { display: grid; grid-template-columns: 7px minmax(0, 1fr); align-items: center; gap: 11px; margin-top: 14px; padding: 11px 12px; border: 1px solid var(--line); border-radius: var(--radius-sm); background: var(--surface-raised); }
.update-state i { width: 7px; height: 7px; border-radius: 50%; background: var(--muted); }
.update-state.is-available i, .update-state.is-upToDate i { background: var(--accent); }
.update-state.is-checking i, .update-state.is-downloading i, .update-state.is-installing i { background: var(--warning); }
.update-state.is-failed i { background: var(--danger); }
.update-state strong, .update-release strong { color: var(--ink); font-size: 12px; }
.update-card progress { width: 100%; height: 6px; margin-top: 10px; accent-color: var(--accent); }
.update-release { margin-top: 10px; padding: 11px 12px; border: 1px solid var(--line); border-radius: var(--radius-sm); background: var(--surface-raised); }
.diagnostic-note { display: grid; gap: 6px; margin: 10px 0; font-size: 12px; color: var(--muted); }
.diagnostic-note em { font-style: normal; color: var(--subtle); }
.diagnostic-note textarea { width: 100%; min-height: 68px; padding: 8px 10px; border: 1px solid var(--line); border-radius: 10px; background: var(--surface); color: var(--ink); font: inherit; resize: vertical; }
.diagnostic-note small { color: var(--subtle); font-size: 11px; }
.diagnostic-done { display: grid; gap: 4px; margin-top: 10px; padding: 10px 12px; border: 1px solid rgba(125,163,62,.34); border-radius: 10px; background: rgba(125,163,62,.1); color: var(--ink); font-size: 12px; }
.diagnostic-done strong { display: inline-flex; align-items: center; gap: 6px; color: #b9da77; }
.diagnostic-done code { font-family: var(--font-mono); font-size: 11px; }
.diagnostic-done-note { color: var(--muted); }
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
.account-logout { margin-top: 10px; }
.account-logout .link-button {
  padding: 0;
  border: 0;
  background: none;
  color: var(--accent);
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
}
.account-logout .link-button:hover { text-decoration: underline; }
.account-logout-hint { margin: 4px 0 0; color: var(--subtle); font-size: 11px; line-height: 1.55; }
.account-logout-hint.warn { color: var(--muted); }
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
.release-teaser { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.update-progress { display: grid; gap: 7px; margin-top: 14px; }
.progress-head { display: flex; align-items: baseline; justify-content: space-between; gap: 12px; color: var(--ink); font-size: 13px; }
.progress-head span { color: var(--accent); font-family: var(--font-mono); font-variant-numeric: tabular-nums; }
.progress-track { height: 6px; overflow: hidden; border-radius: 3px; background: rgba(232, 238, 244, .1); }
.progress-track i { display: block; height: 100%; border-radius: 3px; background: var(--accent); transition: width 220ms ease; }
/* 拿不到总大小时用一条来回跑的条，而不是假装一个百分比。 */
.progress-track i.indeterminate { width: 40%; animation: progress-slide 1.2s ease-in-out infinite; }
@keyframes progress-slide {
  0% { transform: translateX(-100%); }
  100% { transform: translateX(250%); }
}
@media (prefers-reduced-motion: reduce) {
  .progress-track i.indeterminate { animation: none; width: 100%; opacity: .5; }
}
.progress-note { margin: 10px 0 0; color: var(--muted); font-size: 12px; line-height: 1.7; }
.progress-note.bad { color: var(--danger); }
.modal-sub { margin: 0 0 10px; color: var(--muted); font-size: 12px; }
.release-notes {
  margin: 0;
  padding: 14px 16px;
  max-height: 46vh;
  overflow: auto;
  border: 1px solid var(--line);
  border-radius: var(--radius-sm);
  background: var(--surface-raised);
  color: var(--ink);
  font-family: var(--font-sans);
  font-size: 12.5px;
  line-height: 1.85;
  white-space: pre-wrap;
  word-break: break-word;
}

.mcp-handoff { margin-bottom: var(--space-4); }
.mcp-handoff .mcp-config { max-height: 200px; overflow: auto; white-space: pre-wrap; font-size: 11.5px; line-height: 1.75; }
.mcp-handoff .inline-actions { margin-top: 10px; }
.mcp-tools { display: grid; grid-template-columns: repeat(auto-fill, minmax(240px, 1fr)); gap: var(--space-2); margin-bottom: var(--space-3); }
.mcp-tool { display: grid; gap: 2px; padding: 9px 11px; border: 1px solid var(--line); border-radius: var(--radius-sm); background: var(--surface-raised); min-width: 0; }
.mcp-tool code { color: var(--ink); font-family: var(--font-mono); font-size: 12px; }
.mcp-tool span { color: var(--muted); font-size: 11px; }
.mcp-sub { margin: 0 0 6px; color: var(--muted); font-size: 12px; }
.mcp-config { margin: 0; padding: 12px 14px; overflow-x: auto; border: 1px solid var(--line); border-radius: var(--radius-sm); background: var(--surface-raised); color: var(--ink); font-family: var(--font-mono); font-size: 12px; line-height: 1.6; }

.capability-board { display: grid; gap: var(--space-3); }
.capability-legend { display: flex; flex-wrap: wrap; gap: 6px 18px; margin: 0; color: var(--muted); font-size: 12px; }
.legend-item { display: inline-flex; align-items: center; gap: 6px; }
.lamp { width: 8px; height: 8px; flex: 0 0 8px; border-radius: 50%; background: var(--subtle); }
.lamp.on { background: #7da33e; box-shadow: 0 0 0 3px rgba(125,163,62,.16); }
.lamp.pending { background: #f5c33b; box-shadow: 0 0 0 3px rgba(245,195,59,.14); }
.lamp.off { background: rgba(232,238,244,.18); }

.capability-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(196px, 1fr));
  gap: var(--space-2);
  margin: 0;
  padding: 0;
  list-style: none;
}
.capability-cell {
  display: grid;
  align-content: start;
  gap: 3px;
  padding: 10px 12px;
  border: 1px solid var(--line);
  border-radius: var(--radius-sm);
  background: var(--surface-raised);
  min-width: 0;
}
.capability-cell.off { opacity: .62; }
.cell-head { display: flex; align-items: center; gap: 7px; min-width: 0; }
.cell-head strong { overflow: hidden; color: var(--ink); font-size: 13px; text-overflow: ellipsis; white-space: nowrap; }
.cell-detail { color: var(--muted); font-size: 11px; }
.cell-note { color: var(--subtle); font-size: 11px; line-height: 1.5; }
@media (max-width: 720px) { .capability-grid { grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); } }
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
.capability-pending { color: var(--warning); flex: 0 0 auto; }
.capability-why { color: var(--subtle); font-size: 10px; line-height: 1.5; }
.probe-diagnostics { margin-top: 16px; }
.probe-diagnostics > summary { color: var(--muted); font-size: 12px; cursor: pointer; }
.probe-diagnostics ul { margin: 8px 0 0; padding-left: 18px; }
.probe-diagnostics li,
.probe-selfcheck { color: var(--muted); font-size: 11px; line-height: 1.7; overflow-wrap: anywhere; }
.device-empty { display: flex; align-items: center; gap: 7px; min-height: 60px; padding: 10px; border: 1px dashed var(--line-strong); border-radius: var(--radius-sm); color: var(--muted); font-size: 12px; }
.two-col { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1.1fr); gap: 14px; align-items: start; }
/* 成对的两块卡片等高对齐；高度由内容较多的一块决定，而不是被第三块撑开。 */
.two-col.paired { grid-template-columns: repeat(2, minmax(0, 1fr)); align-items: stretch; }
.one-col { display: grid; grid-template-columns: minmax(0, 1fr); gap: 14px; }
.wide-panels { grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); }
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
/* 这些下拉现在是 SelectMenu，不是原生 select；宽度在这里定，其余样式在组件里。 */
.field-row .select-menu { min-width: 180px; flex: 0 0 auto; }
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
