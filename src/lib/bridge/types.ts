import type {
  AppStatus,
  AiHandoffResult,
  AuthInfo,
  CapabilityOverview,
  CapabilityProbe,
  ExportResult,
  ExportSelection,
  HealthOverview,
  HeartRatePoint,
  HeartRateZoneOptions,
  HeartRateZonePreference,
  DailyPoint,
  LoginStatus,
  MetricSeries,
  LocalApiStatus,
  ReprocessResult,
  DeviceProfile,
  DeviceProfilesResult,
  DiagnosticReport,
  FeedbackSubmissionResult,
  SleepSession,
  StorageEstimate,
  SyncReport,
  TrainingBalancePoint,
  UserPrefs,
  Workout,
  WorkoutSeries,
} from '../../types';

export type UnlistenFn = () => void;

export interface BridgeBackend {
  getAppStatus(): Promise<AppStatus>;
  saveAuth(auth: AuthInfo): Promise<AppStatus>;
  verifyAuth(): Promise<AppStatus>;
  clearAuth(): Promise<AppStatus>;
  importFromHar(harPath: string): Promise<AppStatus>;
  manualAuth(appToken: string, userId: string, regionHost: string): Promise<AppStatus>;

  startWebLogin(): Promise<LoginStatus>;
  cancelWebLogin(): Promise<LoginStatus>;
  getLoginStatus(): Promise<LoginStatus>;

  startInitialSync(days?: number): Promise<SyncReport>;
  startHistorySync(days: number): Promise<SyncReport>;
  startIncrementalSync(): Promise<SyncReport>;
  cancelSync(): Promise<void>;
  probeDataCapabilities(): Promise<CapabilityProbe[]>;
  getCapabilityOverview(): Promise<CapabilityOverview>;

  getHealthOverview(): Promise<HealthOverview>;
  getHeartRateSeries(hours?: number): Promise<HeartRatePoint[]>;
  getTrainingLoadSeries(days?: number): Promise<DailyPoint[]>;
  getMetricSeries(metrics: string[], days: number): Promise<MetricSeries[]>;
  getTrainingBalance(days: number): Promise<TrainingBalancePoint[]>;
  getHeartRateZones(days: number): Promise<HeartRateZoneOptions>;
  setHeartRateZonePreference(
    preference: HeartRateZonePreference,
    days: number,
  ): Promise<HeartRateZoneOptions>;
  getStorageEstimate(days: number): Promise<StorageEstimate>;
  setUserPrefs(retentionDays: number, historySyncDays: number): Promise<UserPrefs>;

  getRecentSleep(limit?: number): Promise<SleepSession[]>;
  getSleepDetail(sleepId: string): Promise<SleepSession | null>;
  getRecentWorkouts(limit?: number): Promise<Workout[]>;
  getWorkoutDetail(workoutId: string): Promise<Workout | null>;
  getWorkoutSeries(workoutId: string): Promise<WorkoutSeries>;
  setWorkoutTypeOverride(workoutId: string, userOverride?: string | null): Promise<Workout>;
  getLocalApiStatus(): Promise<LocalApiStatus>;
  getDeviceProfile(query?: { deviceId?: string; sourceScope?: string }): Promise<DeviceProfile>;
  getDeviceProfiles(refresh?: boolean): Promise<DeviceProfilesResult>;

  reprocessLocalData(): Promise<ReprocessResult>;
  getDiagnosticReport(): Promise<DiagnosticReport>;
  submitDiagnosticReport(): Promise<FeedbackSubmissionResult>;
  getExportJson(selection: ExportSelection): Promise<string>;
  saveJsonExport(selection: ExportSelection, path: string): Promise<ExportResult>;
  saveCsvExport(selection: ExportSelection, path: string): Promise<ExportResult>;
  saveGpxExport(selection: ExportSelection, path: string): Promise<ExportResult>;
  publishAiExport(selection: ExportSelection): Promise<ExportResult>;
  prepareAiHandoff(
    selection: ExportSelection,
    prompt: string,
    includePreciseRoute?: boolean,
  ): Promise<AiHandoffResult>;
  cleanupOldData(days: number): Promise<Record<string, unknown>>;
  openDataFolder(): Promise<void>;

  listen<T>(event: string, handler: (payload: T) => void): Promise<UnlistenFn>;
}
