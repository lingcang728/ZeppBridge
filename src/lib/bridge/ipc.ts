/*
 * 应用自己的 invoke / listen：平时就是 @tauri-apps/api 那两个，演示运行时装上以后改走它。
 *
 * 为什么不直接盖掉 `window.__TAURI_INTERNALS__`：浏览器里（落地页演示）可以，但桌面里 Tauri
 * 在页面脚本之前就用 defineProperty 把它定死了（不可写、不可重配，它上面的 invoke 也是），
 * 赋值会直接抛错。新手引导的示例沙盒要在 exe 里跑，只能在我们自己这一层分流：演示运行时
 * 把自己挂在 `window.__ZB_IPC__`（demo/runtime.ts），这里每次调用都先看它在不在。
 *
 * 只有经 bridge（和 dragOut）的调用会被分流；插件自带的调用（打开网址、文件对话框、更新）
 * 仍然到真的后端——它们都不写库。
 */
import { invoke as tauriInvoke } from '@tauri-apps/api/core';
import { listen as tauriListen, type EventCallback, type UnlistenFn } from '@tauri-apps/api/event';

export interface DemoIpc {
  /** 认得出这是演示运行时：引导沙盒挂载前要核对真的换上了它（main.ts）。 */
  __zbDemo: true;
  invoke(command: string, args?: Record<string, unknown>): Promise<unknown>;
  transformCallback(callback: (event: { event: string; id: number; payload: unknown }) => void): number;
}

declare global {
  interface Window { __ZB_IPC__?: DemoIpc }
}

const demoIpc = (): DemoIpc | undefined => (typeof window === 'undefined' ? undefined : window.__ZB_IPC__);

/** 演示运行时是否真的接管了 bridge。 */
export const demoIpcActive = (): boolean => demoIpc()?.__zbDemo === true;

export const invoke = <T>(command: string, args?: Record<string, unknown>): Promise<T> => {
  const demo = demoIpc();
  return demo ? (demo.invoke(command, args) as Promise<T>) : tauriInvoke<T>(command, args);
};

export const listen = async <T>(event: string, handler: EventCallback<T>): Promise<UnlistenFn> => {
  const demo = demoIpc();
  if (!demo) return tauriListen<T>(event, handler);
  const handlerId = demo.transformCallback(handler as (event: { event: string; id: number; payload: unknown }) => void);
  const eventId = await demo.invoke('plugin:event|listen', { event, target: { kind: 'Any' }, handler: handlerId });
  return () => { void demo.invoke('plugin:event|unlisten', { event, eventId }).catch(() => undefined); };
};
