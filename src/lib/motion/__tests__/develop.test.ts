import { afterEach, describe, expect, it, vi } from 'vitest';
import { developWash, markDeveloped, resetDevelop, shouldDevelop } from '../develop';
import { motionTier } from '../tier';

describe('显影', () => {
  afterEach(() => {
    resetDevelop();
    motionTier.value = 'high';
    vi.unstubAllGlobals();
  });

  it('同一项只显影一次', () => {
    motionTier.value = 'high';
    expect(shouldDevelop('sleep:1')).toBe(true);
    markDeveloped('sleep:1');
    expect(shouldDevelop('sleep:1')).toBe(false);
    expect(shouldDevelop('sleep:2')).toBe(true);
  });

  it('低档机器不显影', () => {
    motionTier.value = 'low';
    expect(shouldDevelop('sleep:3')).toBe(false);
  });

  it('少动效不显影，薄纱立刻撤', () => {
    motionTier.value = 'high';
    vi.stubGlobal('document', { documentElement: { dataset: { effects: 'lite' } } });
    expect(shouldDevelop('sleep:4')).toBe(false);
    const done = vi.fn();
    const wash = { animate: vi.fn() } as unknown as HTMLElement;
    expect(developWash(wash, done)).toBeNull();
    expect(done).toHaveBeenCalledOnce();
    expect((wash as unknown as { animate: ReturnType<typeof vi.fn> }).animate).not.toHaveBeenCalled();
  });

  it('放完和取消都会撤薄纱', async () => {
    motionTier.value = 'high';
    const run = (outcome: 'finish' | 'cancel') => {
      let settle!: () => void, fail!: (e: unknown) => void;
      const finished = new Promise<void>((resolve, reject) => { settle = resolve; fail = reject; });
      const wash = { animate: vi.fn(() => ({ finished })) } as unknown as HTMLElement;
      const done = vi.fn();
      developWash(wash, done, 100);
      if (outcome === 'finish') settle(); else fail(new DOMException('aborted', 'AbortError'));
      return { done, finished: finished.catch(() => undefined) };
    };
    const a = run('finish'), b = run('cancel');
    await a.finished; await b.finished; await Promise.resolve();
    expect(a.done).toHaveBeenCalledOnce();
    expect(b.done).toHaveBeenCalledOnce();
  });
});
