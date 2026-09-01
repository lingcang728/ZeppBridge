import { computed, readonly, ref } from 'vue';
import { backend, isDesktop, toUserMessage } from '../lib/bridge';
import { readAutoSyncSettings, writeAutoSyncSettings } from '../lib/autoSync';
import type { AppStatus, LoginStatus, SyncOutcome, SyncProgress, SyncReport } from '../types';
import { syncStreamLabel } from '../lib/syncStreams';
import { defineMessages, intlLocale, messagesOf } from '../i18n';
import { errorTextFor } from '../i18n/errors';
import { backendText } from '../i18n/backendText';

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
    syncingRecent: (days: number) => `正在同步最近 ${days} 天…`,
    backfilling: (days: number) => `正在补拉最近 ${days} 天…`,
    syncDidNotFinish: '云端同步未完成',
    cancelling: '正在取消同步…',
    cancelFailed: '无法取消同步',
    /** 数据流的分隔符：中文用顿号，英文用逗号。 */
    streamSeparator: '、',
    syncingStream: (stream: string) => `正在同步${stream}`,
    backfillingStream: (stream: string, month: string) => `正在补拉${stream} · ${month}`,
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
    syncingRecent: (days: number) => `Syncing the last ${days} days…`,
    backfilling: (days: number) => `Backfilling the last ${days} days…`,
    syncDidNotFinish: 'The cloud sync did not finish',
    cancelling: 'Cancelling the sync…',
    cancelFailed: 'Could not cancel the sync',
    streamSeparator: ', ',
    syncingStream: (stream: string) => `Syncing ${stream.toLowerCase()}`,
    backfillingStream: (stream: string, month: string) => `Backfilling ${stream.toLowerCase()} · ${month}`,
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
  | { kind: 'progress'; code: string; stream: string; month: string | null; text: string }
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
/**
 * 自动同步那个每分钟一跳的定时器。
 *
 * 以前 `setInterval` 的返回值直接丢掉了，于是 `initialize()` 每被调一次就多
 * 出一个永远清不掉的定时器：HMR、窗口重建、或者以后哪次 composable 被重新
 * 初始化，就会有两个自动同步同时在跑。监听器那边本来就会先解绑再重注册，
 * 定时器却漏了——这里补上，并由 `dispose()` 统一收口。
 */
let autoSyncTimer: number | null = null;

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
    // 失败流列的是键（heart_rate…），显示时换成人话。
    const names = failedStreams.map((stream) => syncStreamLabel(stream));
    return names.length ? t.partialWithStreams(names.join(t.streamSeparator)) : t.partial;
  }
  if (outcome === 'cancelled') return t.cancelled;
  if (outcome === 'deferred') return backendMessage ?? t.deferred;
  return t.failed;
};

/**
 * 增量同步往回拉多少天。
 *
 * 从后端状态读，**不在这里写死**。它曾经写死成 7：后端改成 30 之后，界面
 * 整整一个版本都还在说「正在同步最近 7 天」——用户看到的数字和程序做的事
 * 不是一回事，而这种漂移不会让任何测试变红。契约值在
 * `zeppbridge_core::contract::INCREMENTAL_SYNC_DAYS`。
 *
 * 状态还没到手时（第一次同步的头几百毫秒）用 30 兜底：那是当前的契约值，
 * 而这一句话本来就是过渡态的提示。
 */
const incrementalSyncDays = () => appStatus.value?.incremental_sync_days ?? 30;

