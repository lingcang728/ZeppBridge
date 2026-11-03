import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  LOCALES,
  PACK_LOCALES,
  LOCALE_LABELS,
  pickLocale,
  setLocale,
  ensureLocalePack,
  localePackLoaded,
  intlLocale,
  initializeLocale,
  locale,
  plural,
  defineMessages,
  messagesOf,
  registerLocalePack,
} from '../index';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('Polish desktop locale', () => {
  it('registers Polski and recognizes regional and browser preference tags', () => {
    expect(LOCALES.filter((value) => value === 'pl')).toHaveLength(1);
    expect(PACK_LOCALES).toContain('pl');
    expect(LOCALE_LABELS.pl).toBe('Polski');
    for (const tag of ['pl', 'pl-PL', 'pl_PL', 'PL-pl', 'pl-PL-u-nu-latn']) {
      expect(pickLocale([tag])).toBe('pl');
    }
    expect(pickLocale(['xx', 'pl-PL', 'en-US'])).toBe('pl');
  });

  it('loads the real pack and persists the choice across initialization', async () => {
    const store = new Map<string, string>();
    const document = { documentElement: { lang: '' } };
    vi.stubGlobal('window', {
      navigator: { languages: ['en-US'] },
      localStorage: {
        getItem: (key: string) => store.get(key) ?? null,
        setItem: (key: string, value: string) => store.set(key, value),
      },
    });
    vi.stubGlobal('document', document);
    setLocale('pl');
    await ensureLocalePack('pl');
    expect(localePackLoaded('pl')).toBe(true);
    expect(document.documentElement.lang).toBe('pl');
    expect(store.get('zeppbridge-locale')).toBe('pl');
    expect(intlLocale()).toBe('pl-PL');

    await initializeLocale();
    expect(locale.value).toBe('pl');
    expect(localePackLoaded('pl')).toBe(true);
  });

  it('uses Polish plural rules, dates and decimal separators', () => {
    setLocale('pl');
    const forms = { one: 'one', few: 'few', many: 'many', other: 'other' };
    for (const [count, form] of [
      [1, 'one'],
      [2, 'few'],
      [5, 'many'],
      [12, 'many'],
      [22, 'few'],
      [21, 'many'],
      [1.5, 'other'],
    ] as const) {
      expect(plural(count, forms)).toBe(form);
    }
    expect(new Intl.NumberFormat(intlLocale()).format(12.5)).toBe('12,5');
    expect(
      new Intl.DateTimeFormat(intlLocale(), { month: 'long', timeZone: 'UTC' }).format(
        new Date('2026-10-17T12:00:00Z'),
      ),
    ).toBe('październik');
  });

  it('falls back to English for missing keys and accepts translated overlays', async () => {
    const bundle = defineMessages(
      { title: '标题', missing: '缺失' },
      { title: 'Title', missing: 'Missing' },
      {},
      'test/polish-overlay',
    );
    setLocale('pl');
    await ensureLocalePack('pl');
    expect(messagesOf(bundle).missing).toBe('Missing');
    registerLocalePack('pl', { modules: { 'test/polish-overlay': { title: 'Tytuł' } } });
    expect(messagesOf(bundle)).toEqual({ title: 'Tytuł', missing: 'Missing' });
  });
});
