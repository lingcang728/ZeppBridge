import { afterEach, describe, expect, it, vi } from 'vitest';
import { holdMotion, motionBusy, nextSlot, resetMotionBudget, stageMotion, whenMotionIdle } from '../motion/budget';

describe('motion budget (heavy work waits for the card ↔ page morph)', () => {
  afterEach(() => {
    vi.useRealTimers();
    resetMotionBudget();
    vi.unstubAllGlobals();
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

  it('keeps CSS motion active when the chart queue is released', () => {
    const dataset: Record<string, string> = {};
    vi.stubGlobal('document', { documentElement: { dataset } });
    const releaseHold = holdMotion();
    const releaseStage = stageMotion();
    releaseHold();
    expect(motionBusy.value).toBe(false);
    expect(dataset.motion).toBe('busy');
    releaseStage();
    expect(dataset.motion).toBeUndefined();
  });

  it('schedules exactly one frame when a slot enqueues another job', () => {
    const frames: FrameRequestCallback[] = [];
    vi.stubGlobal('requestAnimationFrame', (frame: FrameRequestCallback) => frames.push(frame));
    vi.stubGlobal('cancelAnimationFrame', () => undefined);
    const ran: number[] = [];
    nextSlot(() => { ran.push(1); nextSlot(() => ran.push(2)); });
    nextSlot(() => ran.push(3));
    frames.shift()!(0);
    expect(ran).toEqual([1]);
    expect(frames).toHaveLength(1);
    frames.shift()!(16);
    expect(ran).toEqual([1, 3]);
    frames.shift()!(32);
    expect(ran).toEqual([1, 3, 2]);
    expect(frames).toHaveLength(0);
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
