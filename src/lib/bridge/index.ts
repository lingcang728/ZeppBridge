import { tauriBackend } from './tauri';
import { webBackend } from './web';
import type { BridgeBackend } from './types';

export type { BridgeBackend, UnlistenFn } from './types';
export { tauriBackend } from './tauri';
export { webBackend } from './web';
export {
  DesktopUnavailableError,
  TauriUnavailableError,
  toUserMessage,
} from './errors';

export const isDesktop = (): boolean => {
  if (typeof window === 'undefined') return false;
  const host = window as Window & {
    __TAURI_INTERNALS__?: unknown;
    __TAURI__?: unknown;
  };
  return Boolean(host.__TAURI_INTERNALS__ || host.__TAURI__);
};

export const isTauri = isDesktop;

export const getBackend = (): BridgeBackend => (isDesktop() ? tauriBackend : webBackend);

export const backend: BridgeBackend = new Proxy({} as BridgeBackend, {
  get(_target, key) {
    const api = getBackend() as unknown as Record<string | symbol, unknown>;
    const value = api[key];
    return typeof value === 'function' ? (value as (...args: unknown[]) => unknown).bind(api) : value;
  },
});
