import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  BUNDLED_VERSION, acknowledgeUpdate, bundledNoteLocales, emphasis, groupRows, leadsWithWhyHalfData, loadBundledNotes, notesForLocale,
  prepareUpdateNotice, releaseRows, rememberUpdate, restoreUpdateNotice, updateNotice,
} from '../updateNotice';
import { LOCALES } from '../../i18n';
import { FALLBACK_APP_VERSION } from '../../lib/appVersion';

describe('release notes after a successful restart', () => {
  let storage: Map<string, string>;
  const receipt = { from: '3.0.0', version: '3.0.1', notes: 'Added: A new setting' };
  beforeEach(() => {
    storage = new Map();
    updateNotice.receipt = null;
    vi.stubGlobal('window', { localStorage: {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => storage.set(key, value),
      removeItem: (key: string) => storage.delete(key),
    } });
  });
  afterEach(() => vi.unstubAllGlobals());
  it('does not show before installation, after cancellation, or on a different installed version', () => {
    rememberUpdate(receipt);
    expect(updateNotice.receipt).toBeNull();
    for (const version of ['3.0.0', '2.4.4', '3.0.2']) {
      restoreUpdateNotice(version);
      expect(updateNotice.receipt).toBeNull();
    }
  });
  it('survives restart offline and reappears until acknowledged, then stays closed', () => {
    rememberUpdate(receipt);
    restoreUpdateNotice('3.0.1');
    expect(updateNotice.receipt).toEqual(receipt);
    updateNotice.receipt = null;
    restoreUpdateNotice('3.0.1');
    expect(updateNotice.receipt).toEqual(receipt);
    acknowledgeUpdate();
    restoreUpdateNotice('3.0.1');
    expect(updateNotice.receipt).toBeNull();
  });
  it('does not introduce an update dialog on a fresh installation or a same-version rebuild', () => {
    restoreUpdateNotice('3.0.1');
    expect(updateNotice.receipt).toBeNull();
    rememberUpdate({ ...receipt, from: '3.0.1' });
    restoreUpdateNotice('3.0.1');
    expect(updateNotice.receipt).toBeNull();
  });
  it('tolerates blocked or corrupt storage', () => {
    storage.set('zeppbridge.update.receipt', '{');
    expect(() => restoreUpdateNotice('3.0.1')).not.toThrow();
    vi.stubGlobal('window', { get localStorage() { throw new Error('blocked'); } });
    expect(() => rememberUpdate(receipt)).not.toThrow();
    expect(() => restoreUpdateNotice('3.0.1')).not.toThrow();
    expect(() => acknowledgeUpdate()).not.toThrow();
  });
  it('shows bundled notes to a legacy user only after launching the installed new version', async () => {
    storage.set('zeppbridge.tour.firstLaunch', '1');
    prepareUpdateNotice();
    expect(updateNotice.receipt).toBeNull();
    restoreUpdateNotice('3.0.0');
    expect(updateNotice.receipt).toBeNull();
    restoreUpdateNotice(BUNDLED_VERSION);
    expect(updateNotice.receipt?.from).toBe('');
    // 正文不再塞进回执：显示时按界面语言从打包的文件里取。
    expect(await loadBundledNotes(BUNDLED_VERSION, 'en')).toMatch(/^- (Added|Improved|Fixed): \*\*/m);
    acknowledgeUpdate();
    prepareUpdateNotice();
    restoreUpdateNotice(BUNDLED_VERSION);
    expect(updateNotice.receipt).toBeNull();
  });
  it('never mistakes first-launch onboarding or a same-version relaunch for an upgrade', () => {
    prepareUpdateNotice();
    storage.set('zeppbridge.tour.firstLaunch', '1');
    prepareUpdateNotice();
    restoreUpdateNotice('3.0.1');
    expect(updateNotice.receipt).toBeNull();
  });
  it('preserves updater receipts and selects authored notes by interface language', () => {
    storage.set('zeppbridge.tour.firstLaunch', '1');
    rememberUpdate(receipt);
    prepareUpdateNotice();
    restoreUpdateNotice('3.0.1');
    expect(updateNotice.receipt).toEqual(receipt);
    const notes = '# v3.0.1\n\n## 中文\n修复：中文说明\n\n## English\nFixed: English notes';
    expect(notesForLocale(notes, 'zh')).toBe('修复：中文说明');
    expect(notesForLocale(notes, 'it')).toBe('Fixed: English notes');
    expect(notesForLocale('Plain notes', 'en')).toBe('Plain notes');
    expect(notesForLocale('# ZeppBridge 3.1.0\n\n- Added: **X**.\n\n## A letter from the author\n\nDear reader,\n', 'de').trim())
      .toBe('# ZeppBridge 3.1.0\n\n- Added: **X**.');
  });
  it('classifies source notes but preserves untrusted content as plain text', () => {
    expect(releaseRows('# Features\n- Added: setting\n修复：错误\n<script>bad()</script>')).toEqual([
      { text: 'Features', kind: 'note', heading: true },
      { text: 'setting', kind: 'added', heading: false },
      { text: '错误', kind: 'fixed', heading: false },
      { text: '<script>bad()</script>', kind: 'note', heading: false },
    ]);
  });
});

