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
  /** 附图在本机的文件名（寄到之前）。旧状态文件没有这个键。 */
  attachments?: string[];
}

export interface SentLetterReply {
  reply_id: string;
  local_id: string;
  letter_version: string;
  text: string;
  also_hit: string[];
  sent_at: string;
  /** 作者的一对一回复（3.1.1 起）：从回执并进本机留着，服务端删了回执也还在。 */
  author_reply?: string | null;
  author_reply_at?: string | null;
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
  authorReply?: string | null;
  authorReplyAt?: string | null;
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
  /** 写给作者的信附上的脱敏诊断报告编号（submitDiagnosticReport 返回的）。没附就不给。 */
  reportId?: string;
  /** 附图：界面压缩好的 JPEG（base64，不带 data: 前缀），最多 3 张。没有就不给。 */
  attachments?: string[];
  /** 附上这次运动的结构样本：只给运动编号，样本由后端按脱敏规则现做。没附就不给。 */
  sampleWorkoutId?: string;
}

/** 一次运动的结构样本（后端 `letters::structure_sample`）：`json` 就是随信寄出的那份，其余给预览用。 */
export interface StructureSample {
  workout_id: string;
  /** 真实开始时间：只用来标出是哪一次，不在样本里。 */
  start_time: string;
  workout_type: string;
  json: string;
  bytes: number;
  parts: string[];
  dropped_fields: string[];
  masked_values: number;
  shifted_times: number;
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

/** 来信提醒要看的状态（后端 insight::letters::MailStatus）。看没看过由界面自己记。 */
export interface DataLetterMailStatus {
  latest_weekly_id: number | null;
  due_capsule_ids: number[];
}

export interface DataLettersView {
  letters: DataLetter[];
  on_this_day: OnThisDayYear[];
}
