import { describe, expect, it, vi } from 'vitest';
import { runDetailBackfill } from '../workoutDetailBackfill';
import type { WorkoutDetailCoverage } from '../bridge/types';

const coverage = (ready: number, persisted = 0): WorkoutDetailCoverage => ({
  pending: ready, persisted, empty_from_cloud: 0, request_failed: 0,
  parse_failed: 0, unavailable: 0, ready,
});
const options = () => ({
  retry: false, shouldStop: () => false,
  onProgress: vi.fn(), betweenBatches: vi.fn(async () => {}),
});

describe('bounded workout detail backfill', () => {
  it('ends on a queue with no eligible records even if another channel has pending records', async () => {
    const fetchBatch = vi.fn(async () => ({ ...coverage(0), pending: 90, unavailable: 90 }));
    expect(await runDetailBackfill({ ...options(), fetchBatch })).toBe('complete');
    expect(fetchBatch).toHaveBeenCalledTimes(1);
  });

  it('stops unchanged coverage instead of repeatedly requesting an unserviceable queue', async () => {
    const fetchBatch = vi.fn(async () => coverage(40));
    expect(await runDetailBackfill({ ...options(), fetchBatch })).toBe('stalled');
    expect(fetchBatch).toHaveBeenCalledTimes(2);
  });

  it('continues progress and only retries failures in the first batch', async () => {
    const fetchBatch = vi.fn().mockResolvedValueOnce(coverage(20, 20)).mockResolvedValueOnce(coverage(0, 40));
    expect(await runDetailBackfill({ ...options(), retry: true, fetchBatch })).toBe('complete');
    expect(fetchBatch.mock.calls).toEqual([[true], [false]]);
  });

  it('does not start another batch after stopping during an active request', async () => {
    let stopped = false;
    const fetchBatch = vi.fn(async () => { stopped = true; return coverage(20, 20); });
    const config = { ...options(), fetchBatch, shouldStop: () => stopped };
    expect(await runDetailBackfill(config)).toBe('stopped');
    expect(fetchBatch).toHaveBeenCalledTimes(1);
    expect(config.onProgress).toHaveBeenCalledOnce();
    expect(config.betweenBatches).not.toHaveBeenCalled();
  });

  it('does not start after unmounting or stopping between batches', async () => {
    const fetchBatch = vi.fn(async () => coverage(20));
    expect(await runDetailBackfill({ ...options(), fetchBatch, shouldStop: () => true })).toBe('stopped');
    expect(fetchBatch).not.toHaveBeenCalled();
  });

  it('bounds a queue that continues growing while the user task runs', async () => {
    let count = 1;
    const fetchBatch = vi.fn(async () => coverage(count++, count));
    expect(await runDetailBackfill({ ...options(), fetchBatch, maxBatches: 3 })).toBe('limit');
    expect(fetchBatch).toHaveBeenCalledTimes(3);
  });

  it('surfaces backend failures without launching more requests', async () => {
    const fetchBatch = vi.fn(async () => { throw new Error('network'); });
    await expect(runDetailBackfill({ ...options(), fetchBatch })).rejects.toThrow('network');
    expect(fetchBatch).toHaveBeenCalledTimes(1);
  });
});
