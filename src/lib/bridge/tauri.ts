import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { DesktopUnavailableError } from './errors';
import type {
  AiTask,
  AiTaskAttachmentStat,
  AiTaskPrepareOptions,
  AiTaskPrepareResult,
  AiTaskPreview,
  AiTaskSummary,
  AiTaskTemplate,
  BridgeBackend,
  UnlistenFn,
} from './types';
import type {
  HourlySteps,
  LifeEvent,
  PlanDraftPreview,
  PlanPublishResult,
  TrainingPlanState,
  DailyHeartRateExtreme,
  Page,
  AppStatus,
  AiHandoffResult,
  CapabilityOverview,
  CapabilityProbe,
  DeviceProfile,
  DeviceProfilesResult,
  FeedbackSubmissionResult,
  ExportResult,
  ExportSelection,
  HealthOverview,
  HeartRateZoneOptions,
  HeartRateZonePreference,
  LoginStatus,
  OfficialStatus,
  MetricSeries,
  BackupManifest,
  BackupVerification,
  CoverageLedger,
  DataHealth,
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
  StressPoint,
  SyncReport,
  TrainingBalancePoint,
  UserPrefs,
  Workout,
  WorkoutSeries,
} from '../../types';

type UnknownRecord = Record<string, unknown>;

/** 是否跑在 Tauri 里。整个 bridge 只有这一份判断（`index.ts` 的 isDesktop 就是它）。 */
export const isTauriRuntime = (): boolean => {
  if (typeof window === 'undefined') return false;
  const host = window as Window & {
    __TAURI_INTERNALS__?: unknown;
    __TAURI__?: unknown;
  };
  return Boolean(host.__TAURI_INTERNALS__ || host.__TAURI__);
};

/* 后端就绪门。

   `AppState::new`（含大库迁移前的整库快照）跑在 `app-init` 工作线程上，
   事件循环先把窗口画出来——页面到达时后端可能还没就绪，那时发出去的命令
   拿不到 `AppState`，会以「state not managed」一类的错直接失败。

   先注册 `app://ready` 监听，注册完再问一次 `app_is_ready`：后端是「先立旗
   再广播」，所以要么这一问看到旗，要么之后收到事件，没有漏掉的缝隙，也不用
   轮询 IPC。就绪以后 `ready` 置真，之后的命令直接 invoke，不再排队等 promise。

   60 秒兜底只防死等，**不放行**：以前超时就把 `ready` 置真、撤掉监听，大库恢复 /
   迁移超过一分钟时，之后每个命令都撞上英文的「state not managed」，而且再也等不到
   就绪——不重启不恢复。现在超时只让排着的命令带一个有码的「还在准备」错误返回，
   门继续开着等 `app://ready`；真就绪时 `backendLate()` 为真，外壳据此让各页重读。 */
let ready = false;
let late = false;
let backendReady: Promise<void> | null = null;
const READY_WAIT_MS = 60_000;

/** 就绪来得比兜底晚：期间有命令以「还在准备」失败过，页面需要重读。 */
export const backendLate = (): boolean => late;

// message 只是占位：toUserMessage 按 code 取当前语言的说法（i18n/errors.ts）。
const startingError = () => ({ code: 'err.app.starting', message: 'backend starting' });

export const whenBackendReady = (): Promise<void> => {
  if (ready || !isTauriRuntime()) return Promise.resolve();
  if (backendReady) return backendReady;
  backendReady = new Promise<void>((resolve) => {
    let unlisten: UnlistenFn | null = null;
    const finish = () => {
      if (ready) return;
      ready = true;
      resolve();
      // 退订失败不影响放行，放在 resolve 之后。
      try { unlisten?.(); } catch { /* ignore */ }
    };
    void listen('app://ready', finish)
      .then((stop) => {
        if (ready) { try { stop(); } catch { /* ignore */ } }
        else unlisten = stop;
      })
      // 监听注册失败也不要紧：下面这一问和 60 秒兜底都还在。
      .catch(() => undefined)
      .then(() => invoke<boolean>('app_is_ready'))
      .then((isReady) => { if (isReady) finish(); })
      .catch(() => undefined);
  });
  return backendReady;
};

/* 后端还没把 AppState 挂上时 Tauri 回的是这句英文。它不是用户能看懂的错，换成有码的。 */
const isStateNotManaged = (error: unknown): boolean => /state not managed/i.test(String(error));

const call = <T>(command: string, args?: UnknownRecord): Promise<T> => {
  if (ready) return invoke<T>(command, args);
  if (!isTauriRuntime()) return Promise.reject(new DesktopUnavailableError());
  return new Promise<T>((resolve, reject) => {
    const timer = window.setTimeout(() => {
      late = true;
      reject(startingError());
    }, READY_WAIT_MS);
    void whenBackendReady().then(() => {
      window.clearTimeout(timer);
      invoke<T>(command, args).then(resolve, (error: unknown) => {
        reject(isStateNotManaged(error) ? startingError() : error);
      });
    });
  });
};

