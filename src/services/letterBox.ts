/**
 * 信匣的界面一侧（批次 6）：本机的待寄出 / 已寄出 / 回执（后端 commands/letters.rs），加上回信草稿。
 *
 * - 草稿只在本机浏览器存储里（一版一份），写着写着关掉也还在；寄出后清掉。
 * - 寄信连不上时后端把它放进待寄出；应用启动一会儿后、打开信匣时补寄并取回执（`syncLetterBox`）。
 * - 回执有变化（新读了、归了类、标了哪版修）时，信匣入口亮一个点，看过就灭。
 */
import { reactive } from 'vue';
import { backend, isDesktop } from '../lib/bridge';
import type { LetterBoxView, LetterReceipt, LetterReplyInput, LetterSendResult } from '../types/letters';

export const LETTER_REPLY_MAX = 1000;
const DRAFT_KEY = (version: string) => `zeppbridge.letters.draft.${version}`;
const SEEN_KEY = 'zeppbridge.letters.receiptsSeen';

export const letterBox = reactive<{ view: LetterBoxView; loaded: boolean; unseen: boolean }>({
  view: { outbox: [], sent: [], receipts: [], receipts_checked_at: null },
  loaded: false,
  unseen: false,
});

const fingerprint = (receipts: LetterReceipt[]) => receipts
  .map((r) => [r.replyId, r.readAt ?? '', r.category ?? '', r.status ?? '', r.fixedIn ?? ''].join('|')).sort().join(';');

const apply = (view: LetterBoxView) => {
  letterBox.view = view;
  letterBox.loaded = true;
  try {
    const seen = window.localStorage.getItem(SEEN_KEY) ?? '';
    letterBox.unseen = view.receipts.length > 0 && fingerprint(view.receipts) !== seen;
  } catch { letterBox.unseen = false; }
};

/** 回执看过了：入口的点灭掉。 */
export function markReceiptsSeen(): void {
  letterBox.unseen = false;
  try { window.localStorage.setItem(SEEN_KEY, fingerprint(letterBox.view.receipts)); } catch { /* 下次还会亮，不要紧 */ }
}

export async function loadLetterBox(): Promise<void> {
  if (!isDesktop()) return;
  try { apply(await backend.lettersState()); } catch { /* 信匣读不到不影响别的 */ }
}

/** 补寄待寄出、取回执。连不上时后端原样返回本机的。 */
export async function syncLetterBox(): Promise<void> {
  if (!isDesktop()) return;
  try { apply(await backend.lettersSync()); } catch { /* 同上 */ }
}

let scheduled = false;
/** 启动后过一会儿再联网（别和启动同步抢）；只有寄过信的人才需要。 */
export function scheduleLetterBoxSync(delayMs = 25_000): void {
  if (scheduled || !isDesktop()) return;
  scheduled = true;
  window.setTimeout(async () => {
    await loadLetterBox();
    if (letterBox.view.outbox.length || letterBox.view.sent.length) await syncLetterBox();
  }, delayMs);
}

export async function sendLetterReply(input: LetterReplyInput): Promise<LetterSendResult> {
  const result = await backend.lettersSendReply(input);
  apply(result.view);
  return result;
}

export interface ReplyDraft { localId: string; text: string; allowQuote: boolean; alsoHit: string[] }

const newLocalId = () => (globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`);

export function loadDraft(version: string): ReplyDraft {
  try {
    const raw = JSON.parse(window.localStorage.getItem(DRAFT_KEY(version)) ?? 'null') as Partial<ReplyDraft> | null;
    if (raw && typeof raw.localId === 'string' && typeof raw.text === 'string') {
      return {
        localId: raw.localId,
        text: raw.text.slice(0, LETTER_REPLY_MAX),
        allowQuote: raw.allowQuote === true,
        alsoHit: Array.isArray(raw.alsoHit) ? raw.alsoHit.filter((id): id is string => typeof id === 'string') : [],
      };
    }
  } catch { /* 坏了就从空的开始 */ }
  return { localId: newLocalId(), text: '', allowQuote: false, alsoHit: [] };
}

export function saveDraft(version: string, draft: ReplyDraft): void {
  try { window.localStorage.setItem(DRAFT_KEY(version), JSON.stringify(draft)); } catch { /* 存不了就只在这次打开里 */ }
}

export function clearDraft(version: string): void {
  try { window.localStorage.removeItem(DRAFT_KEY(version)); } catch { /* 无妨 */ }
}

/** 这一版有没有寄过（含待寄出）：寄过就不再把空白回信栏当成「没写完」。 */
export const repliedTo = (version: string): boolean =>
  letterBox.view.sent.some((s) => s.letter_version === version) || letterBox.view.outbox.some((p) => p.letter_version === version);
