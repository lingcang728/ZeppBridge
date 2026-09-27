/**
 * 「数据已备好」经过真正的 runSync：用户点的同步跑完会亮，后台自动同步不会，
 * 失败不会，进了交给 AI 就灭。纯转换规则的细节在 lib/__tests__/dataReady.test.ts。
 */
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { SyncOutcome, SyncReport } from '../../types';

const mocks = vi.hoisted(() => ({
  outcome: 'updated' as SyncOutcome,
  fail: false,
}));
vi.mock('../../lib/bridge', () => ({
  isDesktop: () => true,
  toUserMessage: () => 'error',
  backend: {
    getAppStatus: async () => ({
      connection_state: 'connected',
      streams: [],
      last_cloud_sync_at: '2026-09-26T08:00:00Z',
    }),
    startIncrementalSync: async (): Promise<SyncReport> => {
      if (mocks.fail) throw new Error('network');
      return {
        success: mocks.outcome !== 'failed',
        outcome: mocks.outcome,
        started_at: '2026-09-27T08:00:00Z',
        finished_at: '2026-09-27T08:01:00Z',
        last_cloud_sync_at: '2026-09-27T08:01:00Z',
        total_records: 42,
        streams: [],
      };
    },
  },
}));
import { useSyncController } from '../useSyncController';

beforeEach(() => {
  vi.stubGlobal('window', { clearTimeout, setTimeout, clearInterval, setInterval });
  mocks.outcome = 'updated';
  mocks.fail = false;
  useSyncController().pickUpReady();
});
afterEach(() => { vi.unstubAllGlobals(); });

it('lights up after a sync the user asked for, and goes out once picked up', async () => {
  const controller = useSyncController();
  await controller.runSync('incremental');
  expect(controller.dataReady.value).toMatchObject({ phase: 'ready', outcome: 'updated', records: 42 });
  controller.pickUpReady();
  expect(controller.dataReady.value.phase).toBe('idle');
});

it('stays dark after a background auto-sync', async () => {
  const controller = useSyncController();
  await controller.runSync('incremental', undefined, { silent: true });
  expect(controller.dataReady.value.phase).toBe('idle');
});

it('the launch sync is silent but awaited, so it lights up', async () => {
  const controller = useSyncController();
  await controller.runSync('incremental', undefined, { silent: true, waited: true });
  expect(controller.dataReady.value.phase).toBe('ready');
});

it('never says ready when the awaited sync failed or was cancelled', async () => {
  const controller = useSyncController();
  mocks.fail = true;
  await controller.runSync('incremental');
  expect(controller.dataReady.value.phase).toBe('idle');
  mocks.fail = false;
  mocks.outcome = 'cancelled';
  await controller.runSync('incremental');
  expect(controller.dataReady.value.phase).toBe('idle');
});
