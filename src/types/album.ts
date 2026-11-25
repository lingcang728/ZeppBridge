/* 运动 / 睡眠列表相册视图的数据（后端 storage/record_album.rs）。字段名和后端一致（snake_case）。 */

/** 一条轨迹的轮廓：长边为 1、北在上；只有形状，没有坐标。 */
export interface RouteShape {
  workout_id: string;
  width: number;
  height: number;
  points: [number, number][];
}

/** 一个本地月份的运动汇总。 */
export interface WorkoutMonth {
  /** YYYY-MM */
  month: string;
  count: number;
  distance_m: number;
  duration_s: number;
  /** 当月距离最长、带轨迹的那一条的轮廓。 */
  cover: RouteShape | null;
  cover_distance_m: number | null;
}

/** 一个本地月份的睡眠汇总。 */
export interface SleepMonth {
  month: string;
  nights: number;
  avg_duration_min: number;
  /** 平均入睡时刻：当地中午之后的分钟数。 */
  avg_onset_min: number;
  /** 入睡时刻算了几晚、这几晚入睡时刻的标准差（分钟）；年度「入睡规律」按晚合并。没有就是 null。 */
  onset_nights: number;
  onset_sd_min: number | null;
  /** 有评分的那几晚的平均评分；一晚都没有就是 null（不是 0）。 */
  avg_score: number | null;
  score_nights: number;
  deep_min: number;
  light_min: number;
  rem_min: number;
  awake_min: number;
}

export interface StageSpan { stage: string; from_min: number; to_min: number }

/** 一晚的分期条；没有分期记录时 spans 为空（只画入睡到醒来那一段）。 */
export interface SleepStrip { sleep_id: string; spans: StageSpan[] }
