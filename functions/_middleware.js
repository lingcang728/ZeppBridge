// 网站统一在 zeppbridge.com（2026-10-14 上线）。
//
// - www.zeppbridge.com 一律 301 到裸域；
// - zeppbridge.pages.dev 上的**网页** 301 到 zeppbridge.com，但 `/api/*` 原地服务、绝不跳转：
//   已经发出去的应用版本把授权中转和反馈地址写死在 pages.dev，Zepp 控制台登记的授权回调 / 数据回调
//   也在 pages.dev（改不了），跳转会让 POST 丢掉请求体、让回调多绕一跳。
// - 预览部署（<hash>.zeppbridge.pages.dev）不动，方便验收。
//
// 只有 `_routes.json` 里列出的路径（/、/index.html、/api/*）才会进到函数，静态资源不经过这里。
export const CANONICAL_ORIGIN = 'https://zeppbridge.com';

export const canonicalRedirect = (url) => {
  const { hostname, pathname, search } = new URL(url);
  const www = hostname === 'www.zeppbridge.com';
  const legacyPage = hostname === 'zeppbridge.pages.dev' && !pathname.startsWith('/api/');
  return www || legacyPage ? `${CANONICAL_ORIGIN}${pathname}${search}` : null;
};

export async function onRequest({ request, next }) {
  const target = canonicalRedirect(request.url);
  return target ? Response.redirect(target, 301) : next();
}
