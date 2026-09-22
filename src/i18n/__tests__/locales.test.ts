import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  defineMessages,
  ensureLocalePack,
  localePackLoaded,
  messagesOf,
  pickLocale,
  plural,
  registerLocalePack,
  setLocale,
  useMessages,
} from '../index';
import { errorTextFor } from '../errors';
import { uiTextFor } from '../backendText';

/**
 * 语言注册表 / 检测 / 复数 / 语言包合并的覆盖。
 * vitest 跑在 node 环境：没有 window/navigator/localStorage——
 * detectLocale 的用例靠 stubGlobal + 动态重导入拿一份全新模块。
 */

const STORAGE_KEY = 'zeppbridge-locale';

const importFresh = async (saved: string | null, languages: string[]) => {
  vi.resetModules();
  const store = new Map<string, string>();
  if (saved !== null) store.set(STORAGE_KEY, saved);
  vi.stubGlobal('window', {
    localStorage: {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => void store.set(key, value),
    },
    navigator: { languages, language: languages[0] ?? '' },
  });
  const mod = await import('../index');
  vi.unstubAllGlobals();
  return mod;
};

describe('pickLocale：navigator.languages 逐条匹配', () => {
  it('精确地区码优先', () => {
    expect(pickLocale(['pt-BR'])).toBe('pt-BR');
    expect(pickLocale(['pt-PT'])).toBe('pt-PT');
    expect(pickLocale(['hi-IN'])).toBe('hi-IN');
    expect(pickLocale(['zh-CN'])).toBe('zh');
  });

  it('地区变体落回基础语言', () => {
    expect(pickLocale(['de-AT'])).toBe('de');
    expect(pickLocale(['de-CH'])).toBe('de');
    expect(pickLocale(['zh-TW'])).toBe('zh');
    expect(pickLocale(['en-GB'])).toBe('en');
    expect(pickLocale(['fr-CA'])).toBe('fr');
    expect(pickLocale(['es-MX'])).toBe('es');
    expect(pickLocale(['nl-BE'])).toBe('nl');
    expect(pickLocale(['ru-RU'])).toBe('ru');
    expect(pickLocale(['hi'])).toBe('hi-IN');
  });

  it('裸 pt 与未列出的葡语地区 → 欧洲葡语', () => {
    expect(pickLocale(['pt'])).toBe('pt-PT');
    expect(pickLocale(['pt-AO'])).toBe('pt-PT');
    expect(pickLocale(['pt-MZ'])).toBe('pt-PT');
  });

  it('依序取第一条能匹配的', () => {
    expect(pickLocale(['xx-YY', 'de-DE'])).toBe('de');
    expect(pickLocale(['ja-JP', 'fr-FR', 'de-DE'])).toBe('fr');
  });

  it('都不认识 → en', () => {
    expect(pickLocale(['ja-JP'])).toBe('en');
    expect(pickLocale([])).toBe('en');
    expect(pickLocale([''])).toBe('en');
  });
});

describe('detectLocale', () => {
  it('记住的选择优先于系统语言', async () => {
    const m = await importFresh('de', ['fr-FR']);
    expect(m.locale.value).toBe('de');
  });

  it('没存过 → 走 navigator.languages', async () => {
    const m = await importFresh(null, ['pt-BR', 'en-US']);
    expect(m.locale.value).toBe('pt-BR');
  });

  it('存了非法值当没存过', async () => {
    const m = await importFresh('xx', ['ru-RU']);
    expect(m.locale.value).toBe('ru');
  });

  it('没有 window（SSR/测试环境）→ zh 兜底', async () => {
    vi.resetModules();
    vi.stubGlobal('window', undefined);
    const m = await import('../index');
    vi.unstubAllGlobals();
    expect(m.locale.value).toBe('zh');
  });
});

