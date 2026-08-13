import { computed, readonly, ref } from 'vue';

export const UI_SCALES = [80, 90, 100, 110, 125] as const;
export type UiScale = (typeof UI_SCALES)[number];

const STORAGE_KEY = 'zeppbridge-ui-scale';
const scale = ref<UiScale>(100);
let initialized = false;

const isUiScale = (value: number): value is UiScale =>
  (UI_SCALES as readonly number[]).includes(value);

const readScale = (): UiScale => {
  if (typeof window === 'undefined') return 100;
  const saved = Number(window.localStorage.getItem(STORAGE_KEY));
  return isUiScale(saved) ? saved : 100;
};

const applyScale = (value: UiScale) => {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  root.style.zoom = String(value / 100);
  root.style.setProperty('--ui-scale', String(value / 100));
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

const resetScale = () => setScale(100);

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
