/**
 * 同步让路（重放 / 压缩）之后：界面能看出它在等，维护一做完就马上重跑，不再干等一分钟（10-13）。
 */
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { SyncOutcome, SyncReport } from '../../types';

const mocks = vi.hoisted(() => ({ outcome: 'deferred' as SyncOutcome, calls: 0 }));
vi.mock('../../lib/bridge', () => ({
  isDesktop: () => true,
  toUserMessage: () => 'error',
  backend: {
    getAppStatus: async () => ({ connection_state: 'connected', streams: [], last_cloud_sync_at: '2026-10-12T13:39:03Z' }),
    startIncrementalSync: async (): Promise<SyncReport> => {
      mocks.calls += 1;
      return {
        success: mocks.outcome === 'updated',
        outcome: mocks.outcome,
        started_at: '2026-10-13T02:19:28Z',
        finished_at: '2026-10-13T02:19:28Z',
        last_cloud_sync_at: '',
        total_records: 0,
        streams: [],
        message_code: mocks.outcome === 'deferred' ? 'err.sync.deferred_replay' : null,
      } as SyncReport;
    },
  },
}));
import { useSyncController } from '../useSyncController';
import { retryDeferredNow } from '../sync/run';

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal('window', { clearTimeout, setTimeout, clearInterval, setInterval });
  mocks.outcome = 'deferred';
  mocks.calls = 0;
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

it('says it is waiting, and re-runs the moment maintenance finishes instead of a minute later', async () => {
  const controller = useSyncController();
  await controller.runSync('incremental', undefined, { silent: true, waited: true });
  expect(controller.syncDeferred.value).toBe(true);
  expect(mocks.calls).toBe(1);

  mocks.outcome = 'updated';
  retryDeferredNow();
  await vi.waitFor(() => expect(controller.syncState.value).toBe('updated'));
  expect(controller.syncDeferred.value).toBe(false);
  expect(mocks.calls).toBe(2);

  // 兜底的一分钟定时器已经撤了：不会再跑第三次。
  await vi.advanceTimersByTimeAsync(61_000);
  expect(mocks.calls).toBe(2);
});

it('does nothing when no sync is waiting', async () => {
  retryDeferredNow();
  await vi.advanceTimersByTimeAsync(0);
  expect(mocks.calls).toBe(0);
});
