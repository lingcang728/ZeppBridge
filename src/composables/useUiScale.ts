import { computed, readonly, ref } from 'vue';
import { isDesktop } from '../lib/bridge';

export const UI_SCALES = [80, 90, 100, 110, 125] as const;
export type UiScale = (typeof UI_SCALES)[number];

// 默认使用 100%：通过字号 token 放大 DOM 和图表文字，避免整体 zoom 影响图表指针坐标。
// 界面缩放选项、快捷键和已保存的用户选择仍然有效，需要时可以调整整体大小。
export const DEFAULT_UI_SCALE: UiScale = 100;

const STORAGE_KEY = 'zeppbridge-ui-scale';
const scale = ref<UiScale>(DEFAULT_UI_SCALE);
let initialized = false;

const isUiScale = (value: number): value is UiScale =>
  (UI_SCALES as readonly number[]).includes(value);

const readScale = (): UiScale => {
  if (typeof window === 'undefined') return DEFAULT_UI_SCALE;
  const saved = Number(window.localStorage.getItem(STORAGE_KEY));
  return isUiScale(saved) ? saved : DEFAULT_UI_SCALE;
};

const applyCssZoom = (factor: number) => {
  const root = document.documentElement;
  root.style.zoom = factor === 1 ? '' : String(factor);
  root.style.setProperty('--ui-scale', String(factor));
};

/*
 * 桌面端走 webview 原生缩放（等同浏览器 Ctrl +/-）。根元素 CSS zoom 会让
 * getBoundingClientRect 返回已缩放的像素，再当 CSS px 写回就被缩两次——
 * 80% 时主题菜单、导航滑块、日期弹层全部错位。原生缩放下坐标系是一套，
 * 这一类问题从根上消失。浏览器预览没有 webview API，才退回 CSS zoom。
 */
const applyScale = (value: UiScale) => {
  if (typeof document === 'undefined') return;
  const factor = value / 100;
  if (!isDesktop()) {
    applyCssZoom(factor);
    return;
  }
  applyCssZoom(1);
  void import('@tauri-apps/api/webview')
    .then(({ getCurrentWebview }) => getCurrentWebview().setZoom(factor))
    .catch(() => applyCssZoom(factor));
};

const setScale = (value: UiScale) => {
  scale.value = value;
  if (typeof window !== 'undefined') window.localStorage.setItem(STORAGE_KEY, String(value));
  applyScale(value);
};

const bumpScale = (direction: 1 | -1) => {
  const index = UI_SCALES.indexOf(scale.value);
  const next = UI_SCALES[Math.min(UI_SCALES.length - 1, Math.max(0, index + direction))];
  setScale(next);
};

const resetScale = () => setScale(DEFAULT_UI_SCALE);

const initializeScale = () => {
  if (initialized) return;
  initialized = true;
  scale.value = readScale();
  applyScale(scale.value);
};

export const useUiScale = () => ({
  scale: readonly(scale),
  scaleLabel: computed(() => `${scale.value}%`),
  initializeScale,
  setScale,
  bumpScale,
  resetScale,
});