/*
 * 门禁：当前版本的更新说明必须十二种界面语言齐全。以前只有中英两段，其余十种语言
 * 一律看英文——发版时漏翻一种，这里就挂。
 */
describe('bundled release notes for the current version', () => {
  it('ships the notes for the version this build is', () => {
    expect(BUNDLED_VERSION).toBe(FALLBACK_APP_VERSION);
  });
  it('has one file per interface language, each with categorized lines', async () => {
    expect(bundledNoteLocales()).toEqual([...LOCALES].sort());
    for (const language of LOCALES) {
      const notes = await loadBundledNotes(BUNDLED_VERSION, language);
      expect(notes, language).toBeTruthy();
      const rows = releaseRows(notes!);
      expect(rows.length, language).toBeGreaterThan(0);
      // 每一行都带类别词：漏写的话界面上只会显示一个笼统的「更新」。
      expect(rows.filter((row) => row.kind === 'note'), language).toEqual([]);
    }
  });
  it('zh and en follow docs/releases/README.md: every line opens with one bold lead', async () => {
    for (const language of ['zh', 'en']) {
      for (const row of releaseRows((await loadBundledNotes(BUNDLED_VERSION, language))!)) {
        const segments = emphasis(row.text);
        expect(segments[0]?.strong, `${language}: ${row.text}`).toBe(true);
        expect(segments.filter((segment) => segment.strong).length, `${language}: ${row.text}`).toBe(1);
      }
    }
  });
  it('falls back to English for an unknown language and to nothing for another version', async () => {
    expect(await loadBundledNotes(BUNDLED_VERSION, 'xx')).toBe(await loadBundledNotes(BUNDLED_VERSION, 'en'));
    expect(await loadBundledNotes('2.9.9', 'zh')).toBeNull();
  });
  it('3.0.2 opens with the missing-data explanation', () => {
    expect(leadsWithWhyHalfData('3.0.2')).toBe(true);
    expect(leadsWithWhyHalfData('3.0.1')).toBe(false);
  });
});

describe('release note layout', () => {
  it('groups rows as added, improved, fixed, then anything else, keeping authored order', () => {
    const rows = releaseRows('- Fixed: a\n- Added: b\n## Section\n- Improved: c\n- Added: d\nplain');
    expect(groupRows(rows)).toEqual([
      { kind: 'added', items: ['b', 'd'] },
      { kind: 'improved', items: ['c'] },
      { kind: 'fixed', items: ['a'] },
      { kind: 'note', items: ['plain'] },
    ]);
  });
  it('only understands **bold**, and never turns text into markup', () => {
    expect(emphasis('**Lead** then <b>x</b>')).toEqual([
      { text: 'Lead', strong: true },
      { text: ' then <b>x</b>', strong: false },
    ]);
    expect(emphasis('a ** b')).toEqual([{ text: 'a ** b', strong: false }]);
  });
});
