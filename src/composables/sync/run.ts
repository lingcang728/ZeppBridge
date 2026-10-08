import { backend, isDesktop, toUserMessage } from '../../lib/bridge';
import type { OfficialStatus, SyncReport } from '../../types';
import { readyOnReport, readyOnStart } from '../../lib/dataReady';
import { failedStreamKeys, isCancelledSyncError, isDeferredSyncError } from '../../lib/syncDeferred';
import { errorTextFor } from '../../i18n/errors';
import { noticeForReport } from './notice';
import {
  appStatus, cloudStaleTip, copy, dataReady, dataRevision, notice, refreshStatus, statusError, statusErrorFromSync, streamUpdate,
  syncProgress, syncReport, syncState,
} from './state';

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
/** 上一次真正发出同步命令的时刻（毫秒）。自动同步据此避开「刚同步过 / 刚失败过」。 */
let lastAttemptAt = 0;

/* `quick` 要原样带过去：定时的快速同步让路之后，重试不能变成一次 30 天整窗。 */
const scheduleDeferredRetry = (mode: 'incremental' | 'initial' | 'history', days?: number, quick?: boolean) => {
  window.clearTimeout(deferredRetryTimer);
  deferredRetryTimer = window.setTimeout(() => {
    void runSync(mode, days, { silent: true, quick });
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

/** 用户在等的同步有了结果：亮起「数据已备好」，或者灭掉等待。`firstRun`：连上账号后的第一次。 */
const settleReady = (report: SyncReport | null, firstRun = false) => {
  dataReady.value = readyOnReport(dataReady.value, report, report ? failedStreamKeys(report.streams) : [], firstRun);
};

/**
 * @param opts.silent 后台发起：不弹「已有同步进行中」。
 * @param opts.quick 定时自动同步：只拉最近几天（后端决定，整窗刷新到期时照旧整窗）。
 * @param opts.waited 用户在等这次同步的结果（启动同步、用户自己点的同步）。
 * @param opts.skipProbe 不先探云端新不新：「云端还没有新数据」提示里的「再试」——用户刚在手机上
 *   下拉过，就是要真同步一次。
 *   默认跟着 silent 走：不静默的都是用户点的。启动同步虽然静默，但用户就是
 *   在等它——由 useSyncController 显式传 true。
 */
export const runSync = (
  mode: 'incremental' | 'initial' | 'history' = 'incremental',
  days?: number,
  opts?: { silent?: boolean; waited?: boolean; quick?: boolean; skipProbe?: boolean },
): Promise<SyncReport | null> => {
  const waited = opts?.waited ?? !opts?.silent;
  if (runningSync) {
    // 后台同步正跑着，用户又点了一下：他现在就是在等这一次，跑完照样喊他。
    if (waited) dataReady.value = readyOnStart(dataReady.value, true);
    if (!opts?.silent) {
      notice.value = { kind: 'alreadySyncing' };
      return Promise.resolve(null);
    }
    return runningSync;
  }
  const promise = (async () => {
    if (!isDesktop()) {
      statusError.value = copy().desktopOnly;
      settleReady(null);
      return null;
    }
    const status = appStatus.value ?? await refreshStatus();
    // 记在跑之前：同步一旦成功就会写上 last_cloud_sync_at，跑完再读就分不出
    // 这是不是第一次了。
    const wasFirstSync = !status?.last_cloud_sync_at;
    if (status?.connection_state === 'needs_reauth') {
      syncState.value = 'failed';
      notice.value = { kind: 'reauthNeeded' };
      settleReady(null);
      return null;
    }
    if (status?.connection_state !== 'connected') {
      syncState.value = 'failed';
      notice.value = status?.connection_state === 'configured'
        ? { kind: 'verifyFirst' }
        : { kind: 'connectFirst' };
      settleReady(null);
      return null;
    }
    dataReady.value = readyOnStart(dataReady.value, waited);
    lastAttemptAt = Date.now();
    cloudStaleTip.value = null;
    syncState.value = 'syncing';
    syncProgress.value = null;
    notice.value = mode === 'incremental'
      ? { kind: 'syncingRecent', days: opts?.quick ? status?.auto_sync_days : undefined }
      : { kind: 'backfilling', days: days ?? status?.history_sync_days ?? 30 };
    statusError.value = null;
    statusErrorFromSync.value = false;
    // 记下进度事件的序号：命令最后抛错时，凭它判断这一趟是不是已经写进了数据。
    const streamRevisionAtStart = streamUpdate.value.revision;
    try {
      const report = mode === 'incremental'
        ? await backend.startIncrementalSync(Boolean(opts?.quick), Boolean(opts?.skipProbe))
        : await backend.startHistorySync(days ?? status?.history_sync_days ?? 30);
      syncReport.value = report;
      syncState.value = report.outcome;
      notice.value = noticeForReport(report);
      await refreshStatus();
      // 放在 refreshStatus 之后：「好了」亮起时，顶栏的同步时间和各页的数据已经是新的。
      settleReady(report, wasFirstSync && mode === 'incremental');
      // 只有真的写了数据才让各页重查。以前 no_new_data / failed / cancelled 也 bump：
      // 每 15 分钟一次自动同步（哪怕离线、一条没写）都让八九个查询排到同一把库锁
      // 后面，图表整张重画——用户看到的是定时的一卡。
      if (report.total_records > 0) dataRevision.value += 1;
      // 云端还没有新数据：用户自己点的同步才弹提示（教他去手机上下拉一下）；定时同步不打扰。
      if (report.outcome === 'cloud_stale' && waited && !opts?.quick) cloudStaleTip.value = { latestAt: report.cloud_latest_at ?? null };
      if (report.outcome === 'deferred') scheduleDeferredRetry(mode, days, opts?.quick);
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
      // 命令抛错不等于什么都没发生：后端可能在数据全部落库之后才在记账那一步失败。
      // 收到过「某条流完成」的进度事件，就说明库里已经是新的了，页面要重查。
      const wroteSomething = streamUpdate.value.revision !== streamRevisionAtStart;
      if (isDeferredSyncError(error)) {
        // 让路（重放 / 压缩 / 锁忙）不是失败：和报告里的 deferred 一样，静默地过一分钟再来。
        syncState.value = 'deferred';
        const code = (error as { code?: string }).code;
        notice.value = {
          kind: 'report',
          outcome: 'deferred',
          failedStreams: [],
          backendMessage: errorTextFor(code) ?? undefined,
        };
        await refreshStatus();
        if (wroteSomething) dataRevision.value += 1;
        scheduleDeferredRetry(mode, days, opts?.quick);
        // 不 settle：用户在等的结果还没出来，重试成功时才亮「好了」。
        return null;
      }
      if (isCancelledSyncError(error)) {
        syncState.value = 'cancelled';
        notice.value = { kind: 'report', outcome: 'cancelled', failedStreams: [] };
        await refreshStatus();
        if (wroteSomething) dataRevision.value += 1;
        settleReady(null);
        return null;
      }
      syncState.value = 'failed';
      notice.value = { kind: 'backend', text: toUserMessage(error, copy().syncDidNotFinish) };
      // 存「这条错误来自同步」而不是渲染好的句子：切语言时它跟着重算。
      statusErrorFromSync.value = true;
      await refreshStatus({ preserveError: true });
      if (wroteSomething) dataRevision.value += 1;
      settleReady(null);
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
  // 只给发起取消时正在跑的那一趟写「正在取消」：报告可能在取消命令往返途中先到，
  // 那时再写这句就会把结果盖掉，而且再没有人替换它。
  const target = runningSync;
  try {
    await backend.cancelSync();
    if (target && runningSync === target) notice.value = { kind: 'cancelling' };
  } catch (error) {
    statusError.value = toUserMessage(error, copy().cancelFailed);
  }
};

/** 上一次发出同步命令的时刻（毫秒，0 = 本次会话还没有过）。 */
export const lastSyncAttemptAt = () => lastAttemptAt;

let officialState = '';

/**
 * Zepp 官方授权状态变了：全局状态跟着刷新，刚连上且从没同步过就起首次同步。
 *
 * 以前只有设置卡自己记着官方状态：连上后卡上说「已连接」，顶栏还说「先连接」、
 * 不起首次同步；断开后 appStatus 仍是 connected，每个自动同步 tick 都红一次。
 * 事件和命令返回值都走这里，所以同一个结果送两次也只处理一次。
 */
export const applyOfficialStatus = (next: OfficialStatus) => {
  const previous = officialState;
  officialState = next.state;
  if (previous === next.state || next.state === 'waiting') return;
  void refreshStatus().then((status) => {
    // previous 为空是启动 / 进设置页时补读的当前状态，不是「刚连上」。
    if (
      next.state === 'connected'
      && previous !== ''
      && status?.connection_state === 'connected'
      && !status.last_cloud_sync_at
    ) {
      void runSync('incremental', undefined, { silent: true, waited: true });
    }
  });
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
