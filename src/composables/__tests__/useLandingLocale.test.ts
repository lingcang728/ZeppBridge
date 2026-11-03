import { afterEach, describe, expect, it, vi } from 'vitest';

afterEach(() => { vi.unstubAllGlobals(); vi.resetModules(); });

const stubDocument = () => {
  const meta = { setAttribute: vi.fn() };
  const document = {
    documentElement: { lang: '' },
    title: '',
    createElement: () => ({ setAttribute: vi.fn() }),
    head: { querySelector: () => meta, appendChild: vi.fn() },
  };
  vi.stubGlobal('document', document);
  return document;
};

describe('landing language survives unavailable storage', () => {
  it.each(['access', 'read', 'write'])('continues when storage fails on %s', async (failure) => {
    const blocked = () => { throw new Error('Storage blocked'); };
    const storage = {
      getItem: failure === 'read' ? blocked : () => null,
      setItem: failure === 'write' ? blocked : vi.fn(),
    };
    vi.stubGlobal('window', {
      navigator: { languages: ['en-US'] },
      get localStorage() { return failure === 'access' ? blocked() : storage; },
    });
    const document = stubDocument();
    const { useLandingLocale } = await import('../useLandingLocale');
    const language = useLandingLocale();
    expect(() => language.initializeLocale()).not.toThrow();
    expect(language.locale.value).toBe('en');
    expect(document.documentElement.lang).toBe('en');
    expect(() => language.setLocale('zh')).not.toThrow();
    expect(language.locale.value).toBe('zh');
    expect(document.documentElement.lang).toBe('zh-CN');
    expect(document.title).toContain('手表记录，自己的档案');
  });

  it('still honors a saved choice', async () => {
    const setItem = vi.fn();
    vi.stubGlobal('window', { navigator: { language: 'en' }, localStorage: { getItem: () => 'nl', setItem } });
    stubDocument();
    const { useLandingLocale } = await import('../useLandingLocale');
    const language = useLandingLocale();
    language.initializeLocale();
    expect(language.locale.value).toBe('nl');
    language.setLocale('en');
    expect(setItem).toHaveBeenCalledWith('zeppbridge-landing-locale', 'en');
  });

  it('ignores a saved value that is not a landing locale', async () => {
    vi.stubGlobal('window', {
      navigator: { languages: ['de-DE'] },
      localStorage: { getItem: () => 'xx-not-a-locale', setItem: vi.fn() },
    });
    stubDocument();
    const { useLandingLocale } = await import('../useLandingLocale');
    const language = useLandingLocale();
    language.initializeLocale();
    expect(language.locale.value).toBe('de');
  });
});

describe('browser-language detection', () => {
  it.each([
    [['zh-TW'], 'zh'],
    [['zh-Hans-CN'], 'zh'],
    [['es-MX'], 'es'],
    [['nl'], 'nl'],
    [['nl-BE'], 'nl'],
    [['pt-BR'], 'pt-BR'],
    [['pt_BR'], 'pt-BR'],
    [['pt'], 'pt-PT'],
    [['pt-PT'], 'pt-PT'],
    [['de-AT'], 'de'],
    [['ru-RU'], 'ru'],
    [['hi'], 'hi-IN'],
    [['hi-IN'], 'hi-IN'],
    [['fr-FR'], 'fr'],
    [['it-IT'], 'it'],
    [['it_CH'], 'it'],
    [['pl-PL'], 'pl'],
    [['pl_PL'], 'pl'],
    [['PL'], 'pl'],
    [['ja-JP'], 'en'],
    [['ko', 'de'], 'de'],
    [[], 'en'],
  ] as const)('navigator.languages %j → %s', async (languages, expected) => {
    vi.stubGlobal('window', {
      navigator: { languages: [...languages], language: languages[0] ?? '' },
      localStorage: { getItem: () => null, setItem: vi.fn() },
    });
    stubDocument();
    const { useLandingLocale } = await import('../useLandingLocale');
    const language = useLandingLocale();
    language.initializeLocale();
    expect(language.locale.value).toBe(expected);
  });
});

describe('lazy copy packs', () => {
  it('loads Polish metadata and remembers Polski across page initialization', async () => {
    const store = new Map<string, string>();
    vi.stubGlobal('window', {
      navigator: { languages: ['pl-PL'] },
      localStorage: {
        getItem: (key: string) => store.get(key) ?? null,
        setItem: (key: string, value: string) => store.set(key, value),
      },
    });
    const document = stubDocument();
    const mod = await import('../useLandingLocale');
    const language = mod.useLandingLocale();
    const pack = (await import('../../views/landing/pl')).default;
    expect(mod.LOCALE_LABELS.pl).toBe('Polski');
    language.initializeLocale();
    await language.ensureLandingCopy('pl');
    expect(language.locale.value).toBe('pl');
    expect(language.landingCopyFor('pl')).toEqual(pack.copy);
    expect(language.localeLoadError.value).toBeNull();
    expect(document.title).toBe(pack.meta.title);
    expect(document.documentElement.lang).toBe('pl');
    language.setLocale('en');
    language.setLocale('pl');
    expect(store.get('zeppbridge-landing-locale')).toBe('pl');
    vi.resetModules();
    const restarted = (await import('../useLandingLocale')).useLandingLocale();
    restarted.initializeLocale();
    expect(restarted.locale.value).toBe('pl');
  });

  it('loads Italian copy and metadata and retains the selected language', async () => {
    const setItem = vi.fn();
    vi.stubGlobal('window', {
      navigator: { languages: ['it-CH'] },
      localStorage: { getItem: () => null, setItem },
    });
    const document = stubDocument();
    const language = (await import('../useLandingLocale')).useLandingLocale();
    language.initializeLocale();
    await language.ensureLandingCopy('it');
    expect(language.locale.value).toBe('it');
    expect(language.landingCopyFor('it')?.nav.language).toBe('Lingua');
    expect(document.title).toContain('Il tuo archivio personale');
    expect(document.documentElement.lang).toBe('it');
    language.setLocale('en');
    language.setLocale('it');
    expect(setItem).toHaveBeenLastCalledWith('zeppbridge-landing-locale', 'it');
  });

  it('keeps zh/en inline and only loads other languages on demand', async () => {
    vi.stubGlobal('window', {
      navigator: { languages: ['en-US'] },
      localStorage: { getItem: () => null, setItem: vi.fn() },
    });
    const document = stubDocument();
    const { useLandingLocale } = await import('../useLandingLocale');
    const language = useLandingLocale();
    language.initializeLocale();
    // zh/en are inlined: nothing to load, nothing exposed through the pack slot.
    expect(language.landingCopyFor('zh')).toBeUndefined();
    expect(language.landingCopyFor('en')).toBeUndefined();
    expect(language.landingCopyFor('fr')).toBeUndefined();

    await language.ensureLandingCopy('fr');
    const copy = language.landingCopyFor('fr');
    expect(copy?.nav.language).toBe('Langue');
    expect(copy?.rebuild.title[1]).toBe('Sur votre ordinateur.');
    expect(copy?.rebuild.stories).toHaveLength(7);

    language.setLocale('fr');
    await language.ensureLandingCopy('fr');
    expect(language.locale.value).toBe('fr');
    expect(document.documentElement.lang).toBe('fr');
    // 这三条 fr 字符串是「语言包真的加载了」的证据，跟着 landing/fr.ts 走：
    // 那边改了 nav.language / titleAccent / meta.title 就要同步改这里。
    expect(document.title).toBe('ZeppBridge · Votre montre enregistre. Vos propres archives.');
  });
});
