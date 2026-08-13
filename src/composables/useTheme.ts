import { computed, readonly, ref } from 'vue';

export type ThemeMode = 'system' | 'light' | 'dark';

const theme = ref<ThemeMode>('system');
let initialized = false;

const readTheme = (): ThemeMode => {
  if (typeof window === 'undefined') return 'system';
  const saved = window.localStorage.getItem('zeppbridge-theme');
  return saved === 'light' || saved === 'dark' || saved === 'system' ? saved : 'system';
};

const applyTheme = (mode: ThemeMode) => {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  if (mode === 'system') root.removeAttribute('data-theme');
  else root.setAttribute('data-theme', mode);
  root.style.colorScheme = mode === 'system' ? '' : mode;
};

const setTheme = (mode: ThemeMode) => {
  theme.value = mode;
  if (typeof window !== 'undefined') window.localStorage.setItem('zeppbridge-theme', mode);
  applyTheme(mode);
};

const initializeTheme = () => {
  if (initialized) return;
  initialized = true;
  theme.value = readTheme();
  applyTheme(theme.value);
  // No matchMedia listener needed: in 'system' mode applyTheme leaves no
  // data-theme attribute, so the CSS @media (prefers-color-scheme) rules
  // respond to OS changes automatically.
};

export const useTheme = () => ({
  theme: readonly(theme),
  themeLabel: computed(() => ({ system: '跟随系统', light: '浅色', dark: '深色' })[theme.value]),
  initializeTheme,
  setTheme,
});
