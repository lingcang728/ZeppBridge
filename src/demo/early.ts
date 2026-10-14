/**
 * 演示模式的最早一步：必须是 main.ts 里**第一个**被导入的模块。
 *
 * 路由器、落地页开关在被导入的那一刻就要知道「这次是不是演示」，所以判断不能等到 main.ts 的正文。
 * 这里只做三件很小的事，同步完成、不拉任何大模块：
 *   1. 看地址里有没有 `demo=1`，有就在 window 上记下来（之后路由换了地址、参数丢了，也还认得）；
 *   2. 把 `theme` / `lang` 参数存起来，等主题和语言层起来以后再应用；
 *   3. 如果带了 `route`，在路由器创建之前把地址改成它——应用一开始就落在那一页，不会先闪一下概览。
 */
/** `tour` / `welcome` / `ret`：新手引导的示例沙盒（lib/tour/sandbox.ts）——要看的章节、要不要先出语言轮、结束回哪一页。 */
interface DemoFlags { demo: boolean; theme: string | null; lang: string | null; showcase: boolean; scene?: string; tour?: string; welcome?: boolean; ret?: string }

declare global {
  interface Window { __ZB_DEMO__?: DemoFlags }
}

const read = (): DemoFlags | undefined => {
  try {
    const params = new URLSearchParams(window.location.search);
    const value = params.get('demo');
    if (value === null || value === '0' || value === 'false') return undefined;
    const route = params.get('route');
    if (route && route.startsWith('/') && !route.startsWith('//')) window.history.replaceState(null, '', route);
    const tour = params.get('tour') ?? undefined;
    return {
      demo: true, theme: params.get('theme'), lang: params.get('lang'), showcase: params.get('showcase') === '1',
      scene: params.get('scene') ?? undefined, tour, welcome: params.get('welcome') === '1', ret: params.get('ret') ?? undefined,
    };
  } catch {
    return undefined;
  }
};

/* 整页载入只能落在根路径：vite 的 base 是 './'，载入 `/settings/guide` 这种多级地址时脚本会被
   解析成 `/settings/assets/…`，取不到，窗口一片白（引导结束回设置页就这样白过屏，10-13）。
   所以要回到某一页时一律载入 `/?route=<页>`，这里在路由器创建前把地址换过去。 */
const applyRouteParam = () => {
  try {
    const params = new URLSearchParams(window.location.search);
    if (params.get('demo') !== null) return;
    const route = params.get('route');
    if (route && route.startsWith('/') && !route.startsWith('//')) window.history.replaceState(null, '', route);
  } catch {
    // 换不了就停在根路径。
  }
};

if (typeof window !== 'undefined' && window.__ZB_DEMO__ === undefined) {
  applyRouteParam();
  const flags = read();
  if (flags) {
    window.__ZB_DEMO__ = flags;
    // App preferences inside a demo must never overwrite the visitor's real preferences.
    // Every iframe gets its own disposable Storage, so resetting one demo affects nothing else.
    const values = new Map<string, string>();
    const memory: Storage = {
      get length() { return values.size; }, clear: () => values.clear(),
      getItem: key => values.get(key) ?? null, setItem: (key, value) => { values.set(key, String(value)); },
      removeItem: key => { values.delete(key); }, key: index => [...values.keys()][index] ?? null,
    };
    // 引导沙盒要把「看过哪几章」记进真实的那份（lib/tour/sandbox.ts），换掉之前先留个手。
    if (flags.tour !== undefined) {
      try { window.__ZB_REAL_STORAGE__ = window.localStorage; } catch { /* 读不到就只在这次记 */ }
    }
    Object.defineProperty(window, 'localStorage', { configurable: true, value: memory });
    Object.defineProperty(window, 'sessionStorage', { configurable: true, value: memory });
    values.set('zeppbridge-theme', flags.theme ?? 'light');
    values.set('zeppbridge-locale', flags.lang ?? 'en');
    values.set('zb.focusAsked', '1');
  }
}

export {};
