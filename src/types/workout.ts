import type { SourceScope } from './status';

/* 运动记录、逐点序列、圈与分段、心率区间。从 types/index.ts 按领域拆出，形状不变。 */

/**
 * 一段心率区间在本次运动里待了多久。
 *
 * 边界来自用户在手表上的设定（云端的 `heart_range`），**不是**我们自己切的。
 * 训练状态页那套自选区间模型（最大心率 / 储备心率 / 阈值）是另一回事，两者
 * 的数字对不上是正常的。
 */
export interface HeartRateZoneBucket {
  /** 0 起的区间序号。 */
  index: number;
  /** 这一段的心率上限。 */
  upper_bound_bpm: number;
  seconds: number;
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
  zepp_source?: string | null;
  start_time: string;
  end_time: string;
  distance_meters?: number;
  /** Cloud run_time in seconds; excludes pauses. */
  moving_seconds?: number | null;
  calories?: number;
  avg_hr?: number;
  max_hr?: number;
  min_hr?: number | null;
  elevation_gain_m?: number | null;
  elevation_loss_m?: number | null;
  max_altitude_m?: number | null;
  min_altitude_m?: number | null;
  training_load?: number;
  vo2max?: number;
  /** 有氧训练效果 0.0-5.0。后端一直在返回，只是这里从来没声明过。 */
  training_effect?: number | null;
  /** 无氧训练效果 0.0-5.0。 */
  anaerobic_training_effect?: number | null;
  /** 主观疲劳度，用户在表上自己选的。 */
  rpe?: number | null;
  avg_cadence_spm?: number | null;
  max_cadence_spm?: number | null;
  avg_stride_cm?: number | null;
  total_steps?: number | null;
  gps_available?: boolean;
  sample_count?: number;
  source_scope: SourceScope;
  device_id?: string;
  synced_at?: string | null;
  /** 手表自己设定的心率区间分布。空数组表示这次没有心率数据。 */
  hr_zones?: HeartRateZoneBucket[];
}

/** 随包运动目录里的一个可选项，纠正下拉框用它渲染。 */
export interface SportOption {
  key: string;
  label: string;
}

/** 一个还没有名字的 Zepp 运动编号，以及它影响到的记录数。 */
export interface WorkoutCodeLabel {
  zeppType: number;
  label: string;
  records: number;
  updatedAt: string;
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
  laps: WorkoutLapRow[];
  summary: WorkoutSeriesSummary;
  /** null / 缺省 = 没有海拔采样或距离不可信，不出爬升卡；segments 为空 = 没有明显爬升。 */
  climbs?: WorkoutClimbs | null;
}

/** 识别爬升段用的参数，「怎么算的」只读这里。 */
export interface ClimbMethod {
  smoothing_window_s: number;
  reversal_m: number;
  min_change_m: number;
  min_grade_pct: number;
  moving_speed_m_s: number;
}

export interface ClimbSegment {
  kind: 'climb' | 'descent';
  start_time: string;
  end_time: string;
  start_distance_m: number;
  end_distance_m: number;
  /** 上坡为正、下坡为负。 */
  elevation_change_m: number;
  average_grade_pct: number;
  moving_seconds: number;
  vertical_speed_m_per_h: number | null;
  average_hr: number | null;
  average_pace_min_per_km: number | null;
}

export interface WorkoutClimbs {
  method: ClimbMethod;
  segments: ClimbSegment[];
}

/** Laps recorded by the watch, separate from computed kilometre splits. */
export interface WorkoutLapRow {
  index: number;
  start_time: string;
  end_time: string;
  distance_m: number;
  duration_seconds: number;
  avg_hr: number | null;
  max_hr: number | null;
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