describe('plural：Intl.PluralRules 按语言分桶', () => {
  afterEach(() => setLocale('en'));

  it('俄语 one/few/many/other 四桶', () => {
    setLocale('ru');
    const forms = { one: '1', few: 'f', many: 'm', other: 'o' } as const;
    expect(plural(1, forms)).toBe('1');
    expect(plural(21, forms)).toBe('1');
    expect(plural(3, forms)).toBe('f');
    expect(plural(5, forms)).toBe('m');
    expect(plural(0, forms)).toBe('m');
    expect(plural(1.5, forms)).toBe('o');
  });

  it('印地语 one/other 两桶（0 和 1 都算 one）', () => {
    setLocale('hi-IN');
    const forms = { one: 'एक', other: 'कई' } as const;
    expect(plural(0, forms)).toBe('एक');
    expect(plural(1, forms)).toBe('एक');
    expect(plural(2, forms)).toBe('कई');
  });

  it('英语 one/other；缺的桶回落 other', () => {
    setLocale('en');
    expect(plural(1, { one: 'a', other: 'b' })).toBe('a');
    expect(plural(2, { one: 'a', other: 'b' })).toBe('b');
    // 不给 few：就算规则产出 few 也该落 other。
    setLocale('ru');
    expect(plural(3, { one: 'a', other: 'b' })).toBe('b');
  });
});

describe('语言包合并：pack → en → zh', () => {
  const bundle = defineMessages(
    { hello: '你好', bye: '再见', nested: { deep: '深处' }, line: (n: number) => `${n} 条` },
    { hello: 'Hello', bye: 'Bye', nested: { deep: 'Deep' }, line: (n: number) => `${n} rows` },
    undefined,
    'test/pack-merge',
  );
  const unbound = defineMessages(
    { hello: '你好' },
    { hello: 'Hello' },
  );

  afterEach(() => setLocale('en'));

  it('注入的 pack 覆盖命中键，缺的回落 en；未绑定模块永远内联', () => {
    registerLocalePack('de', {
      modules: {
        'test/pack-merge': {
          hello: 'Hallo',
          nested: { deep: 'Tief' },
        },
      },
    });
    setLocale('de');
    const t = messagesOf(bundle);
    expect(t.hello).toBe('Hallo');
    expect(t.bye).toBe('Bye');          // pack 缺 → en
    expect(t.nested.deep).toBe('Tief');
    expect(t.line(3)).toBe('3 rows');   // 函数叶缺 → en
    expect(messagesOf(unbound).hello).toBe('Hello');
  });

  it('语言包到达前回落 en，到达后重算', async () => {
    setLocale('fr');
    // fr 的真实 locales/fr.ts 是空注册表：全部键回落 en。
    await ensureLocalePack('fr');
    expect(localePackLoaded('fr')).toBe(true);
    expect(messagesOf(bundle).hello).toBe('Hello');
    registerLocalePack('fr', { modules: { 'test/pack-merge': { hello: 'Bonjour' } } });
    expect(messagesOf(bundle).hello).toBe('Bonjour');
  });

  it('errors: 节覆盖 err.* 码，缺的码回落 en', () => {
    const enNetwork = (setLocale('en'), errorTextFor('err.core.network'));
    registerLocalePack('nl', { errors: { 'err.core.network': 'Netwerk niet bereikbaar' } });
    setLocale('nl');
    expect(errorTextFor('err.core.network')).toBe('Netwerk niet bereikbaar');
    expect(errorTextFor('err.core.auth')).toBe(
      (setLocale('en'), errorTextFor('err.core.auth')),
    );
    expect(enNetwork).toBeTruthy();
    setLocale('nl');
  });

  it('backendText: 节经 uiTextFor 兜底，未知码 undefined', () => {
    registerLocalePack('nl', { backendText: { 'ui.estimate.x': 'NL-tekst' } });
    setLocale('nl');
    expect(uiTextFor('ui.estimate.x')).toBe('NL-tekst');
    expect(uiTextFor('ui.estimate.unknown')).toBeUndefined();
    expect(uiTextFor(null)).toBeUndefined();
  });

  it('内联三语路径不受语言包影响', () => {
    setLocale('zh');
    expect(messagesOf(bundle).hello).toBe('你好');
    setLocale('es');
    // 这个测试 bundle 没给 es：mergeOver 让 es 回落 en。
    expect(messagesOf(bundle).hello).toBe('Hello');
  });

  it('useMessages 返回的 computed 随切换重算', () => {
    const t = useMessages(bundle);
    setLocale('de');
    expect(t.value.hello).toBe('Hallo');
    setLocale('en');
    expect(t.value.hello).toBe('Hello');
  });
});
