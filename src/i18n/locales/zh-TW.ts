import type { LocalePack } from '../index';

/**
 * 繁體中文（zh-TW）语言包。3.1.1 加的第 13 种语言。
 *
 * 和其他语言包同一个形状、同一套门禁（`npm run i18n:check`）；还没覆盖的键登记在
 * `zh-TW.pending.txt`，翻一条删一条。只有一点不同：缺的键先回落**简体**（读得懂），
 * 不回落英文——见 `src/i18n/index.ts` 的 `resolveBundle`。
 *
 * 写法：台湾用语、全形标点（「」、，。），单位和品牌名照原样（Zepp、Amazfit、HRV、bpm）。
 * 包里允许出现汉字（`check-i18n.mjs` 对 zh-TW 豁免「非中文包禁 CJK」）。
 */
export default {
  modules: {},
  errors: {},
  backendText: {},
} satisfies LocalePack;
