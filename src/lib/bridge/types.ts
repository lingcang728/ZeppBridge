import type {
  AppStatus,
  DailyHeartRateExtreme,
  Page,
  AiHandoffResult,
  AuthInfo,
  CapabilityOverview,
  CapabilityProbe,
  ExportResult,
  ExportSelection,
  HealthOverview,
  HeartRatePoint,
  StressPoint,
  HeartRateZoneOptions,
  HeartRateZonePreference,
  DailyPoint,
  LoginStatus,
  MetricSeries,
  BackupManifest,
  BackupVerification,
  CoverageLedger,
  DataHealth,
  DeviceCatalogOption,
  PendingRestore,
  RestorePreview,
  WeeklyReport,
  WorkoutInsight,
  IntegrityCheckResult,
  LocalApiStatus,
  SportOption,
  WorkoutCodeLabel,
  ReprocessResult,
  DeviceProfile,
  DeviceProfilesResult,
  DiagnosticReport,
  FeedbackSubmissionResult,
  SleepSession,
  RawPayloadCompaction,
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

  startWebLogin(locale: 'zh' | 'en'): Promise<LoginStatus>;
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
  getStressSeries(hours?: number): Promise<StressPoint[]>;
  getTrainingLoadSeries(days?: number): Promise<DailyPoint[]>;
  getMetricSeries(metrics: string[], days: number): Promise<MetricSeries[]>;
  getTrainingBalance(days: number): Promise<TrainingBalancePoint[]>;
  getHeartRateZones(days: number): Promise<HeartRateZoneOptions>;
  setHeartRateZonePreference(
    preference: HeartRateZonePreference,
    days: number,
  ): Promise<HeartRateZoneOptions>;
  getStorageEstimate(days: number): Promise<StorageEstimate>;
  setUserPrefs(retentionDays: number, historySyncDays: number, archiveEnabled?: boolean): Promise<UserPrefs>;
  getUserPrefs(): Promise<UserPrefs>;

  getDailyHeartRateExtremes(days: number): Promise<DailyHeartRateExtreme[]>;
  getRecentSleep(limit?: number): Promise<SleepSession[]>;
  getSleepPage(limit: number, offset: number): Promise<Page<SleepSession>>;
  getSleepDetail(sleepId: string): Promise<SleepSession | null>;
  getRecentWorkouts(limit?: number): Promise<Workout[]>;
  getWorkoutPage(limit: number, offset: number): Promise<Page<Workout>>;
  getWorkoutDetail(workoutId: string): Promise<Workout | null>;
  getWorkoutSeries(workoutId: string): Promise<WorkoutSeries>;
  setWorkoutTypeOverride(workoutId: string, userOverride?: string | null): Promise<Workout>;
  getWorkoutTypeOptions(): Promise<SportOption[]>;
  getUnknownWorkoutCodes(): Promise<WorkoutCodeLabel[]>;
  setWorkoutCodeLabel(zeppType: number, label: string | null): Promise<WorkoutCodeLabel[]>;
  getDeviceCatalogOptions(): Promise<DeviceCatalogOption[]>;
  setDeviceModelOverride(deviceKey: string, catalogId: string | null): Promise<void>;
  getLocalApiStatus(): Promise<LocalApiStatus>;
  setLocalApiEnabled(enabled: boolean): Promise<LocalApiStatus>;
  revealLocalApiToken(): Promise<string>;
  rotateLocalApiToken(): Promise<string>;
  getDeviceProfile(query?: { deviceId?: string; sourceScope?: string }): Promise<DeviceProfile>;
  getDeviceProfiles(refresh?: boolean): Promise<DeviceProfilesResult>;

  reprocessLocalData(): Promise<ReprocessResult>;
  getDiagnosticReport(): Promise<DiagnosticReport>;
  getWorkoutInsight(workoutId: string): Promise<WorkoutInsight>;
  getWeeklyReport(): Promise<WeeklyReport>;
  getDataHealth(windowDays?: number): Promise<DataHealth>;
  startHistoryBackfill(fromDate: string, maxChunks?: number): Promise<CoverageLedger>;
  getCoverageLedger(): Promise<CoverageLedger>;
  resetCoverageLedger(): Promise<CoverageLedger>;
  retryFailedBackfillChunks(): Promise<CoverageLedger>;
  setTrayLocale(locale: string): Promise<void>;
  listBackups(): Promise<BackupManifest[]>;
  createManualBackup(): Promise<BackupManifest>;
  verifyBackup(backupId: string): Promise<BackupVerification>;
  setBackupPinned(backupId: string, pinned: boolean): Promise<BackupManifest>;
  getRestorePreview(backupId: string): Promise<RestorePreview>;
  stageRestore(backupId: string): Promise<PendingRestore>;
  getPendingRestore(): Promise<PendingRestore | null>;
  cancelPendingRestore(): Promise<void>;
  runDatabaseIntegrityCheck(): Promise<IntegrityCheckResult>;
  /** `note` 是用户自己写的一句说明；后端会脱敏并截断，空白等同于没填。 */
  /** 把存量原始报文压缩掉，返回压缩前后的字节数。耗时随库大小增长。 */
  compactRawPayloads(): Promise<RawPayloadCompaction>;
  submitDiagnosticReport(note?: string, category?: string): Promise<FeedbackSubmissionResult>;
  submitDeviceModelAssignment(note?: string): Promise<FeedbackSubmissionResult>;
  getExportJson(selection: ExportSelection): Promise<string>;
  saveJsonExport(selection: ExportSelection, path: string): Promise<ExportResult>;
  saveCsvExport(selection: ExportSelection, path: string): Promise<ExportResult>;
  saveGpxExport(selection: ExportSelection, path: string): Promise<ExportResult>;
  /** FIT 一次运动一个文件，所以收的是目录而不是文件路径。 */
  saveFitExport(selection: ExportSelection, directory: string): Promise<ExportResult>;
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
