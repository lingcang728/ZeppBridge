/**
 * 演示页和外层落地页之间的消息通道。
 *
 * 落地页把真应用放在 iframe 里（同源）：
 *   外层 → 演示：`{ source: 'zeppbridge-site', type: 'go', to: '/ai' }` 让应用换到某个页面（真路由，走真转场）；
 *                `{ type: 'scroll', selector: '.plan-section' }` 把应用里的滚动区滚到某个元素（没给就回到顶）；
 *                `{ type: 'theme', value: 'light' }` / `{ type: 'locale', value: 'en' }` 跟着落地页的主题与语言；
 *   演示 → 外层：`{ source: 'zeppbridge-demo', type: 'ready' | 'route' | 'handoff' | 'open-url', ... }`。
 *
 * 只认同源消息，不认任何别的来源。
 */
export const SITE_SOURCE = 'zeppbridge-site';
export const DEMO_SOURCE = 'zeppbridge-demo';

/** 这一次是不是演示模式：`early.ts` 在启动最早期看过地址里的 `demo=1` 并记在 window 上。 */
export const demoRequested = (): boolean => typeof window !== 'undefined' && window.__ZB_DEMO__?.demo === true;

export const hostPost = (type: string, payload: Record<string, unknown> = {}): void => {
  try {
    if (window.parent && window.parent !== window) {
      window.parent.postMessage({ source: DEMO_SOURCE, type, ...payload }, window.location.origin);
    }
  } catch { /* 外层没在听就算了 */ }
};

export interface SiteMessage { type: 'go' | 'theme' | 'locale' | 'scroll' | 'visibility'; to?: string; value?: string; selector?: string | null }

/** 听外层页面发来的指令（只收同源、且带约定 source 的）。 */
export const listenToSite = (handle: (message: SiteMessage) => void): (() => void) => {
  const onMessage = (event: MessageEvent) => {
    if (event.origin !== window.location.origin || event.source !== window.parent) return;
    const data = event.data as { source?: string } & SiteMessage;
    if (data?.source !== SITE_SOURCE) return;
    handle(data);
  };
  window.addEventListener('message', onMessage);
  return () => window.removeEventListener('message', onMessage);
};
