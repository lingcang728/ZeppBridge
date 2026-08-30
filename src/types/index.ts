export interface AuthInfo {
  appToken: string;
  userId: string;
  regionHost: string;
}

export type SourceScope = 'user_fused' | 'device' | 'unknown' | string;

export interface StreamStatus {
  stream: string;
  status: string;
  records?: number;
  last_sync?: string;
  last_cloud_sync_at?: string;
  newest_sample_at?: string;
  message?: string;
  needs_reauth?: boolean;
}

export interface CapabilityStatus {
  capability: string;
  available: boolean;
  reason?: string;
}

export interface AppStatus {
  configured: boolean;
  auth_state: string;
  connection_state: 'unconfigured' | 'configured' | 'connected' | 'needs_reauth' | string;
  masked_user_id?: string;
  region_host?: string;
  last_sync?: string;
  last_cloud_sync_at?: string;
  last_cloud_sync_outcome?: SyncOutcome;
  streams: StreamStatus[];
  capabilities: CapabilityStatus[];
  database_path?: string;
  retention_days: number;
  history_sync_days?: number;
  storage?: StorageEstimate;
  /** 后台是否正在压缩历史报文。事件可能在前端监听之前就发出去了，所以状态里也要有。 */
  compacting?: boolean;
}

/** 单条流的占用估算。样本不足时 measured 为 false，且不给速率。 */
export interface StreamStorageEstimate {
  stream: string;
  observed_days: number;
  observed_bytes: number;
  bytes_per_day: number;
  measured: boolean;
  estimated_add_bytes: number;
}

export interface RawPayloadCompaction {
  compacted: number;
  skipped: number;
  bytesBefore: number;
  bytesAfter: number;
}

export interface StorageEstimate {
  free_bytes: number;
  estimated_add_bytes: number;
  database_bytes: number;
  allow_long_history: boolean;
  warn_tight_space: boolean;
  message: string;
  requested_days: number;
  streams: StreamStorageEstimate[];
  /** 六条流全部有足够本机样本时才为真。为假时总数只是粗略参考。 */
  measured: boolean;
  /** 非 null 表示空间不足，补拉不会开始。 */
  stop_reason: string | null;
}

export interface UserPrefs {
  retention_days: number;
  /** 历史补拉往回覆盖多少天。和保留期解耦，上限 3650。 */
  history_sync_days: number;
  /** 长期归档：开启后成功同步不再自动清理历史。 */
  archive_enabled: boolean;
}

export interface HeartRatePoint {
  timestamp: string;
  value: number;
}

export interface DailyPoint {
  date: string;
  value: number;
}

export interface SyncProgress {
  stream: string;
  current: number;
  total: number;
  /** 后端的中文原文。界面优先用 `code` 自己写句子，这一份是兜底。 */
  message: string;
  /** `syncing` / `backfilling`。后端不按 locale 出文案，所以它发码。 */
  code?: string;
  /** 补拉时这一块是哪个月（`YYYY-MM`）。 */
  detail?: string | null;
}

export type LoginState = 'idle' | 'waiting' | 'extracting' | 'verifying' | 'connected' | 'failed';

export interface LoginStatus {
  state: LoginState | string;
  message: string;
  page_url: string;
}

export interface SyncStreamResult {
  stream: string;
  status: string;
  records_written: number;
  message?: string;
  needs_reauth?: boolean;
  last_cloud_sync_at?: string;
  newest_sample_at?: string;
}

/**
 * `deferred` is not a failure: the library is replaying its stored raw
 * payloads after a normalizer upgrade and the sync stood aside rather than
 * fight it for the write lock. Nothing was lost and the caller retries.
 */
export type SyncOutcome =
  | 'updated'
  | 'no_new_data'
  | 'partial'
  | 'failed'
  | 'cancelled'
  | 'deferred';

export interface SyncReport {
  success: boolean;
  outcome: SyncOutcome;
  started_at: string;
  finished_at: string;
  last_cloud_sync_at: string;
  total_records: number;
  streams: SyncStreamResult[];
  message?: string;
}

export interface Coverage {
  start?: string;
  end?: string;
  days?: number;
  streams?: number;
}

