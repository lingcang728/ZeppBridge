import { describe, expect, it, vi } from 'vitest';
import { objectTransform } from '../motion/dialogFlight';
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
  it('an object (the envelope) starts at the button: its centre on the button centre, its width the button width', () => {
    const panel = { left: 400, top: 200, width: 680, height: 600 };
    const subject = { left: 460, top: 260, width: 560, height: 380 };
    const button = { left: 1200, top: 20, width: 36, height: 36 };
    const t = objectTransform(button, panel, subject);
    const [, dx, dy, s] = /translate\((-?[\d.]+)px, (-?[\d.]+)px\) scale\(([\d.]+)\)/.exec(t)!.map(Number);
    expect(s).toBeCloseTo(36 / 560, 3);
    // 物件中心经过「绕面板中心缩放 + 平移」以后落在按钮中心。
    const c = { x: 740, y: 500 };
    const q = { x: 740, y: 450 };
    expect(c.x + s * (q.x - c.x) + dx).toBeCloseTo(1218, 0);
    expect(c.y + s * (q.y - c.y) + dy).toBeCloseTo(38, 0);
  });

  it('never enlarges past the real size', () => {
    const panel = { left: 0, top: 0, width: 100, height: 100 };
    expect(objectTransform({ left: 0, top: 0, width: 400, height: 400 }, panel)).toContain('scale(1.000)');
  });
});
