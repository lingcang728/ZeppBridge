import { describe, expect, it } from 'vitest';
import { arcMidpoint, bleedRect, steadyRadius, windowInset } from '../motion/window';

describe('windowInset', () => {
  const frame = { left: 0, top: 60, width: 1000, height: 700 };

  it('crops the window to the card it lands on', () => {
    const card = { left: 40, top: 120, width: 300, height: 180 };
    expect(windowInset(card, frame, 20)).toBe('inset(60px 660px 460px 40px round 20px)');
  });

  it('never goes negative when a card pokes outside the page', () => {
    expect(windowInset({ left: -10, top: 0, width: 200, height: 100 }, frame, 8)).toBe('inset(0px 810px 660px 0px round 8px)');
  });
});

describe('steady corner radius (clip-path stays on the compositor only if the radius never changes)', () => {
  const card = { left: 40, top: 120, width: 300, height: 180 };
  const page = { left: 0, top: 60, width: 1000, height: 700 };

  it('uses the card end radius for card <-> page, either way round', () => {
    expect(steadyRadius(card, 20, page, 0)).toBe(20);
    expect(steadyRadius(page, 0, card, 20)).toBe(20);
  });

  it('uses the smaller card radius for small card <-> big card', () => {
    expect(steadyRadius(card, 22, page, 34)).toBe(22);
    expect(steadyRadius(page, 34, card, 22)).toBe(22);
  });

  it('bleeds the page end out by one radius so the arcs leave the frame (square corners without animating the radius)', () => {
    expect(windowInset(bleedRect(page, 20), page, 20, true)).toBe('inset(-20px -20px -20px -20px round 20px)');
  });
});

describe('arcMidpoint', () => {
  const card = { left: 700, top: 500, width: 200, height: 100 };
  const page = { left: 0, top: 0, width: 1000, height: 700 };

  it('lets the vertical move lead the horizontal one, so the path bends', () => {
    const mid = arcMidpoint(card, page);
    // 水平刚好一半，竖直已经走了六成多
    expect(mid.left).toBe(350);
    expect(mid.width).toBe(600);
    expect(mid.top).toBeCloseTo(500 * (1 - 0.64));
    expect(mid.height).toBeCloseTo(100 + 600 * 0.64);
  });

  it('is symmetric in time: the same bend on the way back', () => {
    const mid = arcMidpoint(page, card);
    expect(mid.top).toBeCloseTo(500 * 0.64);
  });
});
