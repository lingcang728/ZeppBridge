import { describe, expect, it } from 'vitest';
import { cardFrame } from '../deck/morph';
import { arcMidpoint, bleedRect, steadyRadius, windowInset, windowPoses } from '../motion/window';

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

describe('windowPoses (page, backing plate and card copy share one set of keyframes)', () => {
  const card = { left: 700, top: 500, width: 200, height: 100 };
  const view = { left: 0, top: 0, width: 1000, height: 700 };
  const page = { left: 0, top: 60, width: 1000, height: 2400 };
  const from = { rect: card, anchor: { x: card.left, y: card.top } };
  const to = { rect: bleedRect(view, 20), anchor: { x: page.left, y: page.top } };

  it('starts on the card and ends on the page, with the page top-left riding from the card corner home', () => {
    const poses = windowPoses(from, to);
    expect(poses[0]).toEqual(from);
    expect(poses[poses.length - 1]).toEqual(to);
    expect(poses[1].anchor.y - card.top).toBeCloseTo((page.top - card.top) * 0.64);
    expect(poses[1].anchor.x - card.left).toBeCloseTo((page.left - card.left) * 0.5);
  });

  it('crops the real page to exactly the same on-screen rectangle as the plate at every keyframe', () => {
    for (const pose of windowPoses(from, to)) {
      const frame = cardFrame(pose, page, 20);
      const [tx, ty] = String(frame.transform).match(/-?[\d.]+/g)!.map(Number);
      const [top, right, bottom, left] = String(frame.clipPath).match(/-?[\d.]+(?=px)/g)!.map(Number);
      const shown = { left: page.left + tx + left, top: page.top + ty + top };
      expect(shown.left).toBeCloseTo(pose.rect.left, 1);
      expect(shown.top).toBeCloseTo(pose.rect.top, 1);
      expect(page.left + tx + page.width - right).toBeCloseTo(pose.rect.left + pose.rect.width, 1);
      expect(page.top + ty + page.height - bottom).toBeCloseTo(pose.rect.top + pose.rect.height, 1);
    }
  });
});
