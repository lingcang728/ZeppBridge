import { describe, expect, it } from 'vitest';
import { cardFrame, flightOffset, morphFrames, peekBox, shownRect, staggerOrder, unscaledBox } from '../morph';

describe('staggerOrder', () => {
  it('leaves from the centre outwards, wrapping around the deck', () => {
    const order = staggerOrder(['a', 'b', 'c', 'd', 'e'], 'a');
    expect(order.get('a')).toBe(0);
    // b 和 e 都离 a 一格（首尾相接），按原顺序先 b 后 e。
    expect(order.get('b')).toBe(1);
    expect(order.get('e')).toBe(2);
  });
  it('reverses for putting the cards back', () => {
    const order = staggerOrder(['a', 'b', 'c'], 'b', true);
    expect(order.get('b')).toBe(2);
  });
});

describe('unscaledBox', () => {
  it('undoes a scale about the top-centre origin', () => {
    const origin = { x: 500, y: 100 };
    // 原大时 (400, 300) 宽 200：缩到 0.9 后在 (410, 280) 宽 180。
    expect(unscaledBox({ left: 410, top: 280, width: 180, height: 90 }, origin, 0.9)).toEqual({
      left: 400, top: 300, width: 200, height: 100,
    });
  });
});

describe('peekBox', () => {
  const card = { left: 100, top: 200, width: 760, height: 184 };
  it('keeps only the strip above the next card (the 106px under it is covered)', () => {
    expect(peekBox(card, 278)).toEqual({ left: 100, top: 200, width: 760, height: 78 });
  });
  it('keeps the whole card when it is the last one or nothing covers it', () => {
    expect(peekBox(card, null)).toEqual(card);
    expect(peekBox(card, 400)).toEqual(card);
  });
});

describe('shownRect', () => {
  it('bleeds on every side when the whole card is on screen', () => {
    expect(shownRect({ left: 100, top: 120, width: 900, height: 500 }, 1000, 100))
      .toEqual({ left: 0, top: 20, width: 1100, height: 700 });
  });
  it('stops at the viewport where the card runs off it', () => {
    expect(shownRect({ left: 100, top: 120, width: 900, height: 1400 }, 1000, 100))
      .toEqual({ left: 0, top: 20, width: 1100, height: 980 });
  });
});

describe('cardFrame / morphFrames', () => {
  const card = { left: 80, top: 140, width: 900, height: 1200 };
  it('first frame is exactly the small card: content anchored at its corner, clipped to it', () => {
    const from = { rect: { left: 150, top: 400, width: 760, height: 78 }, anchor: { x: 150, y: 400 } };
    expect(cardFrame(from, card, 26)).toEqual({
      transform: 'translate(70px, 260px)',
      clipPath: 'inset(0px 140px 1122px 0px round 26px)',
    });
  });
  it('last frame of opening is the card in place with the shadow bleed', () => {
    const to = { rect: shownRect(card, 1000, 100), anchor: { x: 80, y: 140 } };
    expect(cardFrame(to, card, 26)).toEqual({
      transform: 'translate(0px, 0px)',
      clipPath: 'inset(-100px -100px 340px -100px round 26px)',
    });
  });
  it('keeps one radius through the whole morph (a changing radius drops off the compositor)', () => {
    const frames = morphFrames(
      { rect: { left: 150, top: 400, width: 760, height: 78 }, anchor: { x: 150, y: 400 } },
      { rect: shownRect(card, 1000), anchor: { x: 80, y: 140 } },
      card,
      26,
    );
    expect(frames).toHaveLength(3);
    expect(frames.every((frame) => String(frame.clipPath).endsWith('round 26px)'))).toBe(true);
    expect(frames[1].offset).toBe(0.5);
  });
});

describe('flightOffset', () => {
  it('moves the visual centre onto the target with a uniform scale about the layout origin', () => {
    const origin = { x: 500, y: 300 };
    const visual = { x: 560, y: 300 };
    const t = flightOffset({ x: 200, y: 100 }, origin, visual, 0.5);
    // 缩放后画面中心 = origin + t + k·(visual − origin)
    expect(origin.x + t.x + 0.5 * (visual.x - origin.x)).toBeCloseTo(200);
    expect(origin.y + t.y + 0.5 * (visual.y - origin.y)).toBeCloseTo(100);
  });
});
