/**
 * 演示模式的最早一步：必须是 main.ts 里**第一个**被导入的模块。
 *
 * 路由器、落地页开关在被导入的那一刻就要知道「这次是不是演示」，所以判断不能等到 main.ts 的正文。
 * 这里只做三件很小的事，同步完成、不拉任何大模块：
 *   1. 看地址里有没有 `demo=1`，有就在 window 上记下来（之后路由换了地址、参数丢了，也还认得）；
 *   2. 把 `theme` / `lang` 参数存起来，等主题和语言层起来以后再应用；
 *   3. 如果带了 `route`，在路由器创建之前把地址改成它——应用一开始就落在那一页，不会先闪一下概览。
 */
interface DemoFlags { demo: boolean; theme: string | null; lang: string | null; showcase: boolean }

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
    return { demo: true, theme: params.get('theme'), lang: params.get('lang'), showcase: params.get('showcase') === '1' };
  } catch {
    return undefined;
  }
};

if (typeof window !== 'undefined' && window.__ZB_DEMO__ === undefined) {
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
    Object.defineProperty(window, 'localStorage', { configurable: true, value: memory });
    Object.defineProperty(window, 'sessionStorage', { configurable: true, value: memory });
    values.set('zeppbridge-theme', flags.theme ?? 'light');
    values.set('zeppbridge-locale', flags.lang ?? 'en');
    values.set('zb.focusAsked', '1');
  }
}

export {};
