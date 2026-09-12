import { afterEach, describe, expect, it, vi } from 'vitest';

afterEach(() => { vi.unstubAllGlobals(); vi.resetModules(); });

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
    const meta = { setAttribute: vi.fn() };
    const document = { documentElement: { lang: '' }, title: '', createElement: () => ({}), head: { querySelector: () => meta } };
    vi.stubGlobal('document', document);
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
    vi.stubGlobal('window', { navigator: { language: 'en' }, localStorage: { getItem: () => 'zh', setItem } });
    const { useLandingLocale } = await import('../useLandingLocale');
    const language = useLandingLocale();
    language.initializeLocale();
    expect(language.locale.value).toBe('zh');
    language.setLocale('en');
    expect(setItem).toHaveBeenCalledWith('zeppbridge-landing-locale', 'en');
  });
});
