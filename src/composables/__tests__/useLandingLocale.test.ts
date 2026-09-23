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
    expect(document.title).toContain('本地数据桥梁');
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
    expect(copy?.hero.headlineAccent).toBe('rendues en intégralité.');

    language.setLocale('fr');
    await language.ensureLandingCopy('fr');
    expect(language.locale.value).toBe('fr');
    expect(document.documentElement.lang).toBe('fr');
    expect(document.title).toBe('ZeppBridge · Pont de données local');
  });
});
