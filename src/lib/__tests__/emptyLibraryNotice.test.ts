import { describe, expect, it } from 'vitest';
import { emptyLibraryNotice } from '../emptyLibraryNotice';
import type { AppStatus } from '../../types';

const status = (patch: Partial<AppStatus>): AppStatus => ({
  configured: true,
  auth_state: 'verified',
  connection_state: 'connected',
  streams: [],
  capabilities: [],
  retention_days: 0,
  ...patch,
} as AppStatus);

describe('库是空的时候该说哪一句', () => {
  it('库里有数据就什么都不说', () => {
    expect(emptyLibraryNotice(status({
      coverage: { earliest_day: '2026-01-01', latest_day: '2026-08-01', covered_days: 200 },
    }))).toBe('none');
  });

  it('状态还没读回来时不猜——空状态不等于空库', () => {
    expect(emptyLibraryNotice(null)).toBe('none');
    expect(emptyLibraryNotice(undefined)).toBe('none');
  });

  it('还没同步过，「先同步一次」是对的', () => {
    expect(emptyLibraryNotice(status({}))).toBe('never_synced');
  });

  it('同步失败过不算跑通——那有它自己的报错，不该在这里再解释一遍', () => {
    expect(emptyLibraryNotice(status({
      last_cloud_sync_at: '2026-09-01T00:00:00Z',
      last_cloud_sync_outcome: 'failed',
    }))).toBe('never_synced');
  });

  it('同步跑通了库还是空的，就不能再让人「先同步一次」', () => {
    for (const outcome of ['updated', 'no_new_data'] as const) {
      expect(emptyLibraryNotice(status({
        last_cloud_sync_at: '2026-09-01T00:00:00Z',
        last_cloud_sync_outcome: outcome,
      }))).toBe('synced_empty');
    }
  });

  it('区域是猜出来的，就先说区域——它是「同步成功却什么都没有」最可能的原因', () => {
    expect(emptyLibraryNotice(status({
      last_cloud_sync_at: '2026-09-01T00:00:00Z',
      last_cloud_sync_outcome: 'no_new_data',
      region_confidence: 'unconfirmed',
    }))).toBe('synced_empty_unconfirmed_region');
  });

  it('区域有据可依时不拿区域说事', () => {
    for (const confidence of ['identified', 'hinted', 'unknown'] as const) {
      expect(emptyLibraryNotice(status({
        last_cloud_sync_at: '2026-09-01T00:00:00Z',
        last_cloud_sync_outcome: 'updated',
        region_confidence: confidence,
      }))).toBe('synced_empty');
    }
  });
});
