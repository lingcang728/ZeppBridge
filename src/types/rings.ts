/** 年轮年度回顾（后端 `storage/rings.rs`，字段 snake_case）。缺的数据是 null，不是 0。 */
import type { RecordKey } from './logbook';

export interface RingStar {
  workout_id: string;
  /** 本地日期 YYYY-MM-DD。 */
  date: string;
  kind: string;
  is_run: boolean;
  distance_m: number | null;
  duration_s: number | null;
}

export interface RingHighlight {
  workout_id: string;
  date: string;
  kind: string;
  distance_m: number | null;
  duration_s: number | null;
}

export interface RingRace {
  name: string;
  date: string;
  result_seconds: number;
}


export interface RingYear {
  year: number;
  in_progress: boolean;
  data_days: number;
  workouts: number;
  active_days: number;
  duration_s: number;
  distance_m: number;
  runs: number;
  run_distance_m: number;
  /** 53 格，每周运动分钟数；那周一天数据都没有是 null。 */
  weeks: (number | null)[];
  busiest_month: number | null;
  busiest_month_workouts: number;
  longest_run: RingHighlight | null;
  longest_workout: RingHighlight | null;
  steps_total: number | null;
  steps_days: number;
  sleep_avg_minutes: number | null;
  sleep_nights: number;
  personal_records: RecordKey[];
  races: RingRace[];
  stars: RingStar[];
}

export interface AnnualRings {
  /** 旧的在前。 */
  years: RingYear[];
  today: string;
}
