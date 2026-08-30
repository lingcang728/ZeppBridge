import { computed, readonly, ref } from 'vue';
import { backend, isDesktop, toUserMessage } from '../lib/bridge';
import { readAutoSyncSettings, writeAutoSyncSettings } from '../lib/autoSync';
import type { AppStatus, LoginStatus, SyncOutcome, SyncProgress, SyncReport } from '../types';
import { defineMessages, intlLocale, messagesOf } from '../i18n';

export type SyncUiState = 'idle' | 'syncing' | SyncOutcome;

const messages = defineMessages(
  {
    notSyncedYet: '尚未同步',
    timeUnknown: '未知时间',
    updatedWithLatest: (clock: string) => `已同步到新数据 · 最新心率 ${clock}`,
    updated: '已同步到新数据',
    noNewDataWithLatest: (clock: string) => `云端暂无新数据 · 最新心率仍为 ${clock}`,
    noNewData: '同步完成，云端暂无新数据',
    partialWithStreams: (streams: string) => `部分同步失败：${streams}`,
    partial: '同步已完成，但部分数据流失败',
    cancelled: '同步已取消',
    deferred: '正在重建本地派生数据，稍后自动重试同步',
    failed: '同步失败，请检查连接后重试',
    lastCloudSync: (clock: string) => `上次云端同步 ${clock}`,
    cloudSyncClock: (clock: string) => `云端同步时间 ${clock}`,
    cloudSyncClockUnknown: '云端同步时间 —',
    statusUnavailable: '连接状态暂时不可用',
    alreadySyncing: '已有同步进行中，请稍后再试',
    desktopOnly: '请使用桌面应用',
    reauthNeeded: '认证已失效，请重新连接 Zepp',
    verifyFirst: '请先完成连接验证',
    connectFirst: '请先连接 Zepp',
    syncingRecent: '正在同步最近 7 天…',
    backfilling: (days: number) => `正在补拉最近 ${days} 天…`,
    syncDidNotFinish: '云端同步未完成',
    cancelling: '正在取消同步…',
    cancelFailed: '无法取消同步',
    /** 数据流的分隔符：中文用顿号，英文用逗号。 */
    streamSeparator: '、',
  },
  {
    notSyncedYet: 'Not synced yet',
    timeUnknown: 'Time unknown',
    updatedWithLatest: (clock: string) => `New data pulled in · latest heart rate ${clock}`,
    updated: 'New data pulled in',
    noNewDataWithLatest: (clock: string) => `Nothing new in the cloud · latest heart rate still ${clock}`,
    noNewData: 'Sync finished. The cloud had nothing new',
    partialWithStreams: (streams: string) => `Some streams failed: ${streams}`,
    partial: 'Sync finished, but some data streams failed',
    cancelled: 'Sync cancelled',
    deferred: 'Rebuilding local derived data. The sync will retry on its own',
    failed: 'Sync failed. Check the connection and try again',
    lastCloudSync: (clock: string) => `Last cloud sync ${clock}`,
    cloudSyncClock: (clock: string) => `Cloud sync ${clock}`,
    cloudSyncClockUnknown: 'Cloud sync —',
    statusUnavailable: 'Connection status is unavailable right now',
    alreadySyncing: 'A sync is already running. Try again once it finishes',
    desktopOnly: 'Use the desktop app',
    reauthNeeded: 'Your Zepp session expired. Connect again',
    verifyFirst: 'Verify the connection first',
    connectFirst: 'Connect to Zepp first',
    syncingRecent: 'Syncing the last 7 days…',
    backfilling: (days: number) => `Backfilling the last ${days} days…`,
    syncDidNotFinish: 'The cloud sync did not finish',
    cancelling: 'Cancelling the sync…',
    cancelFailed: 'Could not cancel the sync',
    streamSeparator: ', ',
  },
);

const copy = () => messagesOf(messages);

