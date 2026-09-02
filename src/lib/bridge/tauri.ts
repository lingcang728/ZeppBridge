import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { DesktopUnavailableError } from './errors';
import type { BridgeBackend, UnlistenFn } from './types';
import type {
  DailyHeartRateExtreme,
  Page,
  AppStatus,
  AiHandoffResult,
  AuthInfo,
  CapabilityOverview,
  CapabilityProbe,
  DeviceProfile,
  DeviceProfilesResult,
  DiagnosticReport,
  FeedbackSubmissionResult,
  ExportResult,
  ExportSelection,
  HealthOverview,
  HeartRateZoneOptions,
  HeartRateZonePreference,
  LoginStatus,
  MetricSeries,
  BackupManifest,
  BackupVerification,
  CoverageLedger,
  DataHealth,
  DeviceCatalogOption,
  PendingRestore,
  RawPayloadCompaction,
  RestorePreview,
  WeeklyReport,
  WorkoutInsight,
  IntegrityCheckResult,
  LocalApiStatus,
  SportOption,
  WorkoutCodeLabel,
  ReprocessResult,
  SleepSession,
  SyncReport,
  TrainingBalancePoint,
  UserPrefs,
  Workout,
  WorkoutSeries,
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

  importFromHar(harPath: string) {
    return call<AppStatus>('import_from_har', { harPath });
  },

  manualAuth(appToken: string, userId: string, regionHost: string) {
    return call<AppStatus>('manual_auth', { appToken, userId, regionHost });
  },

  startWebLogin(locale: 'zh' | 'en') {
    return call<LoginStatus>('start_web_login', { locale });
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

  probeDataCapabilities() {
    return call<CapabilityProbe[]>('probe_data_capabilities');
  },

  getCapabilityOverview() {
    return call<CapabilityOverview>('get_capability_overview');
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

  /** 按天的原始心率极值 + 样本数。见 `DailyHeartRateExtreme` 的说明。 */
  getDailyHeartRateExtremes(days: number) {
    return call<DailyHeartRateExtreme[]>('get_daily_heart_rate_extremes', { days });
  },

  getMetricSeries(metrics: string[], days: number) {
    return call<MetricSeries[]>('get_metric_series', { metrics, days });
  },

  getTrainingBalance(days: number) {
    return call<TrainingBalancePoint[]>('get_training_balance', { days });
  },

  getHeartRateZones(days: number) {
    return call<HeartRateZoneOptions>('get_heart_rate_zones', { days });
  },

  setHeartRateZonePreference(preference: HeartRateZonePreference, days: number) {
    // Every slot is nullable on purpose: clearing the choice has to survive a
    // round trip, because "not decided yet" is a state the picker returns to.
    return call<HeartRateZoneOptions>('set_heart_rate_zone_preference', {
      model: preference.model ?? null,
      maxBasis: preference.maxBasis ?? null,
      restingBasis: preference.restingBasis ?? null,
      thresholdBasis: preference.thresholdBasis ?? null,
      days,
    });
  },

  getStorageEstimate(days: number) {
    return call('get_storage_estimate', { days });
  },

  setUserPrefs(retentionDays: number, historySyncDays: number, archiveEnabled?: boolean) {
    return call<UserPrefs>('set_user_prefs', { retentionDays, historySyncDays, archiveEnabled });
  },

  getUserPrefs() {
    return call<UserPrefs>('get_user_prefs');
  },

  getRecentSleep(limit = 500) {
    return call<SleepSession[]>('get_recent_sleep', { limit });
  },

  /** 一页睡眠记录 + 本机总条数。单页上限 500，`offset` 不设上限。 */
  getSleepPage(limit: number, offset: number) {
    return call<Page<SleepSession>>('get_sleep_page', { limit, offset });
  },

  getSleepDetail(sleepId: string) {
    return call<SleepSession | null>('get_sleep_detail', { sleepId });
  },

  getRecentWorkouts(limit = 500) {
    return call<Workout[]>('get_recent_workouts', { limit });
  },

  /** 一页运动记录 + 本机总条数。 */
  getWorkoutPage(limit: number, offset: number) {
    return call<Page<Workout>>('get_workout_page', { limit, offset });
  },

  getWorkoutDetail(workoutId: string) {
    return call<Workout | null>('get_workout_detail', { workoutId });
  },

  getWorkoutSeries(workoutId: string) {
    return call<WorkoutSeries>('get_workout_series', { workoutId });
  },

  setWorkoutTypeOverride(workoutId: string, userOverride?: string | null) {
    return call<Workout>('set_workout_type_override', {
      workoutId,
      userOverride: userOverride || null,
    });
  },

  getWorkoutTypeOptions() {
    return call<SportOption[]>('get_workout_type_options');
  },
  getUnknownWorkoutCodes() {
    return call<WorkoutCodeLabel[]>('get_unknown_workout_codes');
  },
  setWorkoutCodeLabel(zeppType: number, label: string | null) {
    return call<WorkoutCodeLabel[]>('set_workout_code_label', { zeppType, label });
  },
  getDeviceCatalogOptions() {
    return call<DeviceCatalogOption[]>('get_device_catalog_options');
  },
  setDeviceModelOverride(deviceKey: string, catalogId: string | null) {
    return call<void>('set_device_model_override', { deviceKey, catalogId });
  },
  getLocalApiStatus() {
    return call<LocalApiStatus>('get_local_api_status');
  },
  setLocalApiEnabled(enabled: boolean) {
    return call<LocalApiStatus>('set_local_api_enabled', { enabled });
  },
  revealLocalApiToken() {
    return call<string>('reveal_local_api_token');
  },
  rotateLocalApiToken() {
    return call<string>('rotate_local_api_token');
  },

  getDeviceProfile(query?: { deviceId?: string; sourceScope?: string }) {
    return call<DeviceProfile>('get_device_profile', {
      deviceId: query?.deviceId,
      sourceScope: query?.sourceScope,
    });
  },

  getDeviceProfiles(refresh = false) {
    return call<DeviceProfilesResult>('get_device_profiles', { refresh });
  },

  reprocessLocalData() {
    return call<ReprocessResult>('reprocess_local_data');
  },

  getDiagnosticReport() {
    return call<DiagnosticReport>('get_diagnostic_report');
  },

  getWorkoutInsight(workoutId: string) {
    return call<WorkoutInsight>('get_workout_insight', { workoutId });
  },
  getWeeklyReport() {
    return call<WeeklyReport>('get_weekly_report');
  },
  startHistoryBackfill(fromDate: string, maxChunks?: number) {
    return call<CoverageLedger>('start_history_backfill', { fromDate, maxChunks });
  },
  getCoverageLedger() {
    return call<CoverageLedger>('get_coverage_ledger');
  },
  resetCoverageLedger() {
    return call<CoverageLedger>('reset_coverage_ledger');
  },
  retryFailedBackfillChunks() {
    return call<CoverageLedger>('retry_failed_backfill_chunks');
  },
  setTrayLocale(locale: string) {
    return call<void>('set_tray_locale', { locale });
  },
  listBackups() {
    return call<BackupManifest[]>('list_backups');
  },
  createManualBackup() {
    return call<BackupManifest>('create_manual_backup');
  },
  verifyBackup(backupId: string) {
    return call<BackupVerification>('verify_backup', { backupId });
  },
  setBackupPinned(backupId: string, pinned: boolean) {
    return call<BackupManifest>('set_backup_pinned', { backupId, pinned });
  },
  getRestorePreview(backupId: string) {
    return call<RestorePreview>('get_restore_preview', { backupId });
  },
  stageRestore(backupId: string) {
    return call<PendingRestore>('stage_restore', { backupId });
  },
  getPendingRestore() {
    return call<PendingRestore | null>('get_pending_restore');
  },
  cancelPendingRestore() {
    return call<void>('cancel_pending_restore');
  },
  getDataHealth(windowDays?: number) {
    return call<DataHealth>('get_data_health', { windowDays });
  },
  runDatabaseIntegrityCheck() {
    return call<IntegrityCheckResult>('run_database_integrity_check');
  },
  compactRawPayloads() {
    return call<RawPayloadCompaction>('compact_raw_payloads');
  },
  submitDiagnosticReport(note?: string, category?: string) {
    return call<FeedbackSubmissionResult>('submit_diagnostic_report', {
      note: note ?? null,
      category: category ?? null,
    });
  },
  submitDeviceModelAssignment(note?: string) {
    return call<FeedbackSubmissionResult>('submit_device_model_assignment', { note: note ?? null });
  },

  getExportJson(selection: ExportSelection) {
    return call<string>('get_export_json', { selection });
  },

  saveJsonExport(selection: ExportSelection, path: string) {
    return call<ExportResult>('save_json_export', { selection, path });
  },

  saveCsvExport(selection: ExportSelection, path: string) {
    return call<ExportResult>('save_csv_export', { selection, path });
  },

  saveGpxExport(selection: ExportSelection, path: string) {
    return call<ExportResult>('save_gpx_export', { selection, path });
  },

  saveFitExport(selection: ExportSelection, directory: string) {
    return call<ExportResult>('save_fit_export', { selection, directory });
  },

  publishAiExport(selection: ExportSelection) {
    return call<ExportResult>('publish_ai_export', { selection });
  },

  prepareAiHandoff(selection: ExportSelection, prompt: string, includePreciseRoute = false) {
    return call<AiHandoffResult>('prepare_ai_handoff', {
      selection,
      prompt,
      includePreciseRoute,
    });
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
