import type { SourceScope } from './status';

/* 概览、睡眠、按天指标序列与分页等健康数据形状。从 types/index.ts 按领域拆出，形状不变。 */

export interface HeartRatePoint {
  timestamp: string;
  value: number;
}

/** 全天压力曲线上的一个读数。五分钟一个点，来自 `all_day_stress`。 */
export interface StressPoint {
  timestamp: string;
  value: number;
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
  deep_minutes?: number | null;
  light_minutes?: number | null;
  rem_minutes?: number | null;
  awake_minutes?: number | null;
  /** Times woken during the night (`wc`). Distinct from awake_minutes. */
  wake_count?: number | null;
  source_scope: SourceScope;
  device_id?: string;
  synced_at?: string | null;
  time_in_bed_minutes?: number | null;
  stages?: SleepStageSlice[];
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
  acute_7d: number | null;
  acute_days_with_data: number;
  chronic_28d: number | null;
  chronic_days_with_data: number;
  /** Absent unless both windows are complete and chronic load is positive. */
  acute_chronic_ratio?: number | null;
}

/**
 * 一页记录 + 本机总条数。
 *
 * 总数是分页的另一半：没有它，界面只能说「显示了 500 条」，说不出
 * 「共 2317 条」——而用户问的恰恰是「剩下的呢」（Reddit p6zxyo7）。
 */
export interface Page<T> {
  items: T[];
  total: number;
}

/**
 * 某一天原始心率样本的极值和样本数。
 *
 * Zepp App 显示的日最高心率是过滤过的；这里给的是本机原始样本的按日 max，
 * 不做过滤。`samples` 必须一起用：一天只有十几个样本时，那个「最高」只是
 * 这十几个点里的最高，把它当成完整最大值展示就是在编造事实。
 */
/** 某个本地日里某一小时的步数（Zepp 官方授权才有）。 */
export interface HourlySteps {
  /** 本地日历日 YYYY-MM-DD。 */
  date: string;
  /** 本地时间 0–23 点。 */
  hour: number;
  steps: number;
}

export interface DailyHeartRateExtreme {
  /** 本地时区的日期，`YYYY-MM-DD`。 */
  date: string;
  max: number;
  min: number;
  average: number;
  samples: number;
}
