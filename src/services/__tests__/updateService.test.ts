import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ invoke: vi.fn(), listen: vi.fn() }));
vi.mock('@tauri-apps/api/core', () => ({ invoke: mocks.invoke }));
vi.mock('@tauri-apps/api/event', () => ({ listen: mocks.listen }));
vi.mock('@tauri-apps/api/app', () => ({ getVersion: async () => '3.0.0-beta.61' }));

const view = (over: Record<string, unknown> = {}) => ({
  phase: 'idle', version: null, notes: null, date: null, downloaded: 0, total: null,
  waiting_for_sync: false, portable: true, error_code: null, ...over,
});

describe('silent update', () => {
  let push: ((event: { payload: unknown }) => void) | null = null;

  beforeEach(() => {
    vi.resetModules();
    vi.resetAllMocks();
    push = null;
    vi.stubGlobal('window', { __TAURI_INTERNALS__: {}, navigator: { languages: ['en'] } });
    mocks.listen.mockImplementation(async (_event: string, handler: (event: { payload: unknown }) => void) => {
      push = handler;
      return () => undefined;
    });
  });
  afterEach(() => vi.unstubAllGlobals());

  it('starts once on launch and follows the pushed state to ready', async () => {
    mocks.invoke.mockResolvedValue(view({ phase: 'checking' }));
    const service = await import('../updateService');
    await service.startDesktopUpdate();
    expect(mocks.invoke).toHaveBeenCalledWith('update_start', undefined);
    expect(service.updateState.phase).toBe('checking');

    push!({ payload: view({ phase: 'downloading', version: '3.0.0', downloaded: 25, total: 100 }) });
    expect(service.downloadRatio(service.updateState)).toBe(0.25);
    push!({ payload: view({ phase: 'ready', version: '3.0.0', downloaded: 100, total: 100 }) });
    expect(service.updateState.phase).toBe('ready');
    expect(mocks.listen).toHaveBeenCalledTimes(1);
  });

  it('draws no fake percentage when the size is unknown', async () => {
    const { downloadRatio } = await import('../updateService');
    expect(downloadRatio({ downloaded: 10, total: null })).toBeNull();
    expect(downloadRatio({ downloaded: 10, total: 0 })).toBeNull();
    expect(downloadRatio({ downloaded: 150, total: 100 })).toBe(1);
  });

  it('only applies a ready update and reports a failed swap in the interface language', async () => {
    mocks.invoke.mockResolvedValue(view({ phase: 'downloading' }));
    const service = await import('../updateService');
    await service.startDesktopUpdate();
    await service.applyDesktopUpdate();
    expect(mocks.invoke).not.toHaveBeenCalledWith('update_apply', undefined);

    push!({ payload: view({ phase: 'ready', version: '3.0.0' }) });
    mocks.invoke.mockRejectedValueOnce({ code: 'err.update.swap_failed', message: '替换程序文件失败' });
    await service.applyDesktopUpdate();
    expect(mocks.invoke).toHaveBeenCalledWith('update_apply', undefined);
    expect(service.updateState.applyError).not.toMatch(/[一-鿿]/);
    expect(service.updateState.applyError).not.toBe('');
  });

  it('does nothing inside the onboarding sandbox', async () => {
    vi.stubGlobal('window', {
      __TAURI_INTERNALS__: {}, navigator: { languages: ['en'] },
      __ZB_IPC__: { __zbDemo: true, invoke: vi.fn(), transformCallback: vi.fn() },
    });
    const service = await import('../updateService');
    await service.startDesktopUpdate();
    expect(mocks.invoke).not.toHaveBeenCalled();
    expect(service.updateState.phase).toBe('idle');
  });
});
