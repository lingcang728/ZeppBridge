import { afterEach, expect, it, vi } from 'vitest';
import type { SyncProgress } from '../../types';

const mocks = vi.hoisted(() => ({ handlers: new Map<string, (value: SyncProgress) => void>() }));
vi.mock('../../lib/bridge', () => ({
  isDesktop: () => true,
  toUserMessage: () => 'error',
  backend: {
    getLoginStatus: async () => null,
    getAppStatus: async () => ({ connection_state: 'disconnected', streams: [] }),
    listen: async (name: string, callback: (value: SyncProgress) => void) => {
      mocks.handlers.set(name, callback);
      return () => mocks.handlers.delete(name);
    },
  },
}));
import { useSyncController } from '../useSyncController';

afterEach(() => { useSyncController().dispose(); vi.unstubAllGlobals(); });
it('publishes committed streams before the final report, including external backfills', async () => {
  vi.stubGlobal('window', { clearTimeout, setTimeout, clearInterval, setInterval });
  const controller = useSyncController();
  await controller.initialize();
  const original = controller.dataRevision.value;
  const handler = mocks.handlers.get('sync://progress')!;
  handler({ stream: 'heart_rate', current: 1, total: 8, message: '', completed: false });
  expect(controller.streamUpdate.value.revision).toBe(0);
  handler({ stream: 'heart_rate', current: 1, total: 8, message: '', completed: true });
  expect(controller.streamUpdate.value).toEqual({ stream: 'heart_rate', revision: 1 });
  expect(controller.dataRevision.value).toBe(original);
  handler({ stream: 'sleep', current: 3, total: 8, message: '', completed: true });
  expect(controller.streamUpdate.value).toEqual({ stream: 'sleep', revision: 2 });
  controller.dispose();
  expect(mocks.handlers.size).toBe(0);
});