export interface HealthOverview {
  current_hr?: number;
  resting_hr?: number;
  hrv?: number;
  last_sleep_score?: number;
  readiness?: number;
  bio_charge?: number;
  hybrid_charge?: number;
  training_load?: number;
  vo2max?: number;
  steps_today?: number;
  steps_goal?: number;
  training_load_scale?: number;
  active_calories_today?: number;
  latest_heart_rate_at?: string;
  last_updated?: string;
  coverage?: Coverage;
  source_scope?: SourceScope;
}

export type SleepStageName = 'deep' | 'light' | 'rem' | 'awake' | string;

export interface SleepStageSlice {
  stage: SleepStageName;
  start_time: string;
  end_time: string;
}

export interface SleepSession {
  sleep_id: string;
  start_time: string;
  end_time: string;
  score?: number;
  duration_minutes: number;
  deep_minutes: number;
  light_minutes: number;
  rem_minutes?: number | null;
  awake_minutes: number;
  /** Times woken during the night (`wc`). Distinct from awake_minutes. */
  wake_count?: number | null;
  source_scope: SourceScope;
  device_id?: string;
  synced_at?: string | null;
  time_in_bed_minutes?: number | null;
  stages?: SleepStageSlice[];
}

export interface Workout {
  workout_id: string;
  /** Backwards-compatible normalized type. */
  workout_type: string;
  normalized_type: string;
  type_source: 'numeric_mapped' | 'unknown_code' | 'string_field' | 'missing' | string;
  user_override?: string | null;
  effective_type: string;
  /** 用户给这个 Zepp 编号起的名字；目录已经认识的编号永远为空。 */
  custom_label?: string | null;
  zepp_type?: number | null;
  start_time: string;
  end_time: string;
  distance_meters?: number;
  calories?: number;
  avg_hr?: number;
  max_hr?: number;
  training_load?: number;
  vo2max?: number;
  gps_available?: boolean;
  sample_count?: number;
  source_scope: SourceScope;
  device_id?: string;
  synced_at?: string | null;
}

/* ---------- 归档、补拉与备份 ---------- */

/** 一条流的历史覆盖。「请求过」「拿到了」「写进去了」是三件事。 */
export interface StreamCoverage {
  stream: string;
  requested_chunks: number;
  persisted_chunks: number;
  /** 请求过、云端明确没有数据的月份数。这不是失败。 */
  empty_chunks: number;
  failed_chunks: number;
  pending_chunks: number;
  persisted_from: string | null;
  persisted_to: string | null;
  empty_months: string[];
  records: number;
}

export interface CoverageLedger {
  requested_from: string | null;
  requested_to: string | null;
  streams: StreamCoverage[];
  total_chunks: number;
  completed_chunks: number;
  /** 只有每一块都有结论时才为真。「完整副本」这句话只有在这里为真时才成立。 */
  complete: boolean;
}

export type BackupKind = 'manual' | 'pre_migration' | 'pre_restore';

export interface BackupCoverage {
  earliest_sample_at: string | null;
  latest_sample_at: string | null;
  last_cloud_sync_at: string | null;
}

export interface BackupManifest {
  id: string;
  created_at: string;
  app_version: string;
  schema_version: number;
  normalizer_revision: string;
  kind: BackupKind;
  coverage: BackupCoverage;
  table_counts: Record<string, number>;
  bytes: number;
  sha256: string;
  integrity_ok: boolean;
  pinned: boolean;
}

export interface BackupVerification {
  id: string;
  file_present: boolean;
  bytes_match: boolean;
  sha256_match: boolean;
  integrity_ok: boolean;
  problem: string | null;
}

export type RestoreCompatibility =
  | 'same_schema'
  | 'older_schema_will_migrate'
  | 'future_schema_refused';

export interface RestorePreview {
  manifest: BackupManifest;
  verification: BackupVerification;
  compatibility: RestoreCompatibility;
  current_schema_version: number;
  current_table_counts: Record<string, number>;
  can_restore: boolean;
  blocker: string | null;
}

export interface PendingRestore {
  backup_id: string;
  staged_at: string;
  rollback_backup_id: string;
}

/* ---------- 确定性洞察 ---------- */

/** 和个人基线的比较。方向是事实；好坏由界面按指标含义决定。 */
export interface InsightComparison {
  baseline_value: number;
  delta: number;
  delta_percent: number;
  direction: 'higher' | 'lower' | 'same' | string;
}

