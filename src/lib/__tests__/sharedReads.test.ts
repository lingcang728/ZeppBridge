import { afterEach, describe, expect, it, vi } from 'vitest';
import { REUSE_MS, resetSharedReads, sharedCall, stateChanged } from '../bridge/sharedReads';

const reader = <T>(value: T) => vi.fn(() => Promise.resolve(value));

describe('shared read-only IPC (settings cards mounting together read once)', () => {
  afterEach(() => {
    resetSharedReads();
    vi.useRealTimers();
  });

  it('cards asking for the same thing at the same time share one call', async () => {
    const send = reader({ enabled: false });
    const [a, b] = await Promise.all([
      sharedCall('get_local_api_status', undefined, send),
      sharedCall('get_local_api_status', undefined, send),
    ]);
    expect(a).toEqual(b);
    expect(a).not.toBe(b); // 各拿一份，谁原地改都不影响另一张卡
    expect(send).toHaveBeenCalledTimes(1);
  });

  it('a write that finished in between means the next read goes to the backend (never shows pre-write state)', async () => {
    const read = reader({ enabled: false });
    await sharedCall('get_local_api_status', undefined, read);
    await sharedCall('set_local_api_enabled', { enabled: true }, reader({ enabled: true }));
    await sharedCall('get_local_api_status', undefined, read);
    expect(read).toHaveBeenCalledTimes(2);
  });

  it('a backend event, a different argument, an old result or a failure is not reused', async () => {
    vi.useFakeTimers();
    const status = reader({});
    await sharedCall('get_app_status', undefined, status);
    stateChanged();
    await sharedCall('get_app_status', undefined, status);
    expect(status).toHaveBeenCalledTimes(2);

    const estimate = reader({});
    await sharedCall('get_storage_estimate', { days: 30 }, estimate);
    await sharedCall('get_storage_estimate', { days: 90 }, estimate);
    expect(estimate).toHaveBeenCalledTimes(2);
    vi.advanceTimersByTime(REUSE_MS + 1);
    await sharedCall('get_storage_estimate', { days: 30 }, estimate);
    expect(estimate).toHaveBeenCalledTimes(3);

    const broken = vi.fn(() => Promise.reject(new Error('busy')));
    await expect(sharedCall('list_backups', undefined, broken)).rejects.toThrow('busy');
    await expect(sharedCall('list_backups', undefined, broken)).rejects.toThrow('busy');
    expect(broken).toHaveBeenCalledTimes(2);
  });

  it('commands outside the shared list always go through', async () => {
    const series = reader([]);
    await Promise.all([sharedCall('get_metric_series', { days: 7 }, series), sharedCall('get_metric_series', { days: 7 }, series)]);
    expect(series).toHaveBeenCalledTimes(2);
  });
});
