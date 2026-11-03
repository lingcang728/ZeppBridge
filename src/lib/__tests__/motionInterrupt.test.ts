import { describe, expect, it, vi } from 'vitest';
import { flightTransform, matchTransform } from '../motion/dialogFlight';
import { hurryAnimation, onMotionSkip, remainingMs, settleMotion, worthInterrupting } from '../motion/interrupt';

const fakeAnimation = (localTime: number, endTime: number, playbackRate = 1, playState = 'running') => ({
  playState,
  pending: false,
  playbackRate,
  effect: { getComputedTiming: () => ({ localTime, endTime }) },
}) as unknown as Animation;

describe('motion interrupt', () => {
  it('hurries replaceable CSS transitions synchronously without moving their current position', () => {
    class Transition {
      playState = 'running';
      pending = false;
      currentTime = 150;
      private rate = 1;
      get playbackRate() { return this.rate; }
      set playbackRate(rate: number) { this.rate = rate; this.currentTime = 0; }
      updatePlaybackRate = vi.fn();
      effect = { getComputedTiming: () => ({ localTime: this.currentTime, endTime: 600 }) };
    }
    vi.stubGlobal('CSSTransition', Transition);
    try {
      const transition = new Transition();
      hurryAnimation(transition as unknown as Animation, 90);
      expect(transition.playbackRate).toBe(5);
      expect(transition.currentTime).toBe(150);
      expect(transition.updatePlaybackRate).not.toHaveBeenCalled();
    } finally { vi.unstubAllGlobals(); }
  });

  it('measures what is left of a finite animation, ignoring loops and finished ones', () => {
    expect(remainingMs(fakeAnimation(100, 400))).toBe(300);
    expect(remainingMs(fakeAnimation(100, 400, 2))).toBe(150);
    expect(remainingMs(fakeAnimation(300, 400, -1))).toBe(300);
    expect(remainingMs(fakeAnimation(100, Infinity))).toBe(0);
    expect(remainingMs(fakeAnimation(100, 400, 1, 'finished'))).toBe(0);
  });

  it('ends waiting motions once and reports that something was interrupted', () => {
    let calls = 0;
    onMotionSkip(() => { calls += 1; });
    expect(settleMotion()).toBe(true);
    expect(settleMotion()).toBe(false);
    expect(calls).toBe(1);
  });

  it('does not treat looping decorations as motion to interrupt', () => {
    const loop = { effect: { getComputedTiming: () => ({ iterations: 3, activeDuration: 7200 }) } } as unknown as Animation;
    const morph = { effect: { getComputedTiming: () => ({ iterations: 1, activeDuration: 400 }) } } as unknown as Animation;
    expect(worthInterrupting(loop)).toBe(false);
    expect(worthInterrupting(morph)).toBe(true);
  });

  it('a forgotten waiter is not called', () => {
    let called = false;
    const forget = onMotionSkip(() => { called = true; });
    forget();
    settleMotion();
    expect(called).toBe(false);
  });
});

describe('dialog flight', () => {
  it('starts from the centre of the button, scaled by width within bounds', () => {
    const panel = { left: 400, top: 200, width: 560, height: 600 };
    const button = { left: 100, top: 900, width: 112, height: 36 };
    expect(flightTransform(button, panel)).toBe('translate(-524.0px, 418.0px) scale(0.200)');
    expect(flightTransform({ left: 670, top: 490, width: 20, height: 20 }, panel)).toBe('translate(0.0px, 0.0px) scale(0.120)');
  });

  it('a reopened dialog picks up exactly where the half-closed one is, without the scale clamp', () => {
    const panel = { left: 400, top: 200, width: 560, height: 600 };
    expect(matchTransform({ left: 414, top: 215, width: 532, height: 570 }, panel)).toBe('translate(0.0px, 0.0px) scale(0.950)');
    expect(matchTransform(panel, panel)).toBe('translate(0.0px, 0.0px) scale(1.000)');
  });
});