export interface BaselineWindow {
  kind: 'comparable_runs' | 'previous_days' | string;
  days: number;
  min_samples: number;
  max_samples: number;
  distance_tolerance_percent?: number | null;
}

export type InsightConfidence = 'high' | 'medium' | 'low' | 'insufficient';

/** 一条事实和它的依据。`value` 为 null 表示本地没有这项数据，不是 0。 */
export interface InsightFact {
  fact_id: string;
  metric: string;
  value: number | null;
  unit: string;
  comparison: InsightComparison | null;
  baseline_window: BaselineWindow | null;
  evidence_count: number;
  source: string;
  confidence: InsightConfidence;
  reason: string | null;
  /** 说明的稳定码，界面按它加上 baseline_window / baseline_count 自己写句子。 */
  reason_code?: string | null;
  /** 基线里实际找到多少个样本。和 evidence_count 不是一回事。 */
  baseline_count?: number;
  evidence_refs: string[];
}

export interface BaselineEntry {
  workout_id: string;
  start_time: string;
  distance_meters: number;
}

export interface BaselineExclusion {
  workout_id: string;
  reason: string;
}

export interface WorkoutInsight {
  workout_id: string;
  workout_type: string;
  supported: boolean;
  unsupported_reason: string | null;
  /** 目前只有 `unsupported_workout_type`。 */
  unsupported_code?: string | null;
  facts: InsightFact[];
  baseline_included: BaselineEntry[];
  baseline_excluded: BaselineExclusion[];
}

export interface WeeklyReport {
  generated_at: string;
  recent_start: string;
  recent_end: string;
  baseline_start: string;
  baseline_end: string;
  facts: InsightFact[];
}

/** 三阶段中某一阶段的状态。`never` 是「从来没走到这一步」，不是失败。 */
export interface StageState {
  state: 'ok' | 'failed' | 'never' | string;
  at?: string | null;
  last_ok_at?: string | null;
  /** 稳定的失败类别；界面按它分支，不要按文案分支。 */
  error_kind?: string | null;
  message?: string | null;
}

export interface SourceBreakdown {
  source: 'device' | 'user_fused' | 'unknown' | string;
  records: number;
}

/** 覆盖解释。`gaps` 能说缺了哪几天，`observations` 只能说哪几天观察到了。 */
export interface CoverageExplanation {
  kind: 'gaps' | 'observations' | string;
  window_days: number;
  observed_days: number;
  gap_dates: string[];
  gap_total: number;
  first_observed_at?: string | null;
  latest_observed_at?: string | null;
  note: string;
}

export interface StreamHealth {
  stream: string;
  label: string;
  cadence: 'continuous' | 'daily' | 'nightly' | 'per_event' | 'occasional' | string;
  fetch: StageState;
  parse: StageState;
  write: StageState;
  raw_records: number;
  canonical_records: number;
  last_written_records: number;
  sources: SourceBreakdown[];
  coverage: CoverageExplanation;
}

export interface IntegrityCheckResult {
  checked_at: string;
  ok: boolean;
  detail?: string | null;
}

export interface DatabaseHealth {
  schema_version: number;
  normalizer_revision: string;
  replay_in_progress: boolean;
  database_bytes: number;
  raw_records: number;
  canonical_records: number;
  pending_normalization: number;
  last_integrity_check?: IntegrityCheckResult | null;
}

/** 四个互不冒充的时间。 */
export interface HealthTimings {
  last_cloud_sync_at?: string | null;
  last_cloud_sync_outcome?: string | null;
  last_local_replay_at?: string | null;
  last_manual_reprocess_at?: string | null;
  newest_sample_at?: string | null;
}

export interface HealthAction {
  /** 执行用。两个不同的动作可能共用一个 id（都跑同步）。 */
  id: string;
  /** 显示用的稳定码；能区分「再同步一次」和「做第一次同步」。 */
  code?: string;
  /** 后端的中文原文，给 CLI 用；界面按 `code` 出文案，认不出来时才回退到它。 */
  label: string;
  reason: string;
  destructive: boolean;
}

export interface DataHealth {
  generated_at: string;
  database: DatabaseHealth;
  timings: HealthTimings;
  streams: StreamHealth[];
  occasional_metrics: StreamHealth[];
  actions: HealthAction[];
}

