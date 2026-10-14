import { afterEach, describe, expect, it, vi } from 'vitest';
import { holdMotion, motionBusy, resetMotionBudget, whenMotionIdle } from '../motion/budget';

describe('motion budget (heavy work waits for the card ↔ page morph)', () => {
  afterEach(() => {
    vi.useRealTimers();
    resetMotionBudget();
  });

  it('resolves at once when nothing is morphing', async () => {
    expect(motionBusy.value).toBe(false);
    await expect(whenMotionIdle()).resolves.toBeUndefined();
  });

  it('waits for the last hold to be released, and releasing twice counts once', async () => {
    const a = holdMotion();
    const b = holdMotion();
    let idle = false;
    void whenMotionIdle().then(() => { idle = true; });
    a();
    a();
    await Promise.resolve();
    expect(idle).toBe(false);
    expect(motionBusy.value).toBe(true);
    b();
    await Promise.resolve();
    expect(idle).toBe(true);
    expect(motionBusy.value).toBe(false);
  });

  it('lets go by itself if a morph never releases (charts must not stay unmounted)', async () => {
    vi.useFakeTimers();
    holdMotion(500);
    let idle = false;
    void whenMotionIdle().then(() => { idle = true; });
    vi.advanceTimersByTime(500);
    await Promise.resolve();
    expect(idle).toBe(true);
  });
});
