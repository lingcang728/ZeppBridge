/**
 * 首页建议卡与「按问题发牌」的后端契约（`suggestion_cards` / `card_hand_facts` / `card_hand_lines`）。
 *
 * 后端只给触发码和事实，句子由界面按语言写；发牌规则在 `lib/cards/hands/`。
 */

/** 一张建议卡。`key` 是「这一次」的身份：关掉以后同一个 key 不再出。 */
export type Suggestion =
  | {
    code: 'workout_done';
    key: string;
    workout_id: string;
    workout_type: string;
    start_time: string;
    distance_m: number | null;
    duration_s: number;
    /** 同类最近几次，新 → 旧，不含这一次。 */
    same_type_ids: string[];
  }
  | {
    code: 'sleep_poor';
    key: string;
    /** 醒来那天（本地日）。 */
    night: string;
    duration_min: number;
    baseline_duration_min: number;
    deep_min: number | null;
    baseline_deep_min: number | null;
    short: boolean;
    deep_low: boolean;
    baseline_nights: number;
  }
  | {
    code: 'long_idle';
    key: string;
    days: number;
    last_workout_id: string;
    last_workout_type: string;
    last_date: string;
  };

export type SuggestionCode = Suggestion['code'];

export interface HandWorkout {
  workout_id: string;
  workout_type: string;
  start_time: string;
  /** 本地日。 */
  date: string;
  distance_m: number | null;
  duration_s: number;
  avg_hr: number | null;
  training_load: number | null;
  /** 比赛记录里挂了这一次。 */
  race: boolean;
  /** `[纬度, 经度]`，没有轨迹就是 null。 */
  start: [number, number] | null;
  end: [number, number] | null;
}

/** 一晚（按醒来那天）。哪一项没有就是 null，不补 0。 */
export interface HandNight {
  date: string;
  duration_min: number | null;
  deep_min: number | null;
  hrv: number | null;
  resting_hr: number | null;
}

export interface HandFacts {
  today: string;
  /** 旧 → 新。 */
  workouts: HandWorkout[];
  /** 旧 → 新。 */
  nights: HandNight[];
}

export interface HandLines {
  workout_id: string;
  route: Array<[number, number]>;
  hr: number[];
}
