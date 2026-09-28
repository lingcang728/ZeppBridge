import { isDesktop } from './bridge';

/**
 * 这一次页面加载显示的是不是落地页：浏览器里打开、且没带 `?app-preview`。
 *
 * 同一份 dist 两种形态（见 CLAUDE.md「同一份 dist 的两种形态」）。判断只在启动时
 * 做一次，路由器和 App.vue 必须用同一个结论——路由器据此决定要不要挂真正的页面，
 * App.vue 据此决定渲染落地页还是桌面外壳。
 */
export const isLandingMode = (): boolean =>
  !isDesktop() && !new URLSearchParams(window.location.search).has('app-preview');
