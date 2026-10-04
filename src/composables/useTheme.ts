import { computed, ref } from 'vue';
import { whenFramesSteady } from '../lib/motion/steady';
import { OPEN_EASE, REVEAL_MS } from '../lib/motion/timing';

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
 * 用户点哪个就是哪个：点深色就固定深色，系统怎么变都不跟；「跟随系统」是设置里单独的
 * 第三项。以前「选中和系统一致的那一套就回到跟随系统」，结果用户点的是深色，系统一换浅色
 * 界面也跟着变浅——选择的动作和最终的规则对不上（评审 U14）。
 */
export const pickTheme = (value: ThemeMode, origin?: ThemeOrigin) => {
  const target: ResolvedTheme = value === 'system' ? systemTheme.value : value;
  if (target === resolvedTheme.value) {
    setTheme(value);
    return;
  }
  revealTheme(() => setTheme(value), origin);
};

/** 换主题的动画从哪儿扩散出去（视口坐标，一般是被点的那枚月亮 / 太阳）。 */
export type ThemeOrigin = { x: number; y: number };

type ViewTransitionHandle = { ready: Promise<void>; finished: Promise<void>; skipTransition: () => void };
type ViewTransitionDocument = Document & {
  startViewTransition?: (update: () => void) => ViewTransitionHandle;
};

/** 正在放的那次换主题动画。 */
let revealing: ViewTransitionHandle | null = null;

/**
 * 换主题：新的一套从按钮的位置扩散开，漫过旧的那套——不再整屏硬切。
 *
 * 用 View Transitions 给整页拍两张快照：旧的垫底不动，新的套一个圆形 clip-path，
 * 半径从 0 长到能盖住最远那个角。
 *
 * 以前这里是「径向渐变遮罩 + 动画自定义属性 --reveal-r」，边缘带羽化。那条路每一帧都要在
 * 主线程上重算样式、把整屏遮罩重新栅格化：4K 屏上一次切换是一串 50–150ms 的长任务，
 * 连着拨几下，WebView 直接崩成「此页存在问题」。clip-path 圆形不用每帧重画遮罩。
 *
 * 过渡期间：
 *   - 快照层不接指针（material.css 的 `::view-transition { pointer-events: none }`），
 *     点击照常落到底下的真实页面，不会被动画「硬控」；
 *   - 上一次还没放完又拨了一下：把上一次直接放到结尾，这一次立刻生效、不再叠一层快照。
 * 不支持或开了减少动效时直接换。
 */
const revealTheme = (update: () => void, origin?: ThemeOrigin) => {
  const doc = document as ViewTransitionDocument;
  const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  if (revealing) {
    revealing.skipTransition();
    revealing = null;
    update();
    return;
  }
  if (!doc.startViewTransition || reduced || !origin) {
    update();
    return;
  }
  const root = document.documentElement;
  const { innerWidth: width, innerHeight: height } = window;
  const reach = Math.ceil(Math.hypot(Math.max(origin.x, width - origin.x), Math.max(origin.y, height - origin.y)));
  const at = `at ${Math.round(origin.x)}px ${Math.round(origin.y)}px`;
  root.dataset.themeMorph = '';
  const transition = doc.startViewTransition(update);
  revealing = transition;
  void transition.ready.then(() => {
    const grow = root.animate(
      { clipPath: [`circle(2px ${at})`, `circle(${reach}px ${at})`] },
      { duration: REVEAL_MS, easing: OPEN_EASE, fill: 'both', pseudoElement: '::view-transition-new(root)' },
    );
    // 先停在半径 0（画面上还是旧主题），等帧节奏平稳再长：换主题要整页重算样式、两张整屏快照上 GPU，
    // 头一两帧卡一百多毫秒。以前圆一开跑就被这一下吞掉大半，用户看到的是「卡一下、整屏一闪就换了」
    // （2026-10-04 录屏：520ms 的扩散只看得到六七帧）。
    grow.pause();
    void whenFramesSteady().then(() => { if (grow.playState === 'paused') grow.play(); });
  }).catch(() => undefined);
  void transition.finished.catch(() => undefined).finally(() => {
    if (revealing === transition) revealing = null;
    delete root.dataset.themeMorph;
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

export const useTheme = () => ({
  /** 用户的选择（含 system）。 */
  themeMode: computed(() => mode.value),
  /** 实际生效的一套，组件和图表都用它。 */
  resolvedTheme,
  systemTheme,
  setTheme,
  pickTheme,
});
