import { computed, readonly, ref } from 'vue';

/**
 * 界面特效档位：完整 / 低特效 / 自动（issue #133）。
 *
 * Linux 的 WebKitGTK 为了不白屏关掉了 DMABUF 渲染（AppImage 连加速合成也关了，见 src-tauri/src/lib.rs），
 * 剩下的渲染路径扛不住整页毛玻璃和形变动画：翻页要好几秒，悬停都卡。所以 Linux 上「自动」= 低特效。
 *
 * 低特效做两件事，都挂在 `<html data-effects="lite">` 上：
 * - styles/material.css 把所有 backdrop-filter 换成不透明的玻璃底色；
 * - lib/motion/lessMotion.ts 让各处动画按「减少动态效果」走（形变、灰烬改成淡入淡出）。
 *
 * 和主题一样在首次渲染前同步写好属性（main.ts），不会先卡一帧完整特效。
 */
export type EffectsMode = 'auto' | 'full' | 'lite';

const STORAGE_KEY = 'zeppbridge-effects';

const isEffectsMode = (value: unknown): value is EffectsMode =>
  value === 'auto' || value === 'full' || value === 'lite';

const readMode = (): EffectsMode => {
  if (typeof window === 'undefined') return 'auto';
  try {
    const saved = window.localStorage.getItem(STORAGE_KEY);
    if (isEffectsMode(saved)) return saved;
  } catch {
    // 隐私模式下 localStorage 可能抛异常，用默认值继续。
  }
  return 'auto';
};

/** WebKitGTK（Linux 桌面）。Android 的 UA 也带 Linux，排除掉。 */
export const isLinuxWebView = (userAgent = typeof navigator === 'undefined' ? '' : navigator.userAgent): boolean =>
  /Linux/.test(userAgent) && !/Android/.test(userAgent);

export const resolveLite = (value: EffectsMode, linux: boolean): boolean =>
  value === 'lite' || (value === 'auto' && linux);

const mode = ref<EffectsMode>(readMode());
const lite = computed(() => resolveLite(mode.value, isLinuxWebView()));

const apply = () => {
  if (typeof document === 'undefined') return;
  if (lite.value) document.documentElement.dataset.effects = 'lite';
  else delete document.documentElement.dataset.effects;
};

const setEffects = (value: EffectsMode) => {
  mode.value = value;
  try {
    window.localStorage.setItem(STORAGE_KEY, value);
  } catch {
    // 存不下就只对这一次生效。
  }
  apply();
};

/** main.ts 在首次渲染前调用。 */
export const initializeEffects = () => apply();

export const useEffects = () => ({ mode: readonly(mode), lite, setEffects });
