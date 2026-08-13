import { invoke } from '@tauri-apps/api/core';
import type {
  AppStatus,
  AuthInfo,
  CaptureStatus,
  CaptureSession,
  ExportResult,
  ExportSelection,
  HealthOverview,
  ReprocessResult,
  SleepSession,
  SyncReport,
  Workout,
} from '../types';

type UnknownRecord = Record<string, unknown>;

export class TauriUnavailableError extends Error {
  constructor() {
    super('请从 ZeppBridge 桌面应用打开');
    this.name = 'TauriUnavailableError';
  }
}

export const isTauri = (): boolean => {
  if (typeof window === 'undefined') return false;
  const host = window as Window & {
    __TAURI_INTERNALS__?: unknown;
    __TAURI__?: unknown;
  };
  return Boolean(host.__TAURI_INTERNALS__ || host.__TAURI__);
};

const errorText = (error: unknown): string => {
  if (typeof error === 'string') return error;
  if (error instanceof Error) return error.message;
  if (typeof error === 'object' && error !== null) {
    const candidate = error as UnknownRecord;
    if (typeof candidate.message === 'string') return candidate.message;
    if (typeof candidate.error === 'string') return candidate.error;
  }
  return '';
};

/** Convert Rust Err(String) and browser/runtime errors into short user-facing copy. */
export const toUserMessage = (error: unknown, fallback = '操作未完成，请稍后重试'): string => {
  const source = errorText(error).replace(/^Err\((.*)\)$/s, '$1').trim();
  if (!source) return fallback;
  const lower = source.toLowerCase();

  if (
    lower.includes('complete_capture_user_id') &&
    /unknown|not found|not registered|unsupported|unimplemented|command|未找到|不存在|未注册|不支持/.test(lower)
  ) {
    return '当前桌面后端版本不支持“补充用户 ID”。请更新 ZeppBridge 后重试，或切换手动方式。';
  }
  if (lower.includes('address already in use') || lower.includes('os error 10048')) {
    return '本机端口不可用，请关闭占用该端口的程序后重试。';
  }
  if (lower.includes('timed out') || lower.includes('timeout')) {
    return '请求超时，请确认网络与 Zepp 区域后重试。';
  }
  if (source.length > 140) return `${source.slice(0, 137)}…`;
  return source;
};

const call = async <T>(command: string, args?: UnknownRecord): Promise<T> => {
  if (!isTauri()) throw new TauriUnavailableError();
  return invoke<T>(command, args);
};

export const tauriApi = {
  getAppStatus(): Promise<AppStatus> {
    return call<AppStatus>('get_app_status');
  },

  saveAuth(auth: AuthInfo): Promise<AppStatus> {
    return call<AppStatus>('save_auth', {
      appToken: auth.appToken,
      userId: auth.userId,
      regionHost: auth.regionHost,
    });
  },

  verifyAuth(): Promise<AppStatus> {
    return call<AppStatus>('verify_auth');
  },

  clearAuth(): Promise<AppStatus> {
    return call<AppStatus>('clear_auth');
  },

  startCapture(port: number): Promise<CaptureSession> {
    return call<CaptureSession>('start_capture', { port });
  },

  getCaptureStatus(): Promise<CaptureStatus> {
    return call<CaptureStatus>('get_capture_status');
  },

  completeCaptureUserId(userId: string): Promise<CaptureStatus> {
    return call<CaptureStatus>('complete_capture_user_id', { userId });
  },

  stopCapture(): Promise<CaptureStatus> {
    return call<CaptureStatus>('stop_capture');
  },

  startInitialSync(days?: number): Promise<SyncReport> {
    return call<SyncReport>('start_initial_sync', days === undefined ? undefined : { days });
  },

  startHistorySync(days: number): Promise<SyncReport> {
    return call<SyncReport>('start_history_sync', { days });
  },

  startIncrementalSync(): Promise<SyncReport> {
    return call<SyncReport>('start_incremental_sync');
  },

  cancelSync(): Promise<void> {
    return call<void>('cancel_sync');
  },

  getHealthOverview(): Promise<HealthOverview> {
    return call<HealthOverview>('get_health_overview');
  },

  getHeartRateSeries(hours = 24): Promise<import('../types').HeartRatePoint[]> {
    return call('get_heart_rate_series', { hours });
  },

  getTrainingLoadSeries(days = 7): Promise<import('../types').DailyPoint[]> {
    return call('get_training_load_series', { days });
  },

  getStorageEstimate(days: number): Promise<import('../types').StorageEstimate> {
    return call('get_storage_estimate', { days });
  },

  setUserPrefs(retentionDays: number, historySyncDays: number): Promise<import('../types').UserPrefs> {
    return call('set_user_prefs', { retentionDays, historySyncDays });
  },

  getRecentSleep(limit = 30): Promise<SleepSession[]> {
    return call<SleepSession[]>('get_recent_sleep', { limit });
  },

  getSleepDetail(sleepId: string): Promise<SleepSession | null> {
    return call<SleepSession | null>('get_sleep_detail', { sleepId });
  },

  getRecentWorkouts(limit = 30): Promise<Workout[]> {
    return call<Workout[]>('get_recent_workouts', { limit });
  },

  getWorkoutDetail(workoutId: string): Promise<Workout | null> {
    return call<Workout | null>('get_workout_detail', { workoutId });
  },

  reprocessLocalData(): Promise<ReprocessResult> {
    return call<ReprocessResult>('reprocess_local_data');
  },

  getExportJson(selection: ExportSelection): Promise<string> {
    return call<string>('get_export_json', { selection });
  },

  saveJsonExport(selection: ExportSelection, path: string): Promise<ExportResult> {
    return call<ExportResult>('save_json_export', { selection, path });
  },

  publishAiExport(selection: ExportSelection): Promise<ExportResult> {
    return call<ExportResult>('publish_ai_export', { selection });
  },

  cleanupOldData(days: number): Promise<UnknownRecord> {
    return call<UnknownRecord>('cleanup_old_data', { days });
  },

  openDataFolder(): Promise<void> {
    return call<void>('open_data_folder');
  },
};
