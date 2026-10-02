import { ref } from 'vue';

/**
 * 落地页的主题：**默认浅色**（暖白的纸），访客自己切过才记住深色。
 * 和应用的主题（composables/useTheme.ts，默认跟随系统）分开存，互不影响。
 * main.ts 在落地模式下首帧前就调 `applyLandingTheme()`，不会先闪一帧另一套。
 */
export type LandingTheme = 'dark' | 'light';
const STORAGE_KEY = 'zeppbridge-landing-theme';

const read = (): LandingTheme => {
  try {
    return window.localStorage.getItem(STORAGE_KEY) === 'dark' ? 'dark' : 'light';
  } catch {
    return 'light';
  }
};

export const landingTheme = ref<LandingTheme>('light');

export const applyLandingTheme = () => {
  landingTheme.value = read();
  document.documentElement.dataset.theme = landingTheme.value;
  document.documentElement.style.colorScheme = landingTheme.value;
};

/**
 * 切主题：支持 View Transitions 时，新主题从按钮的位置一圈扩散开（快照之间的过渡，合成器上做）；
 * 不支持或减少动态时直接换。
 */
export const toggleLandingTheme = (origin?: { x: number; y: number }) => {
  const next: LandingTheme = landingTheme.value === 'dark' ? 'light' : 'dark';
  const commit = () => {
    landingTheme.value = next;
    document.documentElement.dataset.theme = next;
    document.documentElement.style.colorScheme = next;
    try {
      window.localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // 记不住就只管这一次。
    }
  };
  const doc = document as Document & { startViewTransition?: (fn: () => void) => { ready: Promise<void> } };
  const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  if (!doc.startViewTransition || reduced || !origin) {
    commit();
    return;
  }
  const radius = Math.hypot(Math.max(origin.x, window.innerWidth - origin.x), Math.max(origin.y, window.innerHeight - origin.y));
  const transition = doc.startViewTransition(commit);
  void transition.ready.then(() => {
    document.documentElement.animate(
      { clipPath: [`circle(0px at ${origin.x}px ${origin.y}px)`, `circle(${radius}px at ${origin.x}px ${origin.y}px)`] },
      { duration: 620, easing: 'cubic-bezier(.22, .8, .2, 1)', pseudoElement: '::view-transition-new(root)' },
    );
  }, () => undefined);
};