/** 随包运动目录里的一个可选项，纠正下拉框用它渲染。 */
export interface SportOption {
  key: string;
  label: string;
}

/** 随包设备目录里的一个型号，供用户指认自己的设备。 */
export interface DeviceCatalogOption {
  catalogId: string;
  canonicalName: string;
  nameZh?: string | null;
  kind: string;
}

/** 一个还没有名字的 Zepp 运动编号，以及它影响到的记录数。 */
export interface WorkoutCodeLabel {
  zeppType: number;
  label: string;
  records: number;
  updatedAt: string;
}

export interface DiagnosticField {
  name: string;
  jsonType: 'null' | 'boolean' | 'number' | 'string' | 'array' | 'object' | string;
}

export interface DiagnosticObjectShape {
  path: string;
  fields: DiagnosticField[];
}

export interface DiagnosticDeviceCandidate {
  catalogId: string;
  canonicalName: string;
  firmware?: string | null;
  matchStatus: 'exact' | 'alias' | 'unknown';
}

export interface DiagnosticReport {
  format: string;
  appVersion: string;
  schemaVersion: number;
  normalizerRevision: string;
  operatingSystem: string;
  deviceEvidence: {
    status: string;
    objectCount: number;
    unknownDeviceCount: number;
    idAliasObjects: number;
    serialAliasObjects: number;
    nameFieldObjects: number;
    firmwareFieldObjects: number;
    candidates: DiagnosticDeviceCandidate[];
    unmatchedProductHints: string[];
    shapes: DiagnosticObjectShape[];
  };
  unknownWorkoutCodes: Array<{ code: number; records: number }>;
  workoutTypeConflicts: number;
}

export interface FeedbackSubmissionResult {
  reportId: string;
  submittedAt: string;
}

export interface WorkoutRoutePoint {
  timestamp: string;
  latitude: number;
  longitude: number;
  altitude_m?: number | null;
}

export interface WorkoutSeriesSample {
  timestamp: string;
  heart_rate?: number | null;
  speed?: number | null;
  pace?: number | null;
  cadence?: number | null;
  stride_cm?: number | null;
  altitude_m?: number | null;
  /** Running power in watts, verified against the summary's average/max. */
  power_watts?: number | null;
  /** Ground contact time in milliseconds. */
  ground_contact_ms?: number | null;
  /** Vertical oscillation in millimetres. */
  vertical_oscillation_mm?: number | null;
  /** Vertical stride ratio in percent. */
  vertical_ratio_pct?: number | null;
  /** Grade-adjusted equivalent pace in seconds per kilometre. */
  equivalent_pace_s_per_km?: number | null;
}

export interface WorkoutPause {
  start_time: string;
  end_time: string;
  kind: string;
}

export interface WorkoutSeries {
  workout_id: string;
  samples: WorkoutSeriesSample[];
  route: WorkoutRoutePoint[];
  pauses: WorkoutPause[];
  splits: WorkoutSplitRow[];
  summary: WorkoutSeriesSummary;
}

/** One kilometre of a workout, cut from the server's cumulative distance. */
export interface WorkoutSplitRow {
  index: number;
  start_time: string;
  end_time: string;
  distance_m: number;
  duration_seconds: number;
  pace_min_per_km?: number | null;
  avg_hr?: number | null;
  max_hr?: number | null;
  elevation_gain_m?: number | null;
  elevation_loss_m?: number | null;
  /** A trailing partial kilometre, never to be read as a slow full one. */
  partial: boolean;
}

export interface WorkoutSeriesSummary {
  average_pace?: number | null;
  average_cadence?: number | null;
  max_cadence?: number | null;
  average_stride_cm?: number | null;
  elevation_gain_m?: number | null;
  elevation_loss_m?: number | null;
  average_power_watts?: number | null;
  max_power_watts?: number | null;
  average_ground_contact_ms?: number | null;
  average_vertical_oscillation_mm?: number | null;
  average_vertical_ratio_pct?: number | null;
  /** The fastest equivalent pace in the series, in seconds per kilometre. */
  best_equivalent_pace_s_per_km?: number | null;
}

