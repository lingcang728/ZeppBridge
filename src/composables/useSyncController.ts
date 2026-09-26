/* 全局唯一的同步状态机：顶栏、设置页、启动同步、自动同步都经由这里。
 *
 * 状态在 sync/state.ts，文案渲染在 sync/notice.ts，发起同步在 sync/run.ts；
 * 这里负责事件监听、自动同步定时器和对外的只读视图。 */
import { computed, readonly } from 'vue';
import { backend, isDesktop } from '../lib/bridge';
import { launchSyncIsDue, writeAutoSyncSettings } from '../lib/autoSync';
import type { LoginStatus, SyncProgress } from '../types';
import { formatClock, lastOutcomeLabel, syncMessage } from './sync/notice';
import { cancelSync, clearRunTimers, isRunningSync, runSync } from './sync/run';
import {
  appStatus, applyLoginStatus, autoSyncEnabled, autoSyncInterval, compacting, compactingEvent, compactionPending,
  compactionSaved, copy, dataRevision, loginStatus, notice, refreshStatus, statusError, streamUpdate, syncProgress,
  syncReport, syncState,
} from './sync/state';

export type { SyncUiState } from './sync/state';
export { syncOutcomeLabel } from './sync/notice';

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
let initializeEpoch = 0;
let compactionSavedTimer = 0;

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
const clearHeldResources = () => {
  for (const unlisten of unlisteners.splice(0)) unlisten();
  clearRunTimers();
  window.clearTimeout(compactionSavedTimer);
  compactionSavedTimer = 0;
  if (autoSyncTimer !== null) {
    window.clearInterval(autoSyncTimer);
    autoSyncTimer = null;
  }
};

const dispose = () => {
  initializeEpoch += 1;
  clearHeldResources();
};

const initialize = async () => {
  const myEpoch = ++initializeEpoch;
  clearHeldResources();
  const stillMine = () => myEpoch === initializeEpoch;
  const keepUnlisten = (unlisten: unknown) => {
    if (typeof unlisten !== 'function') return;
    const fn = unlisten as () => void;
    if (!stillMine()) {
      fn();
      return;
    }
    unlisteners.push(fn);
  };
  // 一个事件注册失败（启动早期的 IPC 抖动等）不该拖垮整个 initialize()：
  // 后面还有别的监听器、refreshStatus()、auto-sync 定时器要设置。
  const safeListen = async <T>(event: string, handler: (payload: T) => void) => {
    try {
      keepUnlisten(await backend.listen<T>(event, handler));
    } catch {
      // 这一个事件监听不上，其它启动步骤仍要继续。
    }
  };
  if (isDesktop()) {
    /* 五个事件监听彼此没有依赖，登录态查询也不等任何人——串行 await 是六趟
       IPC 往返，一把 Promise.all 只等最慢的那趟。单个 listen 走 safeListen：
       启动早期 IPC 抖动时这一路失败，其它监听器和 refreshStatus 仍要继续。 */
    const [initialLogin] = await Promise.all([
      backend.getLoginStatus().catch(() => null),
      safeListen<SyncProgress>('sync://progress', (payload) => {
        if (payload.completed) {
          streamUpdate.value = { stream: payload.stream, revision: streamUpdate.value.revision + 1 };
          return;
        }
        // 设置页的历史补拉也走 sync://progress。顶栏只认控制器自己发起的同步，
        // 否则一轮补拉会把「已同步」横幅冲掉。
        if (!isRunningSync()) return;
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
      }),
      safeListen('tray://sync', () => {
        void runSync('incremental');
      }),
      safeListen<LoginStatus>('login://status', applyLoginStatus),
      safeListen<number>('compaction://started', (pending) => {
        compactionPending.value = typeof pending === 'number' ? pending : 0;
        compactingEvent.value = true;
        compactionSaved.value = null;
      }),
      safeListen<{ bytesBefore: number; bytesAfter: number }>(
        'compaction://finished',
        (report) => {
          compactingEvent.value = false;
          const saved = (report?.bytesBefore ?? 0) - (report?.bytesAfter ?? 0);
          compactionSaved.value = saved > 0 ? saved : null;
          window.clearTimeout(compactionSavedTimer);
          compactionSavedTimer = window.setTimeout(() => { compactionSaved.value = null; }, 12_000);
        },
      ),
    ]);
    if (!stillMine()) return;
    if (initialLogin) applyLoginStatus(initialLogin);
    if (!stillMine()) return;
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
  if (!stillMine()) return;
  if (status?.connection_state === 'configured' && isDesktop()) {
    try {
      await backend.verifyAuth();
      if (!stillMine()) return;
      status = await refreshStatus();
    } catch {
      if (!stillMine()) return;
      await refreshStatus();
    }
  }
  if (!stillMine()) return;
  if (autoSyncEnabled.value && status?.connection_state === 'connected'
    && launchSyncIsDue(status?.last_cloud_sync_at, autoSyncInterval.value)) {
    void runSync('incremental', undefined, { silent: true });
  }
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
  streamUpdate: readonly(streamUpdate),
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
