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
