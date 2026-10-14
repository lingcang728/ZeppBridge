import { ref } from 'vue';
import { revealTheme, type ThemeMode, type ThemeOrigin } from '../../composables/useTheme';

/**
 * 网站首次跟随系统，之后记住访客选择。存储与应用的主题分开。
 * 和应用的主题（composables/useTheme.ts，默认跟随系统）分开存，互不影响。
 * main.ts 在落地模式下首帧前就调 `applyLandingTheme()`，不会先闪一帧另一套。
 */
export type LandingTheme = 'dark' | 'light';
const STORAGE_KEY = 'zeppbridge-landing-theme';

const read = (): LandingTheme => {
  try {
    const saved = window.localStorage.getItem(STORAGE_KEY);
    if (saved === 'dark' || saved === 'light') return saved;
    return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  } catch {
    // System preference still works when storage is unavailable.
  }
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
};

export const landingTheme = ref<LandingTheme>('light');
export const landingThemeMode = ref<ThemeMode>('system');
let query: MediaQueryList | null = null;
const commit = (theme: LandingTheme) => {
  landingTheme.value = theme;
  document.documentElement.dataset.theme = theme;
  document.documentElement.style.colorScheme = `only ${theme}`;
};

export const applyLandingTheme = () => {
  landingTheme.value = read();
  try { const saved = window.localStorage.getItem(STORAGE_KEY); landingThemeMode.value = saved === 'dark' || saved === 'light' ? saved : 'system'; } catch { landingThemeMode.value = 'system'; }
  commit(landingTheme.value);
  if (!query) { query = window.matchMedia?.('(prefers-color-scheme: dark)') ?? null; query?.addEventListener?.('change', e => { if (landingThemeMode.value === 'system') commit(e.matches ? 'dark' : 'light'); }); }
};

/**
 * 立即切换 token，避免对整个页面与 iframe 做快照过渡。
 */
export const pickLandingTheme = (mode: ThemeMode, origin?: ThemeOrigin) => {
  const next = mode === 'system' ? (window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light') : mode;
  revealTheme(() => { landingThemeMode.value = mode; commit(next); try { window.localStorage.setItem(STORAGE_KEY, mode); } catch { /* Session choice still works. */ } }, origin);
};
export const toggleLandingTheme = (origin?: ThemeOrigin) => pickLandingTheme(landingTheme.value === 'dark' ? 'light' : 'dark', origin);
