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
