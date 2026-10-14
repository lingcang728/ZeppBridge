import { isTauriRuntime, tauriBackend } from './tauri';
import { webBackend } from './web';
import type { BridgeBackend } from './types';

export type { BridgeBackend, UnlistenFn } from './types';
export { backendLate, tauriBackend, whenBackendReady } from './tauri';
export { webBackend } from './web';
export {
  DesktopUnavailableError,
  TauriUnavailableError,
  toUserMessage,
} from './errors';

export const isDesktop = isTauriRuntime;
export const isTauri = isDesktop;

export const getBackend = (): BridgeBackend => (isDesktop() ? tauriBackend : webBackend);

/* 两个实现的方法都不用 `this`，取到就能直接调，不必每次 bind 出一个新函数。 */
export const backend: BridgeBackend = new Proxy({} as BridgeBackend, {
  get: (_target, key) => (getBackend() as unknown as Record<string | symbol, unknown>)[key],
});
