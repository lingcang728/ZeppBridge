/**
 * 字体就绪的那一个 promise，整个应用只取一次。
 *
 * `document.fonts.ready` 这个 getter 在 Chromium 里会逼浏览器先把整页样式算完（要看还有没有字体在等着下载）。
 * 胶囊选择器、胶囊滚轮以前每挂一个就取一次：设置卡一挂十几个，正赶上切页形变，主线程一卡 40ms，
 * 形变跟着一顿（用户 2026-10-04 录屏，CPU profile 里的 `get ready`）。字体在启动时就加载好了，
 * 之后尺寸再变由各组件的 ResizeObserver 接着。
 */
let shared: Promise<unknown> | null = null;

export const fontsReady = (): Promise<unknown> => {
  if (!shared) shared = typeof document !== 'undefined' && document.fonts ? document.fonts.ready : Promise.resolve();
  return shared;
};
