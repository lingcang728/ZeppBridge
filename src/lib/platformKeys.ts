/**
 * 文案里写的是 Windows / Linux 的按键名（Ctrl+V）；Mac 上换成 ⌘V。
 * 只换这一个组合：交给 AI 的提示和新手引导里用到的就是它，译文里也都原样保留了「Ctrl+V」。
 */
export const isMac = () => /Mac|iPhone|iPad/i.test(navigator.platform || navigator.userAgent);

export const withPlatformKeys = (text: string) => (isMac() ? text.replace(/Ctrl\+V/g, '⌘V') : text);
