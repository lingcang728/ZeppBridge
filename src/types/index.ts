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
}

export interface StorageEstimate {
  free_bytes: number;
  estimated_add_bytes: number;
  database_bytes: number;
  allow_long_history: boolean;
  warn_tight_space: boolean;
  message: string;
}

export interface UserPrefs {
  retention_days: number;
  history_sync_days: number;
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
  message: string;
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
  running: boolean;
  base_url: string;
  workout_series_path: string;
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
export type ExportTypeGroup = '活动' | '睡眠' | '身体状态' | '训练';

export interface DeviceProfile {
  name?: string;
  canonical_name?: string;
  display_name?: string;
  catalog_id?: string;
  kind?: 'watch' | 'strap' | 'ring' | 'band' | 'scale' | 'unknown' | string;
  image_key?: string | null;
  match_status?: 'exact' | 'alias' | 'unknown';
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
  latestDate?: string | null;
  note?: string | null;
  source: 'derived' | 'probed' | string;
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

export interface ExportSelection {
  startDate: string;
  endDate: string;
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
  note?: string | null;
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
