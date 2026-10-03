import { afterEach, describe, expect, it, vi } from 'vitest';
import { dataRevision } from '../../composables/sync/state';
import { cached, peek, peekAll, resetReadCache } from '../readCache';

const query = <T>(key: string, value: T) => ({ key, fetch: vi.fn(() => Promise.resolve(value)) });

describe('detail-page read cache (preloaded data must be the data the page shows)', () => {
  afterEach(() => {
    resetReadCache();
    dataRevision.value = 0;
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
});