/*
 * 状态条上那句话存的是「发生了什么」，不是渲染好的字符串。
 *
 * 存字符串的话，用户切一次语言，横幅上就会留着上一种语言的句子直到下次同步
 * ——而同步结果恰恰是最需要看懂的一句。存成结构，渲染放在 computed 里，
 * 切语言时它自己会重算。
 *
 * `backend` 这一档是后端发来的原文（sync://progress 的进度消息、命令返回的
 * 错误）。后端不按 locale 出文案是刻意的：GUI / CLI / MCP / 导出四个出口对
 * 同一个问题必须给同一份回答。这些句子的语言跟着后端走。
 */
type SyncNotice =
  | { kind: 'none' }
  | { kind: 'backend'; text: string }
  | { kind: 'syncingRecent' }
  | { kind: 'backfilling'; days: number }
  | { kind: 'alreadySyncing' }
  | { kind: 'desktopOnly' }
  | { kind: 'reauthNeeded' }
  | { kind: 'verifyFirst' }
  | { kind: 'connectFirst' }
  | { kind: 'cancelling' }
  | { kind: 'report'; outcome: SyncOutcome; failedStreams: string[]; latestAt?: string; backendMessage?: string };

const appStatus = ref<AppStatus | null>(null);
const statusError = ref<string | null>(null);
const syncState = ref<SyncUiState>('idle');
const notice = ref<SyncNotice>({ kind: 'none' });
const syncReport = ref<SyncReport | null>(null);
const syncProgress = ref<SyncProgress | null>(null);
const loginStatus = ref<LoginStatus>({ state: 'idle', message: '', page_url: '' });
const dataRevision = ref(0);
/* 装完新版本第一次启动时，后台会把存量原始报文压掉（默认开启）。
   这期间界面要说一句「正在压缩」，压完自己消失——不然用户只会觉得
   「刚装完怎么有点卡」。 */
const compactionPending = ref(0);
/* 事件（compaction://started）可能在前端开始监听之前就发出去了，所以这里
   同时认状态：refreshStatus() 每次都会带回后台此刻是不是在压缩。 */
const compactingEvent = ref(false);
const compacting = computed(() => compactingEvent.value || appStatus.value?.compacting === true);
const compactionSaved = ref<number | null>(null);
const autoSyncEnabled = ref(readAutoSyncSettings().enabled);
const autoSyncInterval = ref(readAutoSyncSettings().intervalMinutes);
let initialized = false;
let runningSync: Promise<SyncReport | null> | null = null;
let autoSyncTickCount = 0;
const unlisteners: Array<() => void> = [];