export interface LocalApiStatus {
  /** 用户保存的启用意图；首次安装为 false。 */
  enabled: boolean;
  /** 端口此刻是否真的在监听，来自 controller 实时状态而非启动快照。 */
  running: boolean;
  base_url: string;
  address: string;
  workout_series_path: string;
  /** 是否已生成过访问 token。关闭状态下也可能为真。 */
  token_present: boolean;
  error?: string | null;
}

export type ExportDataType =
  | 'heart_rate'
  | 'sleep'
  | 'workouts'
  | 'steps'
  | 'spo2'
  | 'stress'
  | 'hrv'
  | 'hrv_rmssd'
  | 'respiratory_rate'
  | 'pai'
  | 'lactate_threshold'
  | 'training_load'
  | 'vo2max'
  | 'daily_activity'
  | 'recovery';

/** Which section of the export picker a data type belongs to. */
/* 分组是码，不是中文。写成中文的话界面上到处会出现 `group === '活动'`
   这种判断，一翻译就默默失效。显示交给 useExport 的分组名表。 */
export type ExportTypeGroup = 'activity' | 'sleep' | 'body' | 'training';

export interface DeviceProfile {
  name?: string;
  canonical_name?: string;
  display_name?: string;
  catalog_id?: string;
  kind?: 'watch' | 'strap' | 'ring' | 'band' | 'scale' | 'unknown' | string;
  image_key?: string | null;
  /** `user_assigned` = 用户自己指认的型号，不是识别结果。 */
  match_status?: 'exact' | 'alias' | 'user_assigned' | 'unknown';
  has_local_data?: boolean;
  last_data_at?: string | null;
  firmware?: string;
  serial?: string;
  device_id?: string;
  timezone?: string;
}

export interface DeviceCacheMetadata {
  status: 'fresh' | 'stale' | 'missing' | 'refresh_failed' | 'unavailable' | string;
  cached_at?: string | null;
  age_seconds?: number | null;
  refreshed: boolean;
  refresh_error?: string | null;
}

export interface DeviceProfilesResult {
  profiles: DeviceProfile[];
  cache: DeviceCacheMetadata;
}

/**
 * One row of the capability overview.
 *
 * `status` is not a boolean on purpose: the Zepp events endpoint answers
 * "200 with no items" for names that cannot exist, so missing data never
 * proves a device lacks a sensor. Only `unsupported` — an outright rejection —
 * licenses saying so.
 */
export interface CapabilityItem {
  stream: string;
  status: 'available' | 'no_records' | 'unsupported' | 'unknown' | string;
  records: number;
  recordsUnit: string;
  /** 单位的稳定码：`days` / `records`。界面按它出文案。 */
  recordsUnitCode?: string;
  /** 这条流的判定窗口有多少天。界面写「最近 N 天没有记录」要用它。 */
  windowDays?: number;
  latestDate?: string | null;
  note?: string | null;
  source: 'derived' | 'probed' | string;
  /** ZeppBridge 是否真的把这条流读进了本机库。云端有 ≠ 本机有。 */
  ingested?: boolean;
}

export interface CapabilityOverview {
  items: CapabilityItem[];
  probedAt?: string | null;
}

/**
 * The result of asking the server whether one candidate stream exists.
 *
 * Which Zepp event streams answer depends on the account, the devices and the
 * region, and the endpoint has no discovery call — so availability is probed,
 * not assumed. A probe reports status and field names only; no measured value
 * is read and nothing is stored.
 */
export interface CapabilityProbe {
  stream: string;
  /** Which surface answered — the same event name behaves differently on each. */
  surface: 'v2_events' | 'user_events' | 'user_events_day' | string;
  /** How often the stream is measured; decides how far back the probe looks. */
  cadence: 'continuous' | 'episodic' | string;
  windowDays: number;
  eventType: string;
  subType: string;
  status: 'available' | 'empty' | 'unavailable' | 'error';
  records: number;
  /** Newest item's calendar date — the answer for episodic metrics. */
  latestDate?: string | null;
  fields: string[];
}

/**
 * How much of each stream an export carries.
 *
 * `summary` aggregates the two streams that dominate an export's size
 * (per-minute heart rate, per-second workout series) and keeps every
 * structured metric intact, so a month of data stays small enough to hand to a
 * model. `full` keeps the raw series and is what the CSV/GPX converters use.
 */
export type ExportDetail = 'summary' | 'full';

/**
 * 一次导出覆盖什么。两个变体互斥，不是「都传了谁优先」。
 */
