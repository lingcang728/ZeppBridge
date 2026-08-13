export {
  backend as tauriApi,
  getBackend,
  isDesktop,
  isTauri,
  tauriBackend,
  webBackend,
  DesktopUnavailableError,
  TauriUnavailableError,
  toUserMessage,
} from '../lib/bridge';
export type { BridgeBackend } from '../lib/bridge';