const renderNotice = (value: SyncNotice): string => {
  const t = copy();
  switch (value.kind) {
    case 'none': return t.notSyncedYet;
    case 'backend': return backendText(value.text, t.syncingRecent(incrementalSyncDays()));
    case 'progress': {
      const stream = syncStreamLabel(value.stream);
      if (value.code === 'backfilling' && value.month) return t.backfillingStream(stream, value.month);
      if (value.code === 'backfilling') return t.syncingStream(stream);
      if (value.code === 'syncing') return t.syncingStream(stream);
      // 后端加了新的一步而界面还不认识它：英文界面下不吐中文，给一句笼统的。
      return backendText(value.text, t.syncingRecent(incrementalSyncDays()));
    }
    case 'syncingRecent': return t.syncingRecent(incrementalSyncDays());
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
  // deferred 那句话后端给了稳定码，按界面语言取；取不到才用后端的中文原文。
  backendMessage: report.outcome === 'deferred'
    ? errorTextFor(report.message_code) ?? report.message ?? undefined
    : undefined,
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

/**
 * 首次连接后，后台自动往回补到这么多天。
 *
 * 和后端的 `UserPrefs::DEFAULT_HISTORY_SYNC_DAYS` 是同一个数，故意的：
 * 后端一直把 180 当作「一个人装完这个应用应该拥有多少历史」，只是从来没有
 * 哪个入口去要它——所有入口跑的都是写死 30 天的增量同步。于是每个新用户的
 * 本地库都只有 30 天，然后在图表上点「6 个月」，看到五个月的空白。
 */
const FIRST_RUN_BACKFILL_DAYS = 180;

/**
 * 首次同步之后接着把历史补齐。
 *
 * 为什么是「先 30 天再补」而不是一上来就要 180 天：首屏得有东西。一次 180 天的
 * 同步要跑十分钟，这十分钟里界面上什么都没有，而 30 天只要几十秒。所以先拿近的
 * 让人能用，剩下的在后台继续——进度条照常显示，随时可以取消。
 *
 * 只在**第一次**发生（此前没有 `last_cloud_sync_at`）。往后的每次同步都是增量，
 * 不会再拖一条长任务。
 */
const scheduleFirstRunBackfill = () => {
  // 空间不够就不要开始。设置页里手动补拉时后端已经会拦（`allow_long_history`），
  // 而这条路径不经过那个对话框——不检查就等于用一条自动任务绕过了同一条规则。
  if (appStatus.value?.storage && !appStatus.value.storage.allow_long_history) return;
  window.setTimeout(() => {
    void runSync('history', FIRST_RUN_BACKFILL_DAYS, { silent: true });
  }, 0);
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
    // 记在跑之前：同步一旦成功就会写上 last_cloud_sync_at，跑完再读就分不出
    // 这是不是第一次了。
    const wasFirstSync = !status?.last_cloud_sync_at;
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
      // 第一次拿到近 30 天之后，接着把 180 天补齐。
      // `deferred` 不算——那次根本没写进任何数据，补拉要等重试真的成功了再排。
      // `cancelled` 更不算：用户刚刚按了取消，紧接着自己排一个十分钟的任务，
      // 是把取消当成没听见。
      else if (
        wasFirstSync
        && mode === 'incremental'
        && report.outcome !== 'failed'
        && report.outcome !== 'cancelled'
      ) {
        scheduleFirstRunBackfill();
      }
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

/**
 * 释放这个 composable 持有的全部长生命周期资源。
 *
 * 监听器和定时器走同一个出口：分散在两处时，加第三样东西的人只会记得其中
 * 一个。调用它之后再 `initialize()` 是安全的。
 */
const dispose = () => {
  for (const unlisten of unlisteners.splice(0)) unlisten();
  if (autoSyncTimer !== null) {
    window.clearInterval(autoSyncTimer);
    autoSyncTimer = null;
  }
  initialized = false;
};

const initialize = async () => {
  if (initialized) {
    // 重入：先把上一轮注册的监听器和定时器全部拆掉，再重新注册。
    dispose();
  }
  initialized = true;
  if (isDesktop()) {
    const unlistenProgress = await backend.listen<SyncProgress>('sync://progress', (payload) => {
      syncProgress.value = payload;
      /* 进度这句话由界面按码和 stream 自己写。后端那份中文留作兜底：
         它加了新的一步而界面还不认识时，宁可显示中文也不显示空白。 */
      notice.value = payload.code
        ? {
          kind: 'progress',
          code: payload.code,
          stream: payload.stream,
          month: payload.detail ?? null,
          text: payload.message,
        }
        : { kind: 'backend', text: payload.message };
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
    autoSyncTimer = window.setInterval(() => {
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
  dispose,
});
