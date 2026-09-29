import { describe, expect, it } from 'vitest';
import { stackOffsets, staggerDelays, unscaledBox } from '../morph';

describe('stackOffsets', () => {
  it('lifts every card onto the first one', () => {
    expect(stackOffsets([100, 178, 256])).toEqual([0, -78, -156]);
  });
});

describe('staggerDelays', () => {
  it('deals top-down and collects bottom-up', () => {
    expect(staggerDelays(3, 20)).toEqual([0, 20, 40]);
    expect(staggerDelays(3, 20, true)).toEqual([40, 20, 0]);
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
