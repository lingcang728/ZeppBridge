import { reactive } from 'vue';
import bundledNotes from '../../docs/releases/3.0.1.md?raw';
import { FALLBACK_APP_VERSION } from '../lib/appVersion';

export interface UpdateReceipt {
  from: string;
  version: string;
  notes: string;
}

const KEY = 'zeppbridge.update.receipt';
const VERSION_KEY = 'zeppbridge.update.lastLaunchedVersion';
const BUNDLED_VERSION = '3.0.1';
export const updateNotice = reactive<{ receipt: UpdateReceipt | null }>({ receipt: null });

/** Run before mounting: the onboarding flag must describe the previous installation. */
export function prepareUpdateNotice(): void {
  try {
    const storage = window.localStorage;
    const previous = storage.getItem(VERSION_KEY);
    const legacyInstall = previous === null && storage.getItem('zeppbridge.tour.firstLaunch') === '1';
    // 3.0.0 predates receipts. Existing onboarding state proves prior use, but not a precise version.
    if (FALLBACK_APP_VERSION === BUNDLED_VERSION && (legacyInstall
      || (previous && /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(previous) && previous !== BUNDLED_VERSION))) {
      if (!storage.getItem(KEY)) rememberUpdate({ from: legacyInstall ? '' : previous!, version: BUNDLED_VERSION, notes: bundledNotes });
    }
    storage.setItem(VERSION_KEY, FALLBACK_APP_VERSION);
  } catch { /* Storage is optional; a fresh installation never gets upgrade notes. */ }
}

/** Authored bilingual release notes use the reader's language; other languages fall back to English. */
export function notesForLocale(notes: string, language: string): string {
  const match = /^## 中文\r?\n([\s\S]*?)^## English\r?\n([\s\S]*)/m.exec(notes);
  return match ? (language === 'zh' ? match[1]! : match[2]!).trim() : notes;
}

/** Save before the updater exits the process. A failed or cancelled update never qualifies. */
export function rememberUpdate(receipt: UpdateReceipt): void {
  try { window.localStorage.setItem(KEY, JSON.stringify(receipt)); } catch { /* Updating still works without storage. */ }
}

/** Only the installed target version may display this receipt, including when offline. */
export function restoreUpdateNotice(currentVersion: string): void {
  try {
    const receipt = JSON.parse(window.localStorage.getItem(KEY) ?? 'null') as UpdateReceipt | null;
    if (receipt && typeof receipt.from === 'string' && typeof receipt.notes === 'string'
      && receipt.version === currentVersion && receipt.from !== currentVersion) {
      updateNotice.receipt = receipt;
    }
  } catch { /* Missing or damaged storage must not interrupt launch. */ }
}

export function acknowledgeUpdate(): void {
  try { window.localStorage.removeItem(KEY); } catch { /* Close for this session. */ }
  updateNotice.receipt = null;
}

export const releaseUrl = (version: string): string =>
  `https://github.com/lingcang728/ZeppBridge/releases/tag/${encodeURIComponent(`v${version}`)}`;

export type NoteKind = 'added' | 'improved' | 'fixed' | 'note';
export interface NoteRow { text: string; kind: NoteKind; heading: boolean }

/** Release text stays text: never execute HTML or links supplied by an update manifest. */
export function releaseRows(notes: string): NoteRow[] {
  return notes.split(/\r?\n/).map(line => line.trim()).filter(Boolean).map(line => {
    const heading = /^#{1,6}\s/.test(line);
    let text = line.replace(/^#{1,6}\s+/, '').replace(/^[-*+]\s+/, '');
    const match = /^(新增|新功能|Added|New|改进|优化|Improved|Changed|修复|Fixed|Fix)\s*[:：]\s*/i.exec(text);
    let kind: NoteKind = 'note';
    if (match) {
      kind = /^(新增|新功能|Added|New)$/i.test(match[1]!) ? 'added'
        : /^(修复|Fixed|Fix)$/i.test(match[1]!) ? 'fixed' : 'improved';
      text = text.slice(match[0].length);
    }
    return { text, kind, heading };
  });
}
