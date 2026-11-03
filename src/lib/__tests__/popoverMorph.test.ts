import { describe, expect, it } from 'vitest';
import { SPRINGS, springCurve } from '../motion/cards/spring';
import { elastic, popoverFrames, reachable, releaseVelocity, rubberBand, shouldDismiss, springBack } from '../motion/popoverMorph';

describe('popover window morph', () => {
  const button = { left: 300, top: 100, width: 30, height: 30 };
  const panel = { left: 200, top: 138, width: 340, height: 260 };

  it('starts exactly on the button, ends on the panel with the shadow let out, and keeps one radius', () => {
    const open = popoverFrames(button, panel, panel, 22, 64);
    expect(open[0].transform).toBe('translate(100px, -38px)');
    expect(open[0].clipPath).toBe('inset(0px 310px 230px 0px round 22px)');
    expect(open[open.length - 1].transform).toBe('translate(0px, 0px)');
    expect(open[open.length - 1].clipPath).toBe('inset(-64px -64px -64px -64px round 22px)');
    // 0.9 那一帧还在板里：圆弧最后才推出去。
    expect(String(open[2].clipPath)).not.toContain('-');
    for (const frame of open) {
      expect(String(frame.clipPath)).toMatch(/round 22px\)$/);
      expect(String(frame.transform)).not.toContain('scale');
    }
  });

  it('closes back onto the button from a dragged-away panel', () => {
    const dragged = { ...panel, left: panel.left + 40, top: panel.top + 90 };
    const close = popoverFrames(dragged, button, dragged);
    expect(close[0].transform).toBe('translate(0px, 0px)');
    expect(close[close.length - 1].transform).toBe('translate(60px, -128px)');
    expect(close[close.length - 1].clipPath).toBe('inset(0px 310px 230px 0px round 22px)');
  });

  it('only shrinks into a button that is still on screen', () => {
    const view = { width: 1280, height: 800 };
    expect(reachable(button, view)).toBe(true);
    expect(reachable({ ...button, top: -60 }, view)).toBe(false);
    expect(reachable({ ...button, width: 0 }, view)).toBe(false);
    expect(reachable(null, view)).toBe(false);
  });
});

describe('popover drag', () => {
  it('rubber-bands past the window edges and never passes the limit', () => {
    expect(elastic(50, -100, 100)).toBe(50);
    expect(elastic(160, -100, 100)).toBeCloseTo(100 + 60 / 1.5);
    expect(elastic(-10_000, -100, 100)).toBeGreaterThan(-220);
    expect(rubberBand(-30)).toBe(-rubberBand(30));
  });

  it('reads the release speed from the last ~80ms only', () => {
    const samples = [{ t: 0, x: 0, y: 0 }, { t: 400, x: 0, y: 10 }, { t: 440, x: 0, y: 30 }, { t: 480, x: 0, y: 70 }];
    expect(releaseVelocity(samples).y).toBeCloseTo(60 / 80);
    expect(releaseVelocity(samples, 490).y).toBeCloseTo(60 / 80);
    // 停住 150ms 才松手：不算甩。
    expect(releaseVelocity(samples, 630)).toEqual({ x: 0, y: 0 });
    expect(releaseVelocity([{ t: 0, x: 0, y: 0 }])).toEqual({ x: 0, y: 0 });
  });

  it('dismisses on a long pull or a fast downward flick, not on an upward one', () => {
    expect(shouldDismiss(141, 0)).toBe(true);
    expect(shouldDismiss(20, 1.2)).toBe(true);
    expect(shouldDismiss(-200, -2)).toBe(false);
    expect(shouldDismiss(100, 0.5)).toBe(false);
  });

  it('springs back within 600ms, overshooting outward only when flung outward', () => {
    const still = springBack(SPRINGS.settle, { x: 0, y: 80 }, { x: 0, y: 0 });
    expect(still).toEqual(springCurve(SPRINGS.settle));
    expect(still.duration).toBeLessThanOrEqual(600);
    const outward = springBack(SPRINGS.settle, { x: 0, y: 80 }, { x: 0, y: 0.6 });
    const values = outward.easing.slice(7, -1).split(', ').map(Number);
    expect(Math.min(...values)).toBeLessThan(0);
    expect(values[values.length - 1]).toBe(1);
    expect(outward.duration).toBeLessThanOrEqual(600);
  });
});
