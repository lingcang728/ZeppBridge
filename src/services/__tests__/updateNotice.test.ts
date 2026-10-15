import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { acknowledgeUpdate, notesForLocale, prepareUpdateNotice, releaseRows, rememberUpdate, restoreUpdateNotice, updateNotice } from '../updateNotice';

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
  it('shows bundled notes to a legacy user only after launching the installed new version', () => {
    storage.set('zeppbridge.tour.firstLaunch', '1');
    prepareUpdateNotice();
    expect(updateNotice.receipt).toBeNull();
    restoreUpdateNotice('3.0.0');
    expect(updateNotice.receipt).toBeNull();
    restoreUpdateNotice('3.0.1');
    expect(updateNotice.receipt?.from).toBe('');
    expect(updateNotice.receipt?.notes).toContain('Italian');
    acknowledgeUpdate();
    prepareUpdateNotice();
    restoreUpdateNotice('3.0.1');
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
