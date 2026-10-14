import { afterEach, describe, expect, it, vi } from 'vitest';
import { dataRevision, streamRevisions, streamUpdate } from '../../composables/sync/state';
import { cached, forgetReads, peek, peekAll, resetReadCache } from '../readCache';

const query = <T>(key: string, value: T) => ({ key, fetch: vi.fn(() => Promise.resolve(value)) });

describe('detail-page read cache (preloaded data must be the data the page shows)', () => {
  afterEach(() => {
    resetReadCache();
    dataRevision.value = 0;
    streamRevisions.value = {};
    streamUpdate.value = { stream: '', revision: 0 };
  });

  it('a stream landing mid-sync only makes the queries that read it stale; a finished sync or a local write makes all stale', async () => {
    const sleep = { ...query('sleep_detail:1', 'night'), deps: ['sleep'] as const };
    const heart = query('heart', 60);
    await cached(sleep);
    await cached(heart);
    // 心率流落了新数据
    streamUpdate.value = { stream: 'heart_rate', revision: 1 };
    streamRevisions.value = { heart_rate: 1 };
    expect(peek(sleep)?.fresh).toBe(true);
    expect(peek(heart)?.fresh).toBe(false);
    // 睡眠流也落了
    streamRevisions.value = { heart_rate: 1, sleep: 1 };
    expect(peek(sleep)?.fresh).toBe(false);
    await cached(sleep);
    expect(sleep.fetch).toHaveBeenCalledTimes(2);
    dataRevision.value += 1;
    expect(peek(sleep)?.fresh).toBe(false);
  });

  it('reads once per data revision and hands the settled value to the next page mount', async () => {
    const heart = query('heart', [1, 2, 3]);
    await cached(heart);
    await cached(heart);
    expect(heart.fetch).toHaveBeenCalledTimes(1);
    expect(peek(heart)).toEqual({ value: [1, 2, 3], fresh: true });
  });

  it('after a sync lands, still hands out the last result at once (marked stale) and re-reads on the next load', async () => {
    const heart = query('heart', 64);
    await cached(heart);
    dataRevision.value += 1;
    expect(peek(heart)).toEqual({ value: 64, fresh: false });
    const reread = cached(heart);
    expect(peek(heart)).toEqual({ value: 64, fresh: false });
    await reread;
    expect(heart.fetch).toHaveBeenCalledTimes(2);
    expect(peek(heart)).toEqual({ value: 64, fresh: true });
  });

  it('does not keep failures (the next open retries) and only peeks a complete set', async () => {
    const broken = { key: 'broken', fetch: vi.fn(() => Promise.reject(new Error('busy'))) };
    await expect(cached(broken)).rejects.toThrow('busy');
    await expect(cached(broken)).rejects.toThrow('busy');
    expect(broken.fetch).toHaveBeenCalledTimes(2);
    const ok = query('ok', 'x');
    await cached(ok);
    expect(peekAll([ok, broken] as const)).toBeNull();
    expect(peekAll([ok] as const)).toEqual(['x']);
  });
  it('a background batch of far records does not push out the page that was just opened (least-recently-used eviction)', async () => {
    const opened = query('workout_detail:recent', 'recent');
    await cached(opened);
    for (let index = 0; index < 30; index += 1) await cached(query(`far:${index}`, index));
    expect(peek(opened)).not.toBeNull(); // 页面挂载时看了一眼：算用过，挪到队尾
    for (let index = 30; index < 70; index += 1) await cached(query(`far:${index}`, index));
    expect(peek(opened)?.value).toBe('recent');
    expect(peek(query('far:0', 0))).toBeNull();
  });

  it('never evicts a read that is still in flight, and forgets device reads on demand', async () => {
    let finish: (value: string) => void = () => undefined;
    const slow = { key: 'slow', fetch: vi.fn(() => new Promise<string>((resolve) => { finish = resolve; })) };
    const pending = cached(slow);
    for (let index = 0; index < 60; index += 1) await cached(query(`far:${index}`, index));
    finish('done');
    await pending;
    expect(peek(slow)?.value).toBe('done');
    const device = query('device_profile:zepp:1', { name: 'old' });
    await cached(device);
    forgetReads('device_profile:', 'workout_device:');
    expect(peek(device)).toBeNull();
  });
});
