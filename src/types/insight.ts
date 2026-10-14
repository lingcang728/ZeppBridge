/* 确定性洞察与本地周报。从 types/index.ts 按领域拆出，形状不变。 */

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

/**
 * 一次运动前后半程的「配速 × 心率」对比。
 *
 * 量的是每一拍心跳跑出多少米。后半程比前半程低，说明维持同样的速度要花更多
 * 心跳。这个指标很容易被路况污染，所以后端在条件不满足时给的是原因码而不是
 * 一个硬算出来的百分比。
 */
export interface HeartRateDrift {
  first_half_metres_per_beat: number;
  second_half_metres_per_beat: number;
  /** 负数表示同样的速度花了更多心跳。 */
  drift_percent: number;
  first_half_avg_hr: number;
  second_half_avg_hr: number;
  first_half_avg_speed_mps: number;
  second_half_avg_speed_mps: number;
  first_half_samples: number;
  second_half_samples: number;
  /** 速度的变异系数。读的人可以自己判断这次到底稳不稳。 */
  speed_cv: number;
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
  /** 前后半程对比。条件不满足时为 null。 */
  heart_rate_drift?: HeartRateDrift | null;
  /** `not_enough_samples` / `too_short` / `pace_too_variable` / `unsupported_workout_type`。 */
  heart_rate_drift_unavailable?: string | null;
}

export interface WeeklyReport {
  generated_at: string;
  recent_start: string;
  recent_end: string;
  baseline_start: string;
  baseline_end: string;
  facts: InsightFact[];
}
