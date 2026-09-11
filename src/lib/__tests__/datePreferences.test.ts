import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/*
 * 偏好本身没有格式规则，只有两条：记住用户的选择，以及「跟随系统」真的
 * 跟随系统（`navigator.language`），而不是英文界面写死的 en-US。
 */

type StoredWindow = {
  window?: {
    navigator: { language: string; languages: readonly string[] };
    localStorage: {
      getItem(key: string): string | null;
      setItem(key: string, value: string): void;
    };
  };
};

let values: Map<string, string>;
const originalWindow = (globalThis as StoredWindow).window;

beforeEach(() => {
  // 模块在 import 时就读取 localStorage，所以每个用例都重置模块再加载。
  vi.resetModules();
  values = new Map();
  (globalThis as StoredWindow).window = {
    navigator: { language: 'zh', languages: ['zh'] },
    localStorage: {
      getItem: (key) => values.get(key) ?? null,
      setItem: (key, value) => {
        values.set(key, value);
      },
    },
  };
});

afterEach(() => {
  if (originalWindow === undefined) delete (globalThis as StoredWindow).window;
  else (globalThis as StoredWindow).window = originalWindow;
});

const load = () => import('../datePreferences');

describe('日期/时间格式偏好', () => {
  it('默认两个都跟随系统', async () => {
    const prefs = await load();
    expect(prefs.dateFormatPreference.value).toBe('regional');
    expect(prefs.timeFormatPreference.value).toBe('regional');
  });

  it('记住的选择优先于默认值', async () => {
    values.set('zeppbridge-date-format', 'ymd');
    values.set('zeppbridge-time-format', '24h');
    const prefs = await load();
    expect(prefs.dateFormatPreference.value).toBe('ymd');
    expect(prefs.timeFormatPreference.value).toBe('24h');
  });

  it('非法存储值被忽略', async () => {
    values.set('zeppbridge-date-format', 'iso');
    values.set('zeppbridge-time-format', '13h');
    const prefs = await load();
    expect(prefs.dateFormatPreference.value).toBe('regional');
    expect(prefs.timeFormatPreference.value).toBe('regional');
  });

  it('设置后更新响应式值并写入 localStorage', async () => {
    const prefs = await load();
    prefs.setDateFormat('dmy');
    prefs.setTimeFormat('12h');
    expect(prefs.dateFormatPreference.value).toBe('dmy');
    expect(prefs.timeFormatPreference.value).toBe('12h');
    expect(values.get('zeppbridge-date-format')).toBe('dmy');
    expect(values.get('zeppbridge-time-format')).toBe('12h');
  });

  it('非法设置被拒绝', async () => {
    const prefs = await load();
    prefs.setDateFormat('iso' as never);
    prefs.setTimeFormat('13h' as never);
    expect(prefs.dateFormatPreference.value).toBe('regional');
    expect(prefs.timeFormatPreference.value).toBe('regional');
  });

  it('regionalLocale 优先 navigator.language', async () => {
    const prefs = await load();
    const own = Object.getOwnPropertyDescriptor(navigator, 'language');
    Object.defineProperty(navigator, 'language', { value: 'fr-FR', configurable: true, writable: true });
    try {
      expect(prefs.regionalLocale()).toBe('fr-FR');
    } finally {
      if (own) Object.defineProperty(navigator, 'language', own);
      else delete (navigator as unknown as { language?: string }).language;
    }
  });
});
