import { DesktopUnavailableError } from './errors';
import type { BridgeBackend, UnlistenFn } from './types';

/* 浏览器里（落地页、`?app-preview=1`）没有后端：每个方法都返回拒绝。

   必须返回 rejected Promise，不能同步 throw：同步 throw 时
   `backend.X().catch(...)` 的 catch 根本挂不上去——函数还没返回 Promise
   调用点就中止了（Settings 页 onMounted 曾被这样截断，后面的初始化全没跑）。
   用 Proxy 而不是逐个列方法：新增 command 时这里不用跟着改，也不可能漏。
   `listen` 是唯一的例外——订阅事件在浏览器里是无害的空操作。 */
const unavailable = (): Promise<never> => Promise.reject(new DesktopUnavailableError());
const noopListen = (): Promise<UnlistenFn> => Promise.resolve(() => undefined);

export const webBackend = new Proxy({} as BridgeBackend, {
  get: (_target, key) => (key === 'listen' ? noopListen : key === 'then' ? undefined : unavailable),
});
