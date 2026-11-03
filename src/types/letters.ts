/** 信匣（作者来信的回信与回执）。和后端 commands/letters.rs、core::letters 同形。 */

export interface PendingLetterReply {
  local_id: string;
  letter_version: string;
  app_version: string;
  locale: string;
  text: string;
  allow_quote: boolean;
  also_hit: string[];
  queued_at: string;
  attempts: number;
}

export interface SentLetterReply {
  reply_id: string;
  local_id: string;
  letter_version: string;
  text: string;
  also_hit: string[];
  sent_at: string;
}

/** 回执状态：下版先修 / 推迟 / 继续征集 / 已修 / 不打算做。作者在发版前标（scripts/letters/replies.mjs）。 */
export type LetterReceiptStatus = 'next' | 'later' | 'asking' | 'fixed' | 'declined';

export interface LetterReceipt {
  replyId: string;
  letterVersion: string;
  receivedAt: string;
  readAt: string | null;
  /** 上期回音里的 `#id`；界面按它查该语言的标题。 */
  category: string | null;
  status: LetterReceiptStatus | string | null;
  fixedIn: string | null;
}

export interface LetterBoxView {
  outbox: PendingLetterReply[];
  sent: SentLetterReply[];
  receipts: LetterReceipt[];
  receipts_checked_at: string | null;
}

export interface LetterSendResult {
  status: 'sent' | 'queued';
  reply_id: string | null;
  view: LetterBoxView;
}

export interface LetterReplyInput {
  localId: string;
  letterVersion: string;
  locale: string;
  text: string;
  allowQuote: boolean;
  alsoHit: string[];
}

/* 信匣里的数据来信（批次 7）：每周数据来信、时间胶囊、那年今天。 */
export interface SnapshotValue {
  metric: string;
  unit: string;
  value: number | null;
  days: number;
}

export interface LetterSnapshot {
  start: string;
  end: string;
  values: SnapshotValue[];
}

export interface DataLetter {
  id: number;
  kind: 'weekly' | 'capsule';
  written_at: string;
  open_on: string | null;
  opened_at: string | null;
  /** 胶囊没到日子：话和快照都拿不到。 */
  sealed: boolean;
  note: string | null;
  weekly: import('./insight').WeeklyReport | null;
  written_snapshot: LetterSnapshot | null;
  opened_snapshot: LetterSnapshot | null;
}

export interface OnThisDayWorkout {
  workout_id: string;
  workout_type: string;
  start_time: string;
  distance_meters: number | null;
  duration_seconds: number | null;
}

export interface OnThisDayYear {
  date: string;
  years_ago: number;
  values: SnapshotValue[];
  workouts: OnThisDayWorkout[];
}

export interface DataLettersView {
  letters: DataLetter[];
  on_this_day: OnThisDayYear[];
}
