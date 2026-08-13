import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { DesktopUnavailableError } from './errors';
import type { BridgeBackend, UnlistenFn } from './types';
import type {
  AppStatus,
  AuthInfo,
  DeviceProfile,
  ExportResult,
  ExportSelection,
  HealthOverview,
  LoginStatus,
  ReprocessResult,
  SleepSession,
  SyncReport,
  UserPrefs,
  Workout,
} from '../../types';

type UnknownRecord = Record<string, unknown>;

const isTauriRuntime = (): boolean => {
  if (typeof window === 'undefined') return false;
  const host = window as Window & {
    __TAURI_INTERNALS__?: unknown;
    __TAURI__?: unknown;
  };
  return Boolean(host.__TAURI_INTERNALS__ || host.__TAURI__);
};

const call = async <T>(command: string, args?: UnknownRecord): Promise<T> => {
  if (!isTauriRuntime()) throw new DesktopUnavailableError();
  return invoke<T>(command, args);
};

export const tauriBackend: BridgeBackend = {
  getAppStatus() {
    return call<AppStatus>('get_app_status');
  },

  saveAuth(auth: AuthInfo) {
    return call<AppStatus>('save_auth', {
      appToken: auth.appToken,
      userId: auth.userId,
      regionHost: auth.regionHost,
    });
  },

  verifyAuth() {
    return call<AppStatus>('verify_auth');
  },

  clearAuth() {
    return call<AppStatus>('clear_auth');
  },

  startWebLogin() {
    return call<LoginStatus>('start_web_login');
  },

  cancelWebLogin() {
    return call<LoginStatus>('cancel_web_login');
  },

  getLoginStatus() {
    return call<LoginStatus>('get_login_status');
  },

  startInitialSync(days?: number) {
    return call<SyncReport>('start_initial_sync', days === undefined ? undefined : { days });
  },

  startHistorySync(days: number) {
    return call<SyncReport>('start_history_sync', { days });
  },

  startIncrementalSync() {
    return call<SyncReport>('start_incremental_sync');
  },

  cancelSync() {
    return call<void>('cancel_sync');
  },

  getHealthOverview() {
    return call<HealthOverview>('get_health_overview');
  },

  getHeartRateSeries(hours = 24) {
    return call('get_heart_rate_series', { hours });
  },

  getTrainingLoadSeries(days = 7) {
    return call('get_training_load_series', { days });
  },

  getStorageEstimate(days: number) {
    return call('get_storage_estimate', { days });
  },

  setUserPrefs(retentionDays: number, historySyncDays: number) {
    return call<UserPrefs>('set_user_prefs', { retentionDays, historySyncDays });
  },

  getRecentSleep(limit = 30) {
    return call<SleepSession[]>('get_recent_sleep', { limit });
  },

  getSleepDetail(sleepId: string) {
    return call<SleepSession | null>('get_sleep_detail', { sleepId });
  },

  getRecentWorkouts(limit = 30) {
    return call<Workout[]>('get_recent_workouts', { limit });
  },

  getWorkoutDetail(workoutId: string) {
    return call<Workout | null>('get_workout_detail', { workoutId });
  },

  getDeviceProfile(query?: { deviceId?: string; sourceScope?: string }) {
    return call<DeviceProfile>('get_device_profile', {
      deviceId: query?.deviceId,
      sourceScope: query?.sourceScope,
    });
  },

  reprocessLocalData() {
    return call<ReprocessResult>('reprocess_local_data');
  },

  getExportJson(selection: ExportSelection) {
    return call<string>('get_export_json', { selection });
  },

  saveJsonExport(selection: ExportSelection, path: string) {
    return call<ExportResult>('save_json_export', { selection, path });
  },

  publishAiExport(selection: ExportSelection) {
    return call<ExportResult>('publish_ai_export', { selection });
  },

  cleanupOldData(days: number) {
    return call<Record<string, unknown>>('cleanup_old_data', { days });
  },

  openDataFolder() {
    return call<void>('open_data_folder');
  },

  async listen<T>(event: string, handler: (payload: T) => void): Promise<UnlistenFn> {
    if (!isTauriRuntime()) throw new DesktopUnavailableError();
    return listen<T>(event, (eventPayload) => handler(eventPayload.payload));
  },
};
