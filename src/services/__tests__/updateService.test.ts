import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  invoke: vi.fn(), download: vi.fn(), install: vi.fn(), relaunch: vi.fn(), check: vi.fn(),
}));
vi.mock('@tauri-apps/api/core', () => ({ invoke: mocks.invoke }));
vi.mock('@tauri-apps/api/app', () => ({ getVersion: async () => '2.4.0' }));
vi.mock('@tauri-apps/plugin-process', () => ({ relaunch: mocks.relaunch }));
vi.mock('@tauri-apps/plugin-updater', () => ({ check: mocks.check }));

describe('update data preservation', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.resetAllMocks();
    vi.stubGlobal('window', { __TAURI_INTERNALS__: {}, navigator: { languages: ['en'] } });
    vi.stubGlobal('localStorage', { getItem: () => null, setItem: vi.fn(), removeItem: vi.fn() });
    mocks.invoke.mockImplementation(async (command) => command === 'self_update_supported');
    mocks.check.mockResolvedValue({
      version: '2.4.1', currentVersion: '2.4.0', rawJson: {},
      download: mocks.download, install: mocks.install,
    });
    mocks.download.mockResolvedValue(undefined);
    mocks.install.mockResolvedValue(undefined);
  });
  afterEach(() => vi.unstubAllGlobals());

  async function ready() {
    const service = await import('../updateService');
    await service.checkForDesktopUpdate(true);
    expect(service.updateState.status).toBe('available');
    return service;
  }

  it('refuses an unsafe library before downloading or installing', async () => {
    const service = await ready();
    mocks.invoke.mockImplementation(async (command) => {
      if (command === 'validate_update_data_location') {
        throw { code: 'err.update.unsafe_data_location', message: 'unsafe' };
      }
      return false;
    });
    await service.downloadAndInstallDesktopUpdate();
    expect(service.updateState.status).toBe('failed');
    expect(mocks.download).not.toHaveBeenCalled();
    expect(mocks.install).not.toHaveBeenCalled();
    expect(mocks.relaunch).not.toHaveBeenCalled();
  });

  it('checks again after download and blocks installation if the path changed', async () => {
    const service = await ready();
    mocks.download.mockImplementation(async () => {
      mocks.invoke.mockRejectedValue({ code: 'err.update.unsafe_data_location', message: 'unsafe' });
    });
    await service.downloadAndInstallDesktopUpdate();
    expect(mocks.download).toHaveBeenCalledOnce();
    expect(mocks.install).not.toHaveBeenCalled();
    expect(mocks.relaunch).not.toHaveBeenCalled();
    expect(service.updateState.status).toBe('failed');
  });

  it('installs and restarts once when the data remains outside the bundle', async () => {
    const service = await ready();
    await Promise.all([service.downloadAndInstallDesktopUpdate(), service.downloadAndInstallDesktopUpdate()]);
    expect(mocks.invoke.mock.calls.filter(([command]) => command === 'validate_update_data_location')).toHaveLength(2);
    expect(mocks.download).toHaveBeenCalledOnce();
    expect(mocks.install).toHaveBeenCalledOnce();
    expect(mocks.relaunch).toHaveBeenCalledOnce();
  });
});
