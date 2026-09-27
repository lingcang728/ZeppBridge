import { describe, expect, it } from 'vitest';
import { COVER_VISIBLE, coverflowPose } from '../coverflow';

describe('coverflowPose', () => {
  it('stands the centre card upright and sharp', () => {
    const pose = coverflowPose(0, 400);
    expect(pose).toMatchObject({ x: 0, rotate: 0, scale: 1, blur: 0, opacity: 1 });
  });

  it('turns the two sides toward the centre, mirror images of each other', () => {
    const left = coverflowPose(-1, 400);
    const right = coverflowPose(1, 400);
    expect(left.x).toBe(-right.x);
    expect(left.rotate).toBe(-right.rotate);
    // 右边的卡转向左边（负角），面朝正中那张。
    expect(right.rotate).toBeLessThan(0);
    expect(left.zIndex).toBe(right.zIndex);
  });

  it('stacks cards beyond the first tightly instead of spreading them out', () => {
    const firstGap = coverflowPose(1, 400).x - coverflowPose(0, 400).x;
    const nextGap = coverflowPose(2, 400).x - coverflowPose(1, 400).x;
    expect(nextGap).toBeLessThan(firstGap / 3);
  });

  it('hides cards past the visible depth so they cannot be clicked', () => {
    expect(coverflowPose(COVER_VISIBLE, 400).opacity).toBe(0);
    expect(coverflowPose(2, 400).opacity).toBeGreaterThan(0);
  });
});
