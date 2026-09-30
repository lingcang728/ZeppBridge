import { describe, expect, it } from 'vitest';
import type { SyncOutcome, SyncReport } from '../../types';
import { IDLE, readyOnPickUp, readyOnReport, readyOnStart, type DataReady } from '../dataReady';

const report = (outcome: SyncOutcome, records = 12): SyncReport => ({
  success: outcome !== 'failed',
  outcome,
  started_at: '2026-09-27T08:00:00Z',
  finished_at: '2026-09-27T08:01:00Z',
  last_cloud_sync_at: '2026-09-27T08:01:00Z',
  total_records: records,
  streams: [],
});

const WAITING: DataReady = { phase: 'waiting' };

describe('dataReady', () => {
  it('only a sync the user is waiting for starts the countdown', () => {
    expect(readyOnStart(IDLE, true)).toEqual(WAITING);
    expect(readyOnStart(IDLE, false)).toBe(IDLE);
  });

  it('lights up when the awaited sync lands, including when nothing new came', () => {
    expect(readyOnReport(WAITING, report('updated', 30))).toMatchObject({ phase: 'ready', outcome: 'updated', records: 30 });
    expect(readyOnReport(WAITING, report('no_new_data', 0))).toMatchObject({ phase: 'ready', records: 0 });
    expect(readyOnReport(WAITING, report('partial'), ['heart_rate']))
      .toMatchObject({ phase: 'ready', outcome: 'partial', failedStreams: ['heart_rate'] });
  });

  it('keeps waiting through a deferred sync — the controller retries on its own', () => {
    expect(readyOnReport(WAITING, report('deferred', 0))).toEqual(WAITING);
  });

  it('never claims the data is ready after a failure, a cancel, or a sync that never ran', () => {
    expect(readyOnReport(WAITING, report('failed'))).toBe(IDLE);
    expect(readyOnReport(WAITING, report('cancelled'))).toBe(IDLE);
    expect(readyOnReport(WAITING, null)).toBe(IDLE);
  });

  it('a background sync neither lights it nor puts it out', () => {
    expect(readyOnReport(IDLE, report('updated'))).toBe(IDLE);
    const lit = readyOnReport(WAITING, report('updated'));
    expect(readyOnReport(lit, report('failed'))).toBe(lit);
    expect(readyOnStart(lit, false)).toBe(lit);
  });

  it('goes out once picked up, but picking up does not end a wait', () => {
    expect(readyOnPickUp(readyOnReport(WAITING, report('updated')))).toBe(IDLE);
    expect(readyOnPickUp(WAITING)).toEqual(WAITING);
  });

  it('marks the first sync that brought data, so the pill points to this week instead of AI', () => {
    expect(readyOnReport(WAITING, report('updated', 30), [], true)).toMatchObject({ phase: 'ready', firstRun: true });
    // 第一次同步但云端什么都没有：没有「这一周」可看，不当首次处理。
    expect(readyOnReport(WAITING, report('no_new_data', 0), [], true)).toMatchObject({ phase: 'ready', firstRun: false });
    expect(readyOnReport(WAITING, report('updated', 30))).toMatchObject({ firstRun: false });
    expect(readyOnReport(WAITING, report('failed'), [], true)).toBe(IDLE);
  });
});
