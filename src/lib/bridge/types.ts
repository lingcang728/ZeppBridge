import type {
  AppStatus,
  AuthInfo,
  ExportResult,
  ExportSelection,
  HealthOverview,
  HeartRatePoint,
  DailyPoint,
  LoginStatus,
  ReprocessResult,
  DeviceProfile,
  SleepSession,
  StorageEstimate,
  SyncReport,
  UserPrefs,
  Workout,
} from '../../types';

export type UnlistenFn = () => void;

export interface BridgeBackend {
  getAppStatus(): Promise<AppStatus>;
  saveAuth(auth: AuthInfo): Promise<AppStatus>;
  verifyAuth(): Promise<AppStatus>;
  clearAuth(): Promise<AppStatus>;

  startWebLogin(): Promise<LoginStatus>;
  cancelWebLogin(): Promise<LoginStatus>;
  getLoginStatus(): Promise<LoginStatus>;

  startInitialSync(days?: number): Promise<SyncReport>;
  startHistorySync(days: number): Promise<SyncReport>;
  startIncrementalSync(): Promise<SyncReport>;
  cancelSync(): Promise<void>;

  getHealthOverview(): Promise<HealthOverview>;
  getHeartRateSeries(hours?: number): Promise<HeartRatePoint[]>;
  getTrainingLoadSeries(days?: number): Promise<DailyPoint[]>;
  getStorageEstimate(days: number): Promise<StorageEstimate>;
  setUserPrefs(retentionDays: number, historySyncDays: number): Promise<UserPrefs>;

  getRecentSleep(limit?: number): Promise<SleepSession[]>;
  getSleepDetail(sleepId: string): Promise<SleepSession | null>;
  getRecentWorkouts(limit?: number): Promise<Workout[]>;
  getWorkoutDetail(workoutId: string): Promise<Workout | null>;
  getDeviceProfile(): Promise<DeviceProfile>;

  reprocessLocalData(): Promise<ReprocessResult>;
  getExportJson(selection: ExportSelection): Promise<string>;
  saveJsonExport(selection: ExportSelection, path: string): Promise<ExportResult>;
  publishAiExport(selection: ExportSelection): Promise<ExportResult>;
  cleanupOldData(days: number): Promise<Record<string, unknown>>;
  openDataFolder(): Promise<void>;

  listen<T>(event: string, handler: (payload: T) => void): Promise<UnlistenFn>;
}
