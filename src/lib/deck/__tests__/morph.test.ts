import { describe, expect, it } from 'vitest';
import { coverPoseOf, staggerOrder, unscaledBox } from '../morph';

describe('coverPoseOf', () => {
  it('reads back the pose DeckCoverflow writes into style.transform', () => {
    expect(coverPoseOf('translate3d(calc(-50% + 236.5px), -50%, -120px) rotateY(-38deg) scale(0.86)'))
      .toEqual({ x: 236.5, y: 0, z: -120, rotate: -38, scale: 0.86 });
  });
  it('handles the centre card and a negative offset', () => {
    expect(coverPoseOf('translate3d(calc(-50% - 12px), -50%, 0px) rotateY(0deg) scale(1)'))
      .toEqual({ x: -12, y: 0, z: 0, rotate: 0, scale: 1 });
  });
  it('returns null for a card that is not posed (list mode)', () => {
    expect(coverPoseOf('')).toBeNull();
    expect(coverPoseOf('none')).toBeNull();
  });
});

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
