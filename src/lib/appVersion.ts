/**
 * 浏览器预览（`?app-preview=1`）里显示的版本号。桌面端从 Tauri 运行时读版本
 * （与 tauri.conf.json 单一来源），这里只是回退值，要和 package.json 保持一致——
 * `npm run version:check` 会核对它。
 */
export const FALLBACK_APP_VERSION = '3.0.0-beta.42';
