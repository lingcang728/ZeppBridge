import { describe, expect, it } from 'vitest';
import { failedStreamKeys, isCancelledSyncError, isDeferredSyncError } from '../syncDeferred';

describe('failedStreamKeys', () => {
  it('只把真正 Failed 的流算进失败名单，unavailable / unverified 保持中性', () => {
    expect(failedStreamKeys([
      { stream: 'heart_rate', status: 'success' },
      { stream: 'sleep', status: 'failed' },
      { stream: 'hrv', status: 'unavailable' },
      { stream: 'wellness', status: 'unverified' },
    ])).toEqual(['sleep']);
  });
});

describe('isDeferredSyncError', () => {
  it('Busy 和本地维护都算 deferred，好让界面自动重试而不是红条', () => {
    expect(isDeferredSyncError({ code: 'err.sync.deferred_replay' })).toBe(true);
    expect(isDeferredSyncError({ code: 'err.sync.deferred_compaction' })).toBe(true);
    expect(isDeferredSyncError({ code: 'err.sync.deferred_busy' })).toBe(true);
    expect(isDeferredSyncError({ code: 'err.core.busy' })).toBe(true);
    expect(isDeferredSyncError({ code: 'err.sync.not_connected' })).toBe(false);
    expect(isDeferredSyncError('busy')).toBe(false);
  });
});

describe('isCancelledSyncError', () => {
  it('只认后端的取消码', () => {
    expect(isCancelledSyncError({ code: 'err.core.cancelled' })).toBe(true);
    expect(isCancelledSyncError({ code: 'err.sync.deferred_busy' })).toBe(false);
  });
});
