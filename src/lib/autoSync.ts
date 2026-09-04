export const AUTO_SYNC_SETTINGS_EVENT = 'zeppbridge:auto-sync-settings';
export const AUTO_SYNC_STATUS_EVENT = 'zeppbridge:auto-sync-status';
export const MANUAL_SYNC_STATUS_EVENT = 'zeppbridge:manual-sync-status';
export const DATA_UPDATED_EVENT = 'zeppbridge:data-updated';

const AUTO_SYNC_ENABLED_KEY = 'zeppbridge-auto-sync-enabled';
const AUTO_SYNC_INTERVAL_KEY = 'zeppbridge-auto-sync-interval-minutes';

export const AUTO_SYNC_INTERVALS = [15, 30, 60] as const;

export interface AutoSyncSettings {
  enabled: boolean;
  intervalMinutes: number;
}

export interface AutoSyncStatusDetail {
  state: 'idle' | 'syncing' | 'success' | 'error';
  message: string;
  finishedAt?: string;
}

const normalizeInterval = (value: unknown): number => {
  const parsed = typeof value === 'number' ? value : Number(value);
  return AUTO_SYNC_INTERVALS.includes(parsed as (typeof AUTO_SYNC_INTERVALS)[number]) ? parsed : 15;
};

export const readAutoSyncSettings = (): AutoSyncSettings => {
  if (typeof window === 'undefined') return { enabled: true, intervalMinutes: 15 };
  return {
    enabled: window.localStorage.getItem(AUTO_SYNC_ENABLED_KEY) !== 'false',
    intervalMinutes: normalizeInterval(window.localStorage.getItem(AUTO_SYNC_INTERVAL_KEY)),
  };
};

export const writeAutoSyncSettings = (settings: AutoSyncSettings): AutoSyncSettings => {
  const normalized = { enabled: Boolean(settings.enabled), intervalMinutes: normalizeInterval(settings.intervalMinutes) };
  if (typeof window !== 'undefined') {
    window.localStorage.setItem(AUTO_SYNC_ENABLED_KEY, String(normalized.enabled));
    window.localStorage.setItem(AUTO_SYNC_INTERVAL_KEY, String(normalized.intervalMinutes));
  }
  return normalized;
};

/**
 * 启动时该不该立刻同步一次。
 *
 * `useSyncController.initialize()` 的最后一行以前是无条件的：只要自动同步开着、
 * 账号连着，**每一次进程启动**都会跑一次增量同步，界面上跟着出现「正在同步最近
 * 数据」和进度条。传给它的 `silent: true` 帮不上忙——那个开关只管「已经在同步了」
 * 一个分支，`notice` 和 `sync://progress` 照写不误。
 *
 * 用户看到的就成了「每次打开 ZeppBridge 都在重新同步账号」，而最小化到托盘再
 * 打开却一切正常——后者不重跑 `initialize()`。见 2026-09-04 的反馈。
 *
 * 判断依据是「离上次成功同步过去了多久」，不是「这次是不是启动」：关掉五分钟再
 * 打开，云端不会有新东西，那一趟纯是噪音；隔了一天再打开就该同步，那时它有用，
 * 显示出来也是对的。用自动同步的间隔当门槛，因为那本来就是用户对「多久算新」的
 * 表态。
 *
 * @param lastCloudSyncAt 上次成功同步的时刻（RFC3339）。空表示从没同步过。
 * @param intervalMinutes 自动同步间隔，分钟。
 * @param now 现在（毫秒），便于测试。
 */
export const launchSyncIsDue = (
  lastCloudSyncAt: string | null | undefined,
  intervalMinutes: number,
  now: number = Date.now(),
): boolean => {
  // 从没同步过：这是首次连接后的第一趟，必须跑。
  if (!lastCloudSyncAt) return true;
  const at = new Date(lastCloudSyncAt).getTime();
  // 时间戳解析不出来时按「该同步」处理：宁可多跑一趟，也不要因为一个坏值把
  // 同步永久卡死。下面时钟回跳（负数）同理。
  if (Number.isNaN(at)) return true;
  const elapsedMinutes = (now - at) / 60_000;
  if (elapsedMinutes < 0) return true;
  return elapsedMinutes >= normalizeInterval(intervalMinutes);
};
