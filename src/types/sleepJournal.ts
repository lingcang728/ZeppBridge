/* 睡前日志与睡醒心情。形状与 core `storage::sleep_journal` 一致；码照 Zepp 的编号存（sb "1"–"18"、sf "1"–"5"）。 */

/** Zepp sb 码：睡前做了什么。 */
export type BedtimeCode =
  | '1' | '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9'
  | '10' | '11' | '12' | '13' | '14' | '15' | '16' | '17' | '18';
/** Zepp sf 码：醒来感觉。1 没精神、2 困、3 平静、4 很好、5 难过。 */
export type WakeMood = '1' | '2' | '3' | '4' | '5';

export interface SleepJournalEntry {
  /** 醒来那天的本地日期。 */
  date: string;
  behaviors: BedtimeCode[];
  mood: WakeMood | null;
  /** zepp：从 Zepp App 拉回来的；local：在这里记的（只存本机，不写回 Zepp）。 */
  source: 'zepp' | 'local';
  updated_at: string;
}

export interface SleepJournalInput {
  date: string;
  behaviors: BedtimeCode[];
  mood: WakeMood | null;
}

/** 首页打卡问的那一晚。 */
export interface SleepJournalPrompt {
  date: string;
  sleep_id: string;
  start_time: string;
  end_time: string;
  duration_minutes: number;
  score: number | null;
}

export interface SleepFactor {
  behavior: BedtimeCode;
  nights: number;
  baseline_nights: number;
  score_delta: number | null;
  deep_minutes_delta: number | null;
  wake_count_delta: number | null;
}

export interface SleepFactors {
  journaled_nights: number;
  min_nights: number;
  factors: SleepFactor[];
}
