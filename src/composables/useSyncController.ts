import { computed, readonly, ref } from 'vue';
import { listen } from '@tauri-apps/api/event';
import { isTauri, tauriApi, toUserMessage } from './useTauriApi';
import { readAutoSyncSettings, writeAutoSyncSettings } from '../lib/autoSync';
import type { AppStatus, CaptureSession, CaptureStatus, SyncOutcome, SyncProgress, SyncReport } from '../types';

export type SyncUiState = 'idle' | 'syncing' | SyncOutcome;

const AUTO_SYNC_INTERVAL_MS = 15 * 60_000;
const appStatus = ref<AppStatus | null>(null);
const statusError = ref<string | null>(null);
const syncState = ref<SyncUiState>('idle');
const syncMessage = ref('尚未同步');
const syncReport = ref<SyncReport | null>(null);
const syncProgress = ref<SyncProgress | null>(null);
const dataRevision = ref(0);
const autoSyncEnabled = ref(readAutoSyncSettings().enabled);
const captureSession = ref<CaptureSession | null>(null);
const captureStatus = ref<CaptureStatus | null>(null);
const captureActive = ref(false);
const proxyRestored = ref(true);
let initialized = false;
let runningSync: Promise<SyncReport | null> | null = null;

const formatTime = (value?: string): string => {
  if (!value) return '未知时间';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '未知时间';
  return new Intl.DateTimeFormat('zh-CN', {
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
};

const latestHeartRateAt = (report?: SyncReport | null): string | undefined =>
  report?.streams.find((stream) => stream.stream === 'heart_rate')?.newest_sample_at
  ?? appStatus.value?.streams.find((stream) => stream.stream === 'heart_rate')?.newest_sample_at;

const messageForReport = (report: SyncReport): string => {
  const failed = report.streams.filter((stream) => /fail|error/i.test(stream.status)).map((stream) => stream.stream);
  const latest = latestHeartRateAt(report);
  if (report.outcome === 'updated') return latest ? `已同步到新数据 · 最新心率 ${formatTime(latest)}` : '已同步到新数据';
  if (report.outcome === 'no_new_data') return latest ? `云端暂无新数据 · 最新心率仍为 ${formatTime(latest)}` : '同步完成，云端暂无新数据';
  if (report.outcome === 'partial') return failed.length ? `部分同步失败：${failed.join('、')}` : '同步已完成，但部分数据流失败';
  return '同步失败，请检查连接后重试';
};

const refreshStatus = async (): Promise<AppStatus | null> => {
  if (!isTauri()) return null;
  try {
    statusError.value = null;
    appStatus.value = await tauriApi.getAppStatus();
    if (syncState.value === 'idle' && appStatus.value.last_cloud_sync_outcome) {
      syncState.value = appStatus.value.last_cloud_sync_outcome;
      const latest = latestHeartRateAt();
      syncMessage.value = appStatus.value.last_cloud_sync_outcome === 'no_new_data' && latest
        ? `云端暂无新数据 · 最新心率仍为 ${formatTime(latest)}`
        : `上次云端同步 ${formatTime(appStatus.value.last_cloud_sync_at)}`;
    }
    return appStatus.value;
  } catch (error) {
    statusError.value = toUserMessage(error, '连接状态暂时不可用');
    return null;
  }
};

const runSync = (mode: 'incremental' | 'initial' | 'history' = 'incremental', days?: number): Promise<SyncReport | null> => {
  if (runningSync) return runningSync;
  const promise = (async () => {
    if (!isTauri()) {
      statusError.value = '请从 ZeppBridge 桌面应用打开后同步';
      return null;
    }
    const status = appStatus.value ?? await refreshStatus();
    if (status?.connection_state === 'needs_reauth') {
      syncState.value = 'failed';
      syncMessage.value = '认证已失效，请重新连接 Zepp';
      return null;
    }
    if (mode === 'incremental' && status?.connection_state !== 'connected') {
      syncState.value = 'failed';
      syncMessage.value = status?.connection_state === 'configured' ? '请先完成连接验证' : '请先连接 Zepp';
      return null;
    }
    if (status?.connection_state === 'unconfigured') {
      syncState.value = 'failed';
      syncMessage.value = '请先连接 Zepp';
      return null;
    }
    syncState.value = 'syncing';
    syncProgress.value = null;
    syncMessage.value = mode === 'incremental' ? '正在同步最近 7 天…' : `正在补拉最近 ${days ?? status?.history_sync_days ?? 30} 天…`;
    statusError.value = null;
    try {
      const report = mode === 'incremental'
        ? await tauriApi.startIncrementalSync()
        : await tauriApi.startHistorySync(days ?? status?.history_sync_days ?? 30);
      syncReport.value = report;
      syncState.value = report.outcome;
      syncMessage.value = messageForReport(report);
      await refreshStatus();
      dataRevision.value += 1;
      return report;
    } catch (error) {
      syncState.value = 'failed';
      syncMessage.value = toUserMessage(error, '云端同步未完成');
      statusError.value = syncMessage.value;
      await refreshStatus();
      return null;
    } finally {
      syncProgress.value = null;
    }
  })();
  runningSync = promise;
  void promise.finally(() => {
    if (runningSync === promise) runningSync = null;
  });
  return promise;
};

const cancelSync = async () => {
  if (!isTauri()) return;
  try {
    await tauriApi.cancelSync();
    syncMessage.value = '正在取消同步…';
  } catch (error) {
    statusError.value = toUserMessage(error, '无法取消同步');
  }
};

const setAutoSyncEnabled = (enabled: boolean) => {
  autoSyncEnabled.value = Boolean(enabled);
  writeAutoSyncSettings({ enabled: autoSyncEnabled.value, intervalMinutes: 15 });
};

const setCaptureSession = (session: CaptureSession | null, status: CaptureStatus | null = null) => {
  captureSession.value = session;
  captureStatus.value = status;
  captureActive.value = Boolean(session);
};

const markProxyRestored = () => {
  proxyRestored.value = true;
  captureActive.value = false;
};

const initialize = async () => {
  if (initialized) return;
  initialized = true;
  if (isTauri()) {
    await listen<SyncProgress>('sync://progress', (event) => {
      syncProgress.value = event.payload;
      syncMessage.value = event.payload.message;
    });
    await listen('tray://sync', () => {
      void runSync('incremental');
    });
  }
  let status = await refreshStatus();
  if (status?.connection_state === 'configured' && isTauri()) {
    try {
      await tauriApi.verifyAuth();
      status = await refreshStatus();
    } catch {
      await refreshStatus();
    }
  }
  if (autoSyncEnabled.value && status?.connection_state === 'connected') void runSync('incremental');
  if (typeof window !== 'undefined') {
    window.setInterval(() => {
      if (autoSyncEnabled.value) void runSync('incremental');
    }, AUTO_SYNC_INTERVAL_MS);
  }
};

const markDataChanged = () => {
  dataRevision.value += 1;
};

export const useSyncController = () => ({
  appStatus: readonly(appStatus),
  statusError: readonly(statusError),
  syncState: readonly(syncState),
  syncMessage: readonly(syncMessage),
  syncReport: readonly(syncReport),
  syncProgress: readonly(syncProgress),
  dataRevision: readonly(dataRevision),
  autoSyncEnabled: readonly(autoSyncEnabled),
  captureSession: readonly(captureSession),
  captureStatus,
  captureActive: readonly(captureActive),
  proxyRestored,
  isSyncing: computed(() => syncState.value === 'syncing'),
  canIncrementalSync: computed(() => appStatus.value?.connection_state === 'connected'),
  initialize,
  refreshStatus,
  runSync,
  cancelSync,
  setAutoSyncEnabled,
  setCaptureSession,
  markProxyRestored,
  markDataChanged,
});
