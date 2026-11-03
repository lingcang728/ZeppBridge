import { reactive } from 'vue';
import { FALLBACK_APP_VERSION } from '../lib/appVersion';

export interface UpdateReceipt {
  from: string;
  version: string;
  notes: string;
}

const KEY = 'zeppbridge.update.receipt';
const VERSION_KEY = 'zeppbridge.update.lastLaunchedVersion';
/** 随应用打包了更新说明的版本。发版时和下面 glob 里的目录一起改。 */
export const BUNDLED_VERSION = '3.1.0';

/*
 * 本版更新说明随应用打包，一种界面语言一个文件（docs/releases/<版本>/<locale>.md），
 * 懒加载：只在弹窗出现时取当前语言那一份。以前只拆 `## 中文 / ## English`，
 * 其余十种语言全回落英文。tests 里有门禁：当前版本十二种语言必须齐全。
 */
const BUNDLED_NOTES = import.meta.glob('../../docs/releases/3.1.0/*.md', {
  query: '?raw', import: 'default',
}) as Record<string, () => Promise<string>>;

/** 打包进来的说明有哪几种语言（门禁用）。 */
export const bundledNoteLocales = (): string[] =>
  Object.keys(BUNDLED_NOTES).map((path) => path.replace(/^.*\/([^/]+)\.md$/, '$1')).sort();

/** 本版打包的说明：先取当前界面语言，没有才回落英文；不是本版就给 null。 */
export async function loadBundledNotes(version: string, language: string): Promise<string | null> {
  if (version !== BUNDLED_VERSION) return null;
  const pick = (code: string) => BUNDLED_NOTES[`../../docs/releases/${BUNDLED_VERSION}/${code}.md`];
  const loader = pick(language) ?? pick('en');
  if (!loader) return null;
  try {
    return await loader();
  } catch {
    return null;
  }
}

/** 这一版的更新说明前面先放一页「为什么有些数据没有」（3.0.2：只连官方授权的人看到一半数据）。 */
export const leadsWithWhyHalfData = (version: string): boolean => version === '3.0.2';
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
      // 说明正文在显示时按界面语言从打包的文件里取，这里不必再带一份。
      if (!storage.getItem(KEY)) rememberUpdate({ from: legacyInstall ? '' : previous!, version: BUNDLED_VERSION, notes: '' });
    }
    storage.setItem(VERSION_KEY, FALLBACK_APP_VERSION);
  } catch { /* Storage is optional; a fresh installation never gets upgrade notes. */ }
}

/** Authored bilingual release notes use the reader's language; other languages fall back to English. */
export function notesForLocale(raw: string, language: string): string {
  // 3.1.0 的 Release 正文在更新清单后面接过一节英文信（以后不再这样做，信只走信封）；为它保留截断，不混进清单。
  const notes = raw.split(/^## A letter from the author\s*$/m)[0]!;
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

export interface NoteGroup { kind: NoteKind; items: string[] }
const GROUP_ORDER: NoteKind[] = ['added', 'improved', 'fixed', 'note'];

/** 按「新增 / 改进 / 修复 / 其他」分组，组内保持原顺序；标题行只是作者的分段，分组后不再单独显示。 */
export function groupRows(rows: NoteRow[]): NoteGroup[] {
  return GROUP_ORDER
    .map((kind) => ({ kind, items: rows.filter((row) => !row.heading && row.kind === kind).map((row) => row.text) }))
    .filter((group) => group.items.length > 0);
}

export interface NoteSegment { text: string; strong: boolean }

/** 只认 `**加粗**`，拆成文字片段交给模板渲染——更新清单里的文字永远不当 HTML。没配对的 `**` 原样保留。 */
export function emphasis(text: string): NoteSegment[] {
  const parts = text.split(/\*\*(.+?)\*\*/);
  return parts
    .map((part, index) => ({ text: part, strong: index % 2 === 1 }))
    .filter((segment) => segment.text.length > 0);
}