export const tauriBackend: BridgeBackend = {
  listLifeEvents(start, end) { return call<LifeEvent[]>('list_life_events', { start: start ?? null, end: end ?? null }); },
  saveLifeEvent(input) { return call<number>('save_life_event', { input }); },
  deleteLifeEvent(id) { return call<void>('delete_life_event', { id }); },
  readClipboardText() { return call<string>('plugin:clipboard-manager|read_text'); },
  aiTaskDayStrip(daysBefore, end) { return call('ai_task_day_strip', { daysBefore, end }); },
  aiExchangeList(limit = 30) { return call('ai_exchange_list', { limit }); },
  aiProfileSave(note) { return call('ai_profile_save', { note }); },
  trainingPlanAdherence(from, to) { return call('training_plan_adherence', { from, to }); },
  trainingPlanUpdateDraft(id, document) { return call('training_plan_update_draft', { id, document }); },
  trainingPlanState() { return call<TrainingPlanState>('training_plan_state'); },
  trainingPlanSaveDraft(document, pasted) { return call<string>('training_plan_save_draft', { document, pasted }); },
  trainingPlanPreview(id) { return call<PlanDraftPreview>('training_plan_preview', { id }); },
  trainingPlanDiscard(id) { return call<boolean>('training_plan_discard', { id }); },
  trainingPlanSetAiPublish(allowed) { return call<boolean>('training_plan_set_ai_publish', { allowed }); },
  trainingPlanPublish(action, confirmClear, locale) {
    return call<PlanPublishResult>('training_plan_publish', { action, confirmClear, locale: locale ?? null });
  },
  getAppStatus() {
    return call<AppStatus>('get_app_status');
  },

  verifyAuth() {
    return call<AppStatus>('verify_auth');
  },

  clearAuth() {
    return call<AppStatus>('clear_auth');
  },


  manualAuth(appToken: string, userId: string, regionHost: string) {
    return call<AppStatus>('manual_auth', { appToken, userId, regionHost });
  },

  startWebLogin(locale: string) {
    return call<LoginStatus>('start_web_login', { locale });
  },

  cancelWebLogin() {
    return call<LoginStatus>('cancel_web_login');
  },

  startOfficialLogin() {
    return call<OfficialStatus>('start_official_login');
  },

  cancelOfficialLogin() {
    return call<OfficialStatus>('cancel_official_login');
  },

  getOfficialStatus() {
    return call<OfficialStatus>('get_official_status');
  },

  disconnectOfficial() {
    return call<OfficialStatus>('disconnect_official');
  },

  getLoginStatus() {
    return call<LoginStatus>('get_login_status');
  },

  startHistorySync(days: number) {
    return call<SyncReport>('start_history_sync', { days });
  },

  startIncrementalSync(quick = false) {
    return call<SyncReport>('start_incremental_sync', { quick });
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

  /** 全天压力曲线。默认 24 小时，和心率那条同一个口径。 */
  getStressSeries(hours = 24) {
    return call<StressPoint[]>('get_stress_series', { hours });
  },

  /** 按天的原始心率极值 + 样本数。见 `DailyHeartRateExtreme` 的说明。 */
  getDailyHeartRateExtremes(days: number) {
    return call<DailyHeartRateExtreme[]>('get_daily_heart_rate_extremes', { days });
  },

  getMetricSeries(metrics: string[], days: number) {
    return call<MetricSeries[]>('get_metric_series', { metrics, days });
  },

  getHourlySteps(start: string, end: string) {
    return call<HourlySteps[]>('get_hourly_steps', { start, end });
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

  saveFitExport(selection: ExportSelection, directory: string) {
    return call<ExportResult>('save_fit_export', { selection, directory });
  },

  prepareAiHandoff(selection: ExportSelection, prompt: string, includePreciseRoute = false) {
    return call<AiHandoffResult>('prepare_ai_handoff', {
      selection,
      prompt,
      includePreciseRoute,
    });
  },

  /* ---------- Beta1 分析任务（契约见 types.ts 同名单元） ---------- */

  aiTaskList() {
    return call<AiTaskSummary[]>('ai_task_list');
  },
  aiTaskGet(id: string) {
    return call<AiTask>('ai_task_get', { id });
  },
  aiTaskSave(task: AiTask) {
    return call<AiTask>('ai_task_save', { task });
  },
  aiTaskDelete(id: string) {
    return call<void>('ai_task_delete', { id });
  },
  aiTaskSetPinned(id: string, pinned: boolean) {
    return call<void>('ai_task_set_pinned', { id, pinned });
  },
  aiTemplateList() {
    return call<AiTaskTemplate[]>('ai_template_list');
  },
  aiTemplateSave(template: AiTaskTemplate) {
    return call<AiTaskTemplate>('ai_template_save', { template });
  },
  aiTemplateDelete(id: string) {
    return call<void>('ai_template_delete', { id });
  },
  aiTaskPreview(task: AiTask, tokenBudget?: number | null) {
    return call<AiTaskPreview>('ai_task_preview', { task, tokenBudget: tokenBudget ?? null });
  },
  aiTaskPrepare(task: AiTask, coverageNote: string, directionText?: string | null, options?: AiTaskPrepareOptions) {
    return call<AiTaskPrepareResult>('ai_task_prepare', { task, coverageNote, directionText: directionText || null, options: options ?? null });
  },
  aiTaskAttachmentStat(paths: string[]) {
    return call<AiTaskAttachmentStat[]>('ai_task_attachment_stat', { paths });
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