export type ExportScope =
  | { kind: 'dateRange'; start: string; end: string }
  | { kind: 'workout'; workoutId: string };

export interface ExportSelection {
  /** 新调用方传这个。 */
  scope?: ExportScope;
  /** 旧调用方的日期范围。和 `scope` 同时提供会被后端拒绝。 */
  startDate?: string;
  endDate?: string;
  dataTypes: ExportDataType[];
  detail?: ExportDetail;
}

export interface ExportResult {
  path: string;
  record_count: number;
  bytes: number;
  generated_at: string;
}

export type AiHandoffMode = 'inline' | 'attachment';

export interface AiHandoffMetadata {
  preciseRouteIncluded: boolean;
  authenticationFieldsRemoved: boolean;
  identityFieldsRemoved: boolean;
}

export interface AiHandoffResult {
  mode: AiHandoffMode;
  clipboardText: string;
  filePath?: string;
  bytes: number;
  records: number;
  redactions: string[];
  metadata: AiHandoffMetadata;
}

export interface ReprocessResult {
  total_records: number;
  streams: Record<string, number>;
  message: string;
}

/**
 * One day of a metric.
 *
 * `min` / `max` appear only where the data really carries a spread — a
 * companion daily metric, or the spread of that day's samples. A day with one
 * reading reports no spread rather than a zero-width one.
 */
export interface MetricSeriesPoint {
  date: string;
  value: number;
  min?: number | null;
  max?: number | null;
  samples?: number | null;
}

/** One metric over a window, with everything needed to label it honestly. */
export interface MetricSeries {
  metric: string;
  unit: string;
  source: 'daily_metrics' | 'metric_samples' | string;
  points: MetricSeriesPoint[];
  latest?: MetricSeriesPoint | null;
  average?: number | null;
  minimum?: number | null;
  maximum?: number | null;
  /** Days in the window that carry a value, so gaps can be stated, not drawn. */
  days_with_data: number;
  window_days: number;
}

export interface TrainingBalancePoint {
  date: string;
  acute_7d: number;
  acute_days_with_data: number;
  chronic_28d: number;
  chronic_days_with_data: number;
  /** Absent until the chronic window is mostly covered. */
  acute_chronic_ratio?: number | null;
}

/**
 * One measured number a zone model can stand on.
 *
 * Every entry names where it came from and when it was measured. There is
 * deliberately no 220−age estimate: this list is measurements only.
 */
export interface HeartRateBasis {
  id: string;
  kind: 'max_hr' | 'resting_hr' | 'threshold_hr' | string;
  label: string;
  value: number;
  unit: string;
  source: string;
  measuredAt?: string | null;
  /** 中文说明。界面按 `id` 自己出文案，这一份是兜底。 */
  note?: string | null;
  /** 说明里带的那个数字（本地统计静息心率用了多少天）。 */
  noteCount?: number | null;
}

export interface HeartRateZoneBand {
  zone: number;
  label: string;
  lowPercent: number;
  highPercent: number;
}

export interface HeartRateZoneModel {
  id: 'max_hr' | 'hr_reserve' | 'lactate_threshold' | string;
  label: string;
  formula: string;
  requires: string[];
  bands: HeartRateZoneBand[];
  /** False when the library holds no basis of a required kind. */
  available: boolean;
}

export interface HeartRateZoneRow {
  zone: number;
  label: string;
  minBpm: number;
  maxBpm: number;
  seconds: number;
}

/** Every field starts empty: no model is chosen on the user's behalf. */
export interface HeartRateZonePreference {
  model?: string | null;
  maxBasis?: string | null;
  restingBasis?: string | null;
  thresholdBasis?: string | null;
}

export interface HeartRateZoneReport {
  model: string;
  modelLabel: string;
  formula: string;
  bases: HeartRateBasis[];
  zones: HeartRateZoneRow[];
  belowZone1Seconds: number;
  aboveZone5Seconds: number;
  totalSeconds: number;
  windowDays: number;
  source: string;
}

export interface HeartRateZoneOptions {
  bases: HeartRateBasis[];
  models: HeartRateZoneModel[];
  preference: HeartRateZonePreference;
  /** Present only once the preference names a model and its bases. */
  report?: HeartRateZoneReport | null;
  windowDays: number;
}
