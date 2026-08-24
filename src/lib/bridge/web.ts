import { DesktopUnavailableError } from './errors';
import type { BridgeBackend, UnlistenFn } from './types';

const unavailable = (): never => {
  throw new DesktopUnavailableError('请使用桌面应用');
};

export const webBackend: BridgeBackend = {
  getAppStatus: unavailable,
  saveAuth: unavailable,
  verifyAuth: unavailable,
  clearAuth: unavailable,
  importFromHar: unavailable,
  manualAuth: unavailable,
  startWebLogin: unavailable,
  cancelWebLogin: unavailable,
  getLoginStatus: unavailable,
  startInitialSync: unavailable,
  startHistorySync: unavailable,
  startIncrementalSync: unavailable,
  cancelSync: unavailable,
  getHealthOverview: unavailable,
  getHeartRateSeries: unavailable,
  getTrainingLoadSeries: unavailable,
  getStorageEstimate: unavailable,
  setUserPrefs: unavailable,
  getRecentSleep: unavailable,
  getSleepDetail: unavailable,
  getRecentWorkouts: unavailable,
  getWorkoutDetail: unavailable,
  getWorkoutSeries: unavailable,
  getLocalApiStatus: unavailable,
  getDeviceProfile: unavailable,
  getDeviceProfiles: unavailable,
  reprocessLocalData: unavailable,
  getExportJson: unavailable,
  saveJsonExport: unavailable,
  saveCsvExport: unavailable,
  saveGpxExport: unavailable,
  publishAiExport: unavailable,
  prepareAiHandoff: unavailable,
  cleanupOldData: unavailable,
  openDataFolder: unavailable,
  listen<T>(_event: string, _handler: (payload: T) => void): Promise<UnlistenFn> {
    return Promise.resolve(() => undefined);
  },
};
