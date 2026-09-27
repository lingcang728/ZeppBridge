import { computed, ref } from 'vue';

/**
 * 界面主题：深色 / 浅色 / 跟随系统。
 *
 * v3 起应用提供完整的深浅两套主题（Beta1 产品要求，推翻旧的「只做深色」
 * 决策）。这个文件只管「当前用哪一套」：色值全部在 `src/styles/tokens.css`
 * ——`:root` 是深色默认值，`html[data-theme="light"]` 覆写同一组 token。
 * 这里不出现任何颜色。
 *
 * 生效链路：`initializeTheme()` 在 `main.ts` 里于首次渲染前同步执行，把
 * 解析结果写到 `<html data-theme>`，CSS 立即套用，不会先闪一帧另一套。
 * `color-scheme` 由 CSS 按 `data-theme` 给出（滚动条、表单控件跟着换）。
 * 图表经 `lib/echartsSetup.ts` 的 `CHART_THEME` / `chartPalette` 跟着
 * `resolvedTheme` 走。
 */
export type ThemeMode = 'light' | 'dark' | 'system';
export type ResolvedTheme = 'light' | 'dark';

const STORAGE_KEY = 'zeppbridge-theme';

const isThemeMode = (value: unknown): value is ThemeMode =>
  value === 'light' || value === 'dark' || value === 'system';

const readStoredMode = (): ThemeMode => {
  if (typeof window === 'undefined') return 'system';
  try {
    const saved = window.localStorage.getItem(STORAGE_KEY);
    if (isThemeMode(saved)) return saved;
  } catch {
    // 隐私模式下 localStorage 可能抛异常，用默认值继续启动。
  }
  return 'system';
};

const readSystemDark = (): boolean => {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return true;
  return window.matchMedia('(prefers-color-scheme: dark)').matches;
};

const mode = ref<ThemeMode>(readStoredMode());
const systemDark = ref(readSystemDark());

/** 解析后的实际主题：`system` 在这一层落到具体的一套。 */
export const resolvedTheme = computed<ResolvedTheme>(() =>
  mode.value === 'system' ? (systemDark.value ? 'dark' : 'light') : mode.value);

/** 系统此刻是哪一套。顶栏的两态胶囊选中它时回到「跟随系统」。 */
export const systemTheme = computed<ResolvedTheme>(() => (systemDark.value ? 'dark' : 'light'));

/**
 * 只有深 / 浅两个选项的切换：选中和系统一致的那一套，就等于回到跟随系统——
 * 用户不必认识「跟随系统」这个第三态，默认行为也不会被一次误触锁死。
 */
export const pickTheme = (value: ResolvedTheme, origin?: ThemeOrigin) => {
  const next: ThemeMode = value === systemTheme.value ? 'system' : value;
  if (value === resolvedTheme.value) {
    setTheme(next);
    return;
  }
  revealTheme(() => setTheme(next), origin);
};

/** 换主题的动画从哪儿扩散出去（视口坐标，一般是被点的那枚月亮 / 太阳）。 */
export type ThemeOrigin = { x: number; y: number };

/** 遮罩边缘羽化的宽度，和 material.css 里的渐变保持一致。 */
const REVEAL_FEATHER = 96;

type ViewTransitionDocument = Document & {
  startViewTransition?: (update: () => void) => { ready: Promise<void>; finished: Promise<void> };
};

/**
 * 换主题：新的一套从按钮的位置像水波一样扩散开，漫过旧的那套——不再整屏硬切。
 *
 * 用 View Transitions 给整页拍两张快照：旧的垫底不动，新的套一个圆形遮罩，
 * 半径从 0 长到能盖住最远那个角。遮罩边缘带一圈羽化（见 material.css 的
 * `html[data-theme-morph]`），所以是「漫过去」而不是一把剪刀剪过去。
 * 其余带 view-transition-name 的元素（设置卡）在这一刻不单独拍，免得它们各自淡入淡出。
 * 不支持或开了减少动效时直接换。
 */
const revealTheme = (update: () => void, origin?: ThemeOrigin) => {
  const doc = document as ViewTransitionDocument;
  const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  if (!doc.startViewTransition || reduced || !origin) {
    update();
    return;
  }
  const root = document.documentElement;
  const { innerWidth: width, innerHeight: height } = window;
  const reach = Math.hypot(Math.max(origin.x, width - origin.x), Math.max(origin.y, height - origin.y));
  root.style.setProperty('--reveal-x', `${Math.round(origin.x)}px`);
  root.style.setProperty('--reveal-y', `${Math.round(origin.y)}px`);
  root.dataset.themeMorph = '';
  const transition = doc.startViewTransition(update);
  void transition.ready.then(() => {
    root.animate(
      { '--reveal-r': ['0px', `${Math.ceil(reach + REVEAL_FEATHER)}px`] },
      { duration: 760, easing: 'cubic-bezier(.4, 0, .15, 1)', pseudoElement: '::view-transition-new(root)', fill: 'forwards' },
    );
  }).catch(() => undefined);
  void transition.finished.catch(() => undefined).finally(() => {
    delete root.dataset.themeMorph;
    root.style.removeProperty('--reveal-x');
    root.style.removeProperty('--reveal-y');
  });
};

/** 浏览器 chrome（地址栏/窗口边框色）跟着实际主题走。 */
const THEME_COLORS: Record<ResolvedTheme, string> = { dark: '#0D0F12', light: '#F4F6F3' };

const applyTheme = () => {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  // CSS 只区分解析结果；data-theme-preference 留下原始选择，便于排查和调试。
  root.dataset.theme = resolvedTheme.value;
  root.dataset.themePreference = mode.value;
  const meta = document.querySelector('meta[name="theme-color"]');
  meta?.setAttribute('content', THEME_COLORS[resolvedTheme.value]);
};

let mediaQuery: MediaQueryList | null = null;
const onSystemChange = (event: MediaQueryListEvent) => {
  systemDark.value = event.matches;
  applyTheme();
};

let initialized = false;

/**
 * 启动时调用一次：读取保存的选择、挂上系统主题监听、立刻应用。
 * 之后的主题变化（用户切换或系统切换）都由这里注册的通路驱动。
 */
export const initializeTheme = () => {
  if (initialized) return;
  initialized = true;
  applyTheme();
  if (typeof window !== 'undefined' && typeof window.matchMedia === 'function') {
    mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    systemDark.value = mediaQuery.matches;
    // `addEventListener('change')` 在现代 WebView2 / Chromium 均可用；
    // addListener 已废弃，不再兜底旧接口。
    mediaQuery.addEventListener('change', onSystemChange);
    applyTheme();
  }
};

export const setTheme = (value: ThemeMode) => {
  if (!isThemeMode(value)) return;
  mode.value = value;
  try {
    window.localStorage.setItem(STORAGE_KEY, value);
  } catch {
    // 存不下就只在本次会话生效，比整个切换动作失败要好。
  }
  applyTheme();
};

/** 顶栏单键循环：深色 → 浅色 → 跟随系统 → 深色。 */
export const cycleTheme = () => {
  const order: readonly ThemeMode[] = ['dark', 'light', 'system'];
  const next = order[(order.indexOf(mode.value) + 1) % order.length];
  setTheme(next);
};

export const useTheme = () => ({
  /** 用户的选择（含 system）。 */
  themeMode: computed(() => mode.value),
  /** 实际生效的一套，组件和图表都用它。 */
  resolvedTheme,
  systemTheme,
  setTheme,
  pickTheme,
  cycleTheme,
});