const formatTime = (value?: string): string => {
  if (!value) return copy().timeUnknown;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return copy().timeUnknown;
  return new Intl.DateTimeFormat(intlLocale(), {
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
  return new Intl.DateTimeFormat(intlLocale(), { hour: '2-digit', minute: '2-digit' }).format(date);
};

const latestHeartRateAt = (report?: SyncReport | null): string | undefined =>
  report?.streams.find((stream) => stream.stream === 'heart_rate')?.newest_sample_at
  ?? appStatus.value?.streams.find((stream) => stream.stream === 'heart_rate')?.newest_sample_at;

const renderReport = (
  outcome: SyncOutcome,
  failedStreams: string[],
  latestAt?: string,
  backendMessage?: string,
): string => {
  const t = copy();
  const latest = latestAt ? formatTime(latestAt) : null;
  if (outcome === 'updated') return latest ? t.updatedWithLatest(latest) : t.updated;
  if (outcome === 'no_new_data') return latest ? t.noNewDataWithLatest(latest) : t.noNewData;
  if (outcome === 'partial') {
    return failedStreams.length ? t.partialWithStreams(failedStreams.join(t.streamSeparator)) : t.partial;
  }
  if (outcome === 'cancelled') return t.cancelled;
  if (outcome === 'deferred') return backendMessage ?? t.deferred;
  return t.failed;
};

const renderNotice = (value: SyncNotice): string => {
  const t = copy();
  switch (value.kind) {
    case 'none': return t.notSyncedYet;
    case 'backend': return value.text;
    case 'syncingRecent': return t.syncingRecent;
    case 'backfilling': return t.backfilling(value.days);
    case 'alreadySyncing': return t.alreadySyncing;
    case 'desktopOnly': return t.desktopOnly;
    case 'reauthNeeded': return t.reauthNeeded;
    case 'verifyFirst': return t.verifyFirst;
    case 'connectFirst': return t.connectFirst;
    case 'cancelling': return t.cancelling;
    case 'report':
      return renderReport(value.outcome, value.failedStreams, value.latestAt, value.backendMessage);
  }
};

const syncMessage = computed(() => renderNotice(notice.value));

const noticeForReport = (report: SyncReport): SyncNotice => ({
  kind: 'report',
  outcome: report.outcome,
  failedStreams: report.streams
    .filter((stream) => ['failed', 'unavailable', 'unverified'].includes(stream.status))
    .map((stream) => stream.stream),
  latestAt: latestHeartRateAt(report),
  backendMessage: report.outcome === 'deferred' ? report.message ?? undefined : undefined,
});

const lastOutcomeLabel = computed(() => {
  const outcome = appStatus.value?.last_cloud_sync_outcome;
  if (!outcome) return null;
  const latest = latestHeartRateAt();
  if (outcome === 'no_new_data' && latest) return copy().noNewDataWithLatest(formatTime(latest));
  return copy().lastCloudSync(formatTime(appStatus.value?.last_cloud_sync_at));
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
    statusError.value = toUserMessage(error, copy().statusUnavailable);
    return null;
  }
};

/**
 * Come back once the raw-payload replay has had another minute.
 *
 * The replay runs for as long as a quarter of an hour on a large library, and
 * a sync that gave up permanently would leave the user looking at stale data
 * with no way back except restarting the app. `runSync` already refuses to
 * stack, so a retry landing on a running sync is a no-op.
 */
const DEFERRED_RETRY_MS = 60_000;
let deferredRetryTimer = 0;

const scheduleDeferredRetry = (mode: 'incremental' | 'initial' | 'history', days?: number) => {
  window.clearTimeout(deferredRetryTimer);
  deferredRetryTimer = window.setTimeout(() => {
    void runSync(mode, days, { silent: true });
  }, DEFERRED_RETRY_MS);
};

const runSync = (
  mode: 'incremental' | 'initial' | 'history' = 'incremental',
  days?: number,
  opts?: { silent?: boolean },
): Promise<SyncReport | null> => {
  if (runningSync) {
    if (!opts?.silent) {
      notice.value = { kind: 'alreadySyncing' };
      return Promise.resolve(null);
    }
    return runningSync;
  }
  const promise = (async () => {
    if (!isDesktop()) {
      statusError.value = copy().desktopOnly;
      return null;
    }
    const status = appStatus.value ?? await refreshStatus();
    if (status?.connection_state === 'needs_reauth') {
      syncState.value = 'failed';
      notice.value = { kind: 'reauthNeeded' };
      return null;
    }
    if (mode === 'incremental' && status?.connection_state !== 'connected') {
      syncState.value = 'failed';
      notice.value = status?.connection_state === 'configured'
        ? { kind: 'verifyFirst' }
        : { kind: 'connectFirst' };
      return null;
    }
    if (status?.connection_state === 'unconfigured') {
      syncState.value = 'failed';
      notice.value = { kind: 'connectFirst' };
      return null;
    }
    syncState.value = 'syncing';
    syncProgress.value = null;
    notice.value = mode === 'incremental'
      ? { kind: 'syncingRecent' }
      : { kind: 'backfilling', days: days ?? status?.history_sync_days ?? 30 };
    statusError.value = null;
    try {
      const report = mode === 'incremental'
        ? await backend.startIncrementalSync()
        : await backend.startHistorySync(days ?? status?.history_sync_days ?? 30);
      syncReport.value = report;
      syncState.value = report.outcome;
      notice.value = noticeForReport(report);
      await refreshStatus();
      // A deferred sync wrote nothing, but the replay it stood aside for is
      // rewriting derived rows right now — so the screens still need to
      // reread, and the sync itself has to come back rather than be lost.
      dataRevision.value += 1;
      if (report.outcome === 'deferred') scheduleDeferredRetry(mode, days);
      return report;
    } catch (error) {
      syncState.value = 'failed';
      notice.value = { kind: 'backend', text: toUserMessage(error, copy().syncDidNotFinish) };
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
    notice.value = { kind: 'cancelling' };
  } catch (error) {
    statusError.value = toUserMessage(error, copy().cancelFailed);
  }
};

const setAutoSyncEnabled = (enabled: boolean) => {
  autoSyncEnabled.value = Boolean(enabled);
  writeAutoSyncSettings({ enabled: autoSyncEnabled.value, intervalMinutes: autoSyncInterval.value });
};

const setAutoSyncInterval = (minutes: number) => {
  autoSyncInterval.value = minutes;
  writeAutoSyncSettings({ enabled: autoSyncEnabled.value, intervalMinutes: minutes });
};

const initialize = async () => {
  if (initialized) {
    // Re-entry: tear down previously registered listeners before re-registering.
    for (const unlisten of unlisteners.splice(0)) unlisten();
  }
  initialized = true;
  if (isDesktop()) {
    const unlistenProgress = await backend.listen<SyncProgress>('sync://progress', (payload) => {
      syncProgress.value = payload;
      notice.value = { kind: 'backend', text: payload.message };
    });
    if (typeof unlistenProgress === 'function') unlisteners.push(unlistenProgress);
    const unlistenTray = await backend.listen('tray://sync', () => {
      void runSync('incremental');
    });
    if (typeof unlistenTray === 'function') unlisteners.push(unlistenTray);
    const unlistenLogin = await backend.listen<LoginStatus>('login://status', applyLoginStatus);
    if (typeof unlistenLogin === 'function') unlisteners.push(unlistenLogin);
    const unlistenCompactStart = await backend.listen<number>('compaction://started', (pending) => {
      compactionPending.value = typeof pending === 'number' ? pending : 0;
      compactingEvent.value = true;
      compactionSaved.value = null;
    });
    if (typeof unlistenCompactStart === 'function') unlisteners.push(unlistenCompactStart);
    const unlistenCompactDone = await backend.listen<{ bytesBefore: number; bytesAfter: number }>(
      'compaction://finished',
      (report) => {
        compactingEvent.value = false;
        const saved = (report?.bytesBefore ?? 0) - (report?.bytesAfter ?? 0);
        compactionSaved.value = saved > 0 ? saved : null;
        // 压完的提示自己退场：这是一次性的后台维护，不该常驻。
        window.setTimeout(() => { compactionSaved.value = null; }, 12_000);
      },
    );
    if (typeof unlistenCompactDone === 'function') unlisteners.push(unlistenCompactDone);
    try {
      applyLoginStatus(await backend.getLoginStatus());
    } catch {
      // Login status is optional at startup.
    }
    // Fixed 1-minute tick; interval changes take effect without rebuilding the timer.
    window.setInterval(() => {
      autoSyncTickCount += 1;
      if (autoSyncEnabled.value && appStatus.value?.connection_state === 'connected') {
        if (autoSyncTickCount >= autoSyncInterval.value) {
          autoSyncTickCount = 0;
          void runSync('incremental', undefined, { silent: true });
        }
      } else {
        autoSyncTickCount = 0;
      }
    }, 60_000);
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
  syncMessage,
  syncReport: readonly(syncReport),
  syncProgress: readonly(syncProgress),
  loginStatus: readonly(loginStatus),
  dataRevision: readonly(dataRevision),
  compacting,
  compactionPending: readonly(compactionPending),
  compactionSaved: readonly(compactionSaved),
  autoSyncEnabled: readonly(autoSyncEnabled),
  autoSyncInterval: readonly(autoSyncInterval),
  isSyncing: computed(() => syncState.value === 'syncing'),
  canIncrementalSync: computed(() => appStatus.value?.connection_state === 'connected'),
  lastCloudSyncLabel: computed(() => {
    const clock = formatClock(appStatus.value?.last_cloud_sync_at);
    return clock ? copy().cloudSyncClock(clock) : copy().cloudSyncClockUnknown;
  }),
  lastOutcomeLabel,
  initialize,
  refreshStatus,
  runSync,
  cancelSync,
  setAutoSyncEnabled,
  setAutoSyncInterval,
  markDataChanged,
});
