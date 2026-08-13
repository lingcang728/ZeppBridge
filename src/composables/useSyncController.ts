import { computed, readonly, ref } from 'vue';
import { backend, isDesktop, toUserMessage } from '../lib/bridge';
import { readAutoSyncSettings, writeAutoSyncSettings } from '../lib/autoSync';
import type { AppStatus, LoginStatus, SyncOutcome, SyncProgress, SyncReport } from '../types';

export type SyncUiState = 'idle' | 'syncing' | SyncOutcome;

const AUTO_SYNC_INTERVAL_MS = 15 * 60_000;
const appStatus = ref<AppStatus | null>(null);
const statusError = ref<string | null>(null);
const syncState = ref<SyncUiState>('idle');
const syncMessage = ref('尚未同步');
const syncReport = ref<SyncReport | null>(null);
const syncProgress = ref<SyncProgress | null>(null);
const loginStatus = ref<LoginStatus>({ state: 'idle', message: '', page_url: '' });
const dataRevision = ref(0);
const autoSyncEnabled = ref(readAutoSyncSettings().enabled);
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

const formatClock = (value?: string): string | null => {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat('zh-CN', { hour: '2-digit', minute: '2-digit' }).format(date);
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
  if (report.outcome === 'cancelled') return '同步已取消';
  return '同步失败，请检查连接后重试';
};

const lastOutcomeLabel = computed(() => {
  const outcome = appStatus.value?.last_cloud_sync_outcome;
  if (!outcome) return null;
  const latest = latestHeartRateAt();
  if (outcome === 'no_new_data' && latest) return `云端暂无新数据 · 最新心率仍为 ${formatTime(latest)}`;
  return `上次云端同步 ${formatTime(appStatus.value?.last_cloud_sync_at)}`;
});

const applyLoginStatus = (status: LoginStatus) => {
  loginStatus.value = status;
  if (status.state === 'connected') void refreshStatus();
};

const refreshStatus = async (opts?: { preserveError?: boolean }): Promise<AppStatus | null> => {
  if (!isDesktop()) return null;
  try {
    if (!opts?.preserveError) statusError.value = null;
    appStatus.value = await backend.getAppStatus();
    return appStatus.value;
  } catch (error) {
    statusError.value = toUserMessage(error, '连接状态暂时不可用');
    return null;
  }
};

const runSync = (
  mode: 'incremental' | 'initial' | 'history' = 'incremental',
  days?: number,
  opts?: { silent?: boolean },
): Promise<SyncReport | null> => {
  if (runningSync) {
    if (!opts?.silent) {
      syncMessage.value = '已有同步进行中，请稍后再试';
      return Promise.resolve(null);
    }
    return runningSync;
  }
  const promise = (async () => {
    if (!isDesktop()) {
      statusError.value = '请使用桌面应用';
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
        ? await backend.startIncrementalSync()
        : await backend.startHistorySync(days ?? status?.history_sync_days ?? 30);
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
      await refreshStatus({ preserveError: true });
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
  if (!isDesktop()) return;
  try {
    await backend.cancelSync();
    syncMessage.value = '正在取消同步…';
  } catch (error) {
    statusError.value = toUserMessage(error, '无法取消同步');
  }
};

const setAutoSyncEnabled = (enabled: boolean) => {
  autoSyncEnabled.value = Boolean(enabled);
  writeAutoSyncSettings({ enabled: autoSyncEnabled.value, intervalMinutes: 15 });
};

const initialize = async () => {
  if (initialized) return;
  initialized = true;
  if (isDesktop()) {
    await backend.listen<SyncProgress>('sync://progress', (payload) => {
      syncProgress.value = payload;
      syncMessage.value = payload.message;
    });
    await backend.listen('tray://sync', () => {
      void runSync('incremental');
    });
    await backend.listen<LoginStatus>('login://status', applyLoginStatus);
    try {
      applyLoginStatus(await backend.getLoginStatus());
    } catch {
      // Login status is optional at startup.
    }
    window.setInterval(() => {
      if (autoSyncEnabled.value && appStatus.value?.connection_state === 'connected') {
        void runSync('incremental', undefined, { silent: true });
      }
    }, AUTO_SYNC_INTERVAL_MS);
  }
  let status = await refreshStatus();
  if (status?.connection_state === 'configured' && isDesktop()) {
    try {
      await backend.verifyAuth();
      status = await refreshStatus();
    } catch {
      await refreshStatus();
    }
  }
  if (autoSyncEnabled.value && status?.connection_state === 'connected') void runSync('incremental', undefined, { silent: true });
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
  loginStatus: readonly(loginStatus),
  dataRevision: readonly(dataRevision),
  autoSyncEnabled: readonly(autoSyncEnabled),
  isSyncing: computed(() => syncState.value === 'syncing'),
  canIncrementalSync: computed(() => appStatus.value?.connection_state === 'connected'),
  lastCloudSyncLabel: computed(() => {
    const clock = formatClock(appStatus.value?.last_cloud_sync_at);
    return clock ? `云端同步时间 ${clock}` : '云端同步时间 —';
  }),
  lastOutcomeLabel,
  initialize,
  refreshStatus,
  runSync,
  cancelSync,
  setAutoSyncEnabled,
  markDataChanged,
});
