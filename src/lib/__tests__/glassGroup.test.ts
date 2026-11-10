import { describe, expect, it } from 'vitest';
import { bridgeRect, gapBetween, groupState, lensSpan, mergeAmount, poseStyle, RESTING, springFrames, stretchPose, unionRect } from '../glassGroup';
import { squash } from '../segmentGlass';

/*
 * D1 只是把胶囊 / 滚轮里散着的几何收进一份状态，外观不变：下面几条把搬家前的数值钉住。
 */
describe('姿态与原来的样式一致', () => {
  it('没拉长时不写缩放', () => {
    expect(poseStyle(stretchPose(0, 300))).toEqual({});
    expect(stretchPose(0, 300, true).active).toBe(true);
  });

  it('往左拉钉右端、往右拉钉左端，缩放和以前同一个式子', () => {
    expect(poseStyle(stretchPose(-12, 300))).toEqual({ scale: squash(1 + 12 / 300), transformOrigin: 'right center' });
    expect(poseStyle(stretchPose(9, 300))).toEqual({ scale: squash(1 + 9 / 300), transformOrigin: 'left center' });
    // 宽度为 0 时按 1 算，不出 Infinity。
    expect(stretchPose(5, 0).sx).toBe(6);
  });
});

describe('springFrames', () => {
  it('没拉长也没甩、或者宽度为 0：不弹', () => {
    expect(springFrames(0, 0, 300)).toBeNull();
    expect(springFrames(10, 0, 0)).toBeNull();
  });

  it('只是松手：三帧、460ms，回到 1', () => {
    const spring = springFrames(-15, 0, 300)!;
    expect(spring.duration).toBe(460);
    expect(spring.frames).toHaveLength(3);
    expect(spring.frames[0]).toMatchObject({ scale: squash(1 + 15 / 300), transformOrigin: 'right center' });
    expect(spring.frames[spring.frames.length - 1]).toEqual({ scale: '1 1', transformOrigin: 'right center' });
  });

  it('大力一甩：多冲一帧、560ms，往回收的量是冲过头的三成', () => {
    const spring = springFrames(0, 0.03, 300)!;
    expect(spring.duration).toBe(560);
    expect(spring.frames).toHaveLength(4);
    expect(spring.frames[1]).toMatchObject({ scale: squash(1.03), offset: 0.26, transformOrigin: 'left center' });
    expect(spring.frames[2]).toMatchObject({ scale: squash(1 - 0.03 * 0.3), offset: 0.62 });
  });
});

describe('lensSpan', () => {
  it('在相邻两项之间插值，两端夹住', () => {
    expect(lensSpan([40, 80, 60], 0.5, false)).toBe(60);
    expect(lensSpan([40, 80, 60], 5, false)).toBe(60);
    expect(lensSpan([40, 80, 60], -1, false)).toBe(40);
    expect(lensSpan([], 1, false)).toBe(0);
  });

  it('循环时首尾相接', () => {
    expect(lensSpan([40, 80, 60], 2.5, true)).toBe(50);
    expect(lensSpan([40, 80, 60], -0.5, true)).toBe(50);
  });
});

describe('成组', () => {
  const a = { x: 0, y: 0, w: 100, h: 40 };

  it('空隙：分开为正、贴着为 0、重叠为负', () => {
    expect(gapBetween(a, { x: 130, y: 0, w: 50, h: 40 })).toBe(30);
    expect(gapBetween(a, { x: 100, y: 0, w: 50, h: 40 })).toBe(0);
    expect(gapBetween(a, { x: 90, y: 0, w: 50, h: 40 })).toBe(-10);
    expect(gapBetween(a, { x: 103, y: 44, w: 10, h: 10 })).toBe(5);
  });

  it('并拢程度：远了 0、贴上 1、中间平滑', () => {
    expect(mergeAmount(30, 24)).toBe(0);
    expect(mergeAmount(0, 24)).toBe(1);
    expect(mergeAmount(-5, 24)).toBe(1);
    expect(mergeAmount(12, 24)).toBeCloseTo(0.5);
    expect(mergeAmount(18, 24)).toBeLessThan(0.25);
  });

  it('整体状态：并集外框、任一成员浮起即算浮起', () => {
    expect(unionRect([])).toBeNull();
    const state = groupState([
      { id: 'a', rect: a, pose: RESTING },
      { id: 'b', rect: { x: 104, y: 0, w: 60, h: 40 }, pose: { ...RESTING, active: true } },
      { id: 'c', rect: null, pose: RESTING },
    ], 24);
    expect(state.active).toBe(true);
    expect(state.merged).toBe(true);
    expect(state.union).toEqual({ x: 0, y: 0, w: 164, h: 40 });
    expect(groupState([{ id: 'a', rect: a, pose: RESTING }], 24)).toMatchObject({ active: false, amount: 0, merged: false });
  });
});

describe('bridgeRect（D2 的颈）', () => {
  const pill = { x: 200, y: 0, w: 120, h: 36 };

  it('竖着：放在横向重叠段的中间，两端各伸进 8px', () => {
    const tip = { x: 100, y: 46, w: 380, h: 90 };
    expect(bridgeRect(pill, tip, 'y', 24)).toEqual({ x: 246, y: 28, w: 28, h: 26 });
    // 谁在上谁在下无所谓。
    expect(bridgeRect(tip, pill, 'y', 24)).toEqual({ x: 246, y: 28, w: 28, h: 26 });
  });

  it('横着：粗细取较矮那块的一半', () => {
    const saved = { x: 330, y: 2, w: 90, h: 32 };
    expect(bridgeRect(pill, saved, 'x', 24)).toEqual({ x: 312, y: 10, w: 26, h: 16 });
  });

  it('隔太远、换了行、另一个方向不重叠：没有颈', () => {
    expect(bridgeRect(pill, { x: 360, y: 0, w: 60, h: 36 }, 'x', 24)).toBeNull();
    expect(bridgeRect(pill, { x: 0, y: 50, w: 90, h: 36 }, 'x', 24)).toBeNull();
    expect(bridgeRect(pill, { x: 0, y: 46, w: 100, h: 36 }, 'y', 24)).toBeNull();
  });
});
