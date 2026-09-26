import { describe, expect, it } from 'vitest';
import { dragFrame, flingOutFrames, releaseDirection, wrapIndex } from '../physics';

describe('deck drag frame', () => {
  it('follows the pointer at 0.65x and clamps to 45% of the width', () => {
    expect(dragFrame({ dx: 100, dy: 0 }, 800).dx).toBe(65);
    expect(dragFrame({ dx: 2000, dy: 0 }, 800).dx).toBe(360);
    expect(dragFrame({ dx: 0, dy: -900 }, 800).dy).toBe(-130);
  });
  it('reaches full progress at 240px and never blurs with reduced motion', () => {
    expect(dragFrame({ dx: 240, dy: 0 }, 800).progress).toBe(1);
    expect(dragFrame({ dx: 240, dy: 0 }, 800, true).filter).toBe('none');
    expect(dragFrame({ dx: 120, dy: 0 }, 800).filter).toBe('blur(1.5px)');
  });
});

describe('deck release', () => {
  const base = { velocity: 0, sinceLastMove: 500, width: 800 };
  it('springs back below the distance threshold', () => {
    expect(releaseDirection({ ...base, dx: -80, dy: 0 })).toBe(0);
  });
  it('flips past the threshold: left means next, right means previous', () => {
    expect(releaseDirection({ ...base, dx: -120, dy: 0 })).toBe(1);
    expect(releaseDirection({ ...base, dx: 120, dy: 0 })).toBe(-1);
  });
  it('uses 18% of a narrow card as the threshold', () => {
    expect(releaseDirection({ ...base, width: 400, dx: -80, dy: 0 })).toBe(1);
  });
  it('treats a quick short flick as a flip', () => {
    expect(releaseDirection({ dx: -40, dy: 0, velocity: -0.9, sinceLastMove: 30, width: 800 })).toBe(1);
    // 同样的距离，松手前停了一下就不算甩。
    expect(releaseDirection({ dx: -40, dy: 0, velocity: -0.9, sinceLastMove: 300, width: 800 })).toBe(0);
  });
  it('follows the dominant axis for vertical drags', () => {
    expect(releaseDirection({ ...base, dx: 10, dy: -140 })).toBe(1);
    expect(releaseDirection({ ...base, dx: -10, dy: 140 })).toBe(-1);
  });
});

describe('deck order', () => {
  it('wraps around both ends', () => {
    expect(wrapIndex(8, 8)).toBe(0);
    expect(wrapIndex(-1, 8)).toBe(7);
    expect(wrapIndex(3, 0)).toBe(0);
  });
  it('throws the card away from the direction of travel', () => {
    const frames = flingOutFrames(1, 800, '');
    expect(String(frames[1].transform)).toContain('translate3d(-256px');
    expect(frames[2].opacity).toBe(0);
  });
});
