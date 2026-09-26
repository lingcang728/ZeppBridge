import { backend, isDesktop, toUserMessage } from '../../lib/bridge';
import type { SyncReport } from '../../types';
import { noticeForReport, syncMessage } from './notice';
import { appStatus, copy, dataRevision, notice, refreshStatus, statusError, syncProgress, syncReport, syncState } from './state';

/* 发起一次同步：前置检查、让路后的重试、首次连接后的历史补齐（从 useSyncController.ts 搬出来）。 */

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
let firstRunTimer = 0;
let runningSync: Promise<SyncReport | null> | null = null;

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
  window.clearTimeout(firstRunTimer);
  firstRunTimer = window.setTimeout(() => {
    void runSync('history', FIRST_RUN_BACKFILL_DAYS, { silent: true });
  }, 0);
};

export const runSync = (
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
    if (status?.connection_state !== 'connected') {
      syncState.value = 'failed';
      notice.value = status?.connection_state === 'configured'
        ? { kind: 'verifyFirst' }
        : { kind: 'connectFirst' };
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
      // deferred 且 0 条写入：页面不必为了让路整页重刷。真正写了派生数据
      // 的重放结束之后，下一次成功同步会再 bump。
      if (!(report.outcome === 'deferred' && report.total_records === 0)) {
        dataRevision.value += 1;
      }
      if (report.outcome === 'deferred') scheduleDeferredRetry(mode, days);
      // 第一次拿到近 30 天之后，接着把 180 天补齐。
      // `deferred` 不算——那次根本没写进任何数据，补拉要等重试真的成功了再排。
      // `cancelled` 更不算：用户刚刚按了取消，紧接着自己排一个十分钟的任务，
      // 是把取消当成没听见。
      else if (
        wasFirstSync
        && mode === 'incremental'
        && report.total_records > 0
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

export const cancelSync = async () => {
  if (!isDesktop()) return;
  try {
    await backend.cancelSync();
    notice.value = { kind: 'cancelling' };
  } catch (error) {
    statusError.value = toUserMessage(error, copy().cancelFailed);
  }
};

/** 顶栏只认控制器自己发起的同步；设置页的补拉也会发 sync://progress。 */
export const isRunningSync = () => runningSync !== null;

/** 清掉这里持有的两个定时器。由 useSyncController 的 clearHeldResources 统一调用。 */
export const clearRunTimers = () => {
  window.clearTimeout(deferredRetryTimer);
  deferredRetryTimer = 0;
  window.clearTimeout(firstRunTimer);
  firstRunTimer = 0;
};
