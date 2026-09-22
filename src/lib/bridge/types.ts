import type {
  LifeEvent, LifeEventInput,
  AppStatus,
  DailyHeartRateExtreme,
  Page,
  AiHandoffResult,
  CapabilityOverview,
  CapabilityProbe,
  ExportEstimate,
  ExportResult,
  ExportSelection,
  HealthOverview,
  HeartRatePoint,
  StressPoint,
  HeartRateZoneOptions,
  HeartRateZonePreference,
  LoginStatus,
  MetricSeries,
  BackupManifest,
  BackupVerification,
  CoverageLedger,
  DataHealth,
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

/* ---------- Beta1 分析任务（A7 P1–P3） ----------
 *
 * 新 `ai_task*` 类型两侧一律 snake_case（A7 命名裁决）：与 `ExportResult`/
 * `Workout` 保持一致，Rust 侧 serde 默认即可，不用 rename。
 *
 * `AiTaskAttachmentRef.path` 只用于本机（stat、重新选择）；任何导出 JSON 或
 * MCP 输出只许出现 `AiTaskAttachmentPublicRef` 那三个字段。
 */
export type AiTaskCategory =
  | 'workout'
  | 'sleep'
  | 'recovery'
  | 'heart_rate'
  | 'training'
  | 'body'
  | 'personal_note'
  | 'attachment';

export type AiTaskDetailLevel = 'summary' | 'standard' | 'detailed';

export interface AiTaskCategoryRange {
  category: AiTaskCategory;
  enabled: boolean;
  /** 默认 14；每次运动独立按其开始日回溯。 */
  days_before: number;
  /** 默认 true；false 时窗口右端是运动开始日的前一日。 */
  include_workout_day: boolean;
}

/** 存储形态：带本机绝对路径。绝不出现在导出/MCP 输出里。 */
export interface AiTaskAttachmentRef {
  id: string;
  path: string;
  display_name: string;
  kind: 'pdf' | 'image';
  /** 添加时的字节数基线；预览/准备时拿来判定 `changed`。 */
  byte_len: number | null;
  added_at: string;
}

/** 公开形态：唯一能离开本机的附件描述。 */
export interface AiTaskAttachmentPublicRef {
  display_name: string;
  kind: 'pdf' | 'image';
  byte_len: number | null;
}

export interface AiTask {
  schema_version: 1;
  /** 空串 = 尚未保存的草稿，后端在 `ai_task_save` 时分配。 */
  id: string;
  title: string;
  template_id: string | null;
  /** 1..N，允许为空（尚未选择）。 */
  workout_ids: string[];
  categories: AiTaskCategoryRange[];
  detail_level: AiTaskDetailLevel;
  /** 用户可编辑；模板只提供初稿。 */
  prompt: string;
  personal_note: string;
  attachments: AiTaskAttachmentRef[];
  /** 默认 false：精确 GPS 坐标不进数据包，除非用户显式打开。 */
  include_precise_gps: boolean;
  /** 默认 false；true = 开放给任务限定范围的 MCP。 */
  mcp_shared: boolean;
  /** RFC3339，后端写。 */
  created_at: string;
  updated_at: string;
}

export interface AiTaskTemplate {
  schema_version: 1;
  id: string;
  builtin: boolean;
  name: string;
  /** 内置模板用 `ui.ai_template.<id>.name` 取界面语言的名字。 */
  name_code: string | null;
  categories: AiTaskCategoryRange[];
  detail_level: AiTaskDetailLevel;
  prompt_template: string;
  /** 内置模板的提示词初稿按 `ui.ai_template.<id>.prompt` 取本地化文本。 */
  prompt_code: string | null;
  default_summaries: string[];
  required_series: string[];
  created_at: string;
  updated_at: string;
}

/** `ai_task_list` 的轻量行：不带载荷。 */
export interface AiTaskSummary {
  id: string;
  title: string;
  template_id: string | null;
  workout_count: number;
  updated_at: string;
  mcp_shared: boolean;
}

/** `ai_task_preview` 的运动摘要行；字段与 Rust `AiTaskWorkoutBrief` 一一对应。 */
export interface AiTaskWorkoutBrief {
  workout_id: string;
  /** `effective_type`：用户改过的名字优先于归一化类型。 */
  workout_type: string;
  /** RFC3339 UTC。 */
  start_time: string;
  end_time: string;
  /** 本地开始日——窗口锚点。 */
  start_date: string;
  distance_meters: number | null;
  calories: number | null;
  avg_hr: number | null;
  max_hr: number | null;
}

/* ---------- 预览 / 准备结果（A7 P2） ---------- */

export interface AiTaskCoverage {
  category: AiTaskCategory;
  /** null = 与运动无关的全局窗口。 */
  workout_id: string | null;
  start_date: string;
  end_date: string;
  days_in_range: number;
  days_with_data: number;
  sources: string[];
  /** 指标 → 单位。 */
  units: Record<string, string>;
  missing: boolean;
}

export type AiTaskAttachmentState = 'ok' | 'missing' | 'changed';

export interface AiTaskAttachmentStatus {
  id: string;
  status: AiTaskAttachmentState;
  byte_len: number | null;
}

/** `ai_task_attachment_stat` 的单文件结果：exists/byte_len/mtime 都如实回传。 */
export interface AiTaskAttachmentStat {
  path: string;
  exists: boolean;
  byte_len: number | null;
  mtime: string | null;
}

/**
 * `warnings` / `blocked` 的元素：状态不是异常，所以码走 `ui.ai_task.*`
 * （A7 定稿），`message` 是后端中文原文兜底——界面先按 `code` 取文案。
 */
export interface AiTaskIssue {
  code: string;
  message: string;
  params?: Record<string, unknown> | null;
}

export interface AiTaskPreview {
  task_id: string;
  workouts: AiTaskWorkoutBrief[];
  coverage: AiTaskCoverage[];
  attachments: AiTaskAttachmentStatus[];
  estimated_bytes: number;
  warnings: AiTaskIssue[];
}

export interface AiTaskPrepareResult {
  status: 'ready' | 'blocked';
  task_id: string;
  /** 固定为 `data_dir/exports/ai-tasks/<task_id>/`。 */
  output_dir: string;
  json_path: string | null;
  prompt_path: string | null;
  /** 完整提示词全文（模板/用户提示词 + 覆盖说明段），供剪贴板复制。 */
  prompt_text: string;
  byte_len: number;
  attachments: AiTaskAttachmentStatus[];
  /** 非空即 `status='blocked'`：附件缺失等必须先处理。 */
  blocked: AiTaskIssue[];
}

export interface BridgeBackend {
  listLifeEvents(start?: string, end?: string): Promise<LifeEvent[]>;
  saveLifeEvent(input: LifeEventInput): Promise<number>;
  deleteLifeEvent(id: number): Promise<void>;
  getAppStatus(): Promise<AppStatus>;
  verifyAuth(): Promise<AppStatus>;
  clearAuth(): Promise<AppStatus>;
  importFromHar(harPath: string): Promise<AppStatus>;
  manualAuth(appToken: string, userId: string, regionHost: string): Promise<AppStatus>;

  /** 登录窗标题跟随界面语言，后端认十种界面语言标记（认不出回落英文）。 */
  startWebLogin(locale: string): Promise<LoginStatus>;
  cancelWebLogin(): Promise<LoginStatus>;
  getLoginStatus(): Promise<LoginStatus>;

  startHistorySync(days: number): Promise<SyncReport>;
  startIncrementalSync(): Promise<SyncReport>;
  cancelSync(): Promise<void>;
  probeDataCapabilities(): Promise<CapabilityProbe[]>;
  getCapabilityOverview(): Promise<CapabilityOverview>;

  getHealthOverview(): Promise<HealthOverview>;
  getHeartRateSeries(hours?: number): Promise<HeartRatePoint[]>;
  getStressSeries(hours?: number): Promise<StressPoint[]>;
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
  setDeviceModelOverride(deviceKey: string, catalogId: string | null): Promise<void>;
  getLocalApiStatus(): Promise<LocalApiStatus>;
  setLocalApiEnabled(enabled: boolean): Promise<LocalApiStatus>;
  revealLocalApiToken(): Promise<string>;
  rotateLocalApiToken(): Promise<string>;
  getDeviceProfile(query?: { deviceId?: string; sourceScope?: string }): Promise<DeviceProfile>;
  getDeviceProfiles(refresh?: boolean): Promise<DeviceProfilesResult>;

  reprocessLocalData(): Promise<ReprocessResult>;
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
  estimateExport(selection: ExportSelection): Promise<ExportEstimate>;
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

  /* ---------- Beta1 分析任务命令（A7 P3；Rust 侧 `commands/ai_tasks.rs`） ---------- */

  aiTaskList(): Promise<AiTaskSummary[]>;
  aiTaskGet(id: string): Promise<AiTask>;
  /** 后端填 id/created_at/updated_at；`mcp_shared` 开关也走这里。 */
  aiTaskSave(task: AiTask): Promise<AiTask>;
  /** 只删任务记录，不删任何附件原件。 */
  aiTaskDelete(id: string): Promise<void>;
  aiTemplateList(): Promise<AiTaskTemplate[]>;
  aiTemplateSave(template: AiTaskTemplate): Promise<AiTaskTemplate>;
  aiTemplateDelete(id: string): Promise<void>;
  /** 收完整 task 对象：未保存的草稿也能预览。 */
  aiTaskPreview(task: AiTask): Promise<AiTaskPreview>;
  /**
   * `coverageNote` 是前端按界面语言提供的「数据范围与缺失说明」段开头文本
   * （码 `ui.ai_task.prompt.coverage_note`）；后端不产界面文案。
   */
  aiTaskPrepare(task: AiTask, coverageNote: string): Promise<AiTaskPrepareResult>;
  aiTaskAttachmentStat(paths: string[]): Promise<AiTaskAttachmentStat[]>;

  cleanupOldData(days: number): Promise<Record<string, unknown>>;
  openDataFolder(): Promise<void>;

  listen<T>(event: string, handler: (payload: T) => void): Promise<UnlistenFn>;
}
