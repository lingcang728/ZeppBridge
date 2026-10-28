import { describe, expect, it } from 'vitest';
import { deckDepth, deckMover, deckNext, deckPose, DECK_POSE, dragPose, isHorizontalDrag, poseFromMatrix, releaseSide } from '../journal/pbDeck';
import { turnKeyframes, turnPose, type Pose } from '../letters/turn';

describe('PB 牌叠', () => {
  it('层次：最上面是 0，往后依次加一，绕一圈回来', () => {
    expect([0, 1, 2].map((i) => deckDepth(i, 0, 3))).toEqual([0, 1, 2]);
    expect([0, 1, 2].map((i) => deckDepth(i, 1, 3))).toEqual([2, 0, 1]);
    expect([0, 1, 2].map((i) => deckDepth(i, 2, 3))).toEqual([1, 2, 0]);
    expect(deckDepth(0, 0, 1)).toBe(0);
    expect(deckDepth(0, 0, 0)).toBe(0);
    // 更深的都摆成最后一层。
    expect(deckPose(2, 0, 3)).toBe(DECK_POSE[2]);
  });

  it('循环：往左甩顶牌落底，往右甩最底那张盖上来，左右各甩一次回到原样', () => {
    expect(deckNext(0, 3, -1)).toBe(1);
    expect(deckNext(2, 3, -1)).toBe(0);
    expect(deckNext(0, 3, 1)).toBe(2);
    expect(deckNext(1, 3, 1)).toBe(0);
    for (let top = 0; top < 3; top += 1) expect(deckNext(deckNext(top, 3, -1), 3, 1)).toBe(top);
    // 往左动的是原来的顶牌（它落到最底）；往右动的是原来最底那张（它变成顶牌）。
    expect(deckMover(0, 3, -1)).toBe(0);
    expect(deckMover(0, 3, 1)).toBe(2);
    expect(deckDepth(deckMover(0, 3, 1), 0, 3)).toBe(2);
    expect(deckDepth(deckMover(0, 3, -1), deckNext(0, 3, -1), 3)).toBe(2);
  });

  it('拖动门槛同信纸：横向超 8px 且横向占优', () => {
    expect(isHorizontalDrag(8, 0)).toBe(false);
    expect(isHorizontalDrag(9, 0)).toBe(true);
    expect(isHorizontalDrag(-20, 14)).toBe(true);
    expect(isHorizontalDrag(-20, 15)).toBe(false);
  });

  it('松手：位移超 70 或速度超 0.6 才换牌，否则弹回', () => {
    expect(releaseSide(-71, 0)).toBe(-1);
    expect(releaseSide(71, 0)).toBe(1);
    expect(releaseSide(-70, -0.6)).toBe(0);
    expect(releaseSide(-20, -0.7)).toBe(-1);
    expect(releaseSide(20, 0.7)).toBe(1);
    expect(releaseSide(40, 0.2)).toBe(0);
  });

  it('拖着的顶牌：往左上抬一点、往拖的方向转', () => {
    const p = dragPose(-100, 200);
    expect(p.x).toBe(-100);
    expect(p.y).toBeLessThan(0);
    expect(p.r).toBeLessThan(0);
    expect(dragPose(50, 200).y).toBe(0);
  });

  it('从计算样式读回位置和转角', () => {
    const r = (12 * Math.PI) / 180;
    const pose = poseFromMatrix(`matrix(${Math.cos(r)}, ${Math.sin(r)}, ${-Math.sin(r)}, ${Math.cos(r)}, -40.5, 7)`);
    expect(pose.x).toBeCloseTo(-40.5);
    expect(pose.y).toBeCloseTo(7);
    expect(pose.r).toBeCloseTo(12);
    expect(poseFromMatrix('none')).toEqual({ x: 0, y: 0, r: 0 });
  });
});

describe('翻牌路径的方向', () => {
  const W = 220;
  const H = 150;
  const a: Pose = { x: 0, y: 0, r: 0 };
  const b: Pose = { x: 3, y: 5, r: 1.2 };

  it('不传 side 和传 −1 完全一样（信纸不受影响）', () => {
    expect(turnKeyframes(a, b, W, H, '5', '0')).toEqual(turnKeyframes(a, b, W, H, '5', '0', -1));
  });

  it('往右是往左的镜像：最远处在整沓右边，转角反过来', () => {
    const zero: Pose = { x: 0, y: 0, r: 0 };
    for (const s of [0.2, 0.5, 0.8]) {
      const left = turnPose(s, zero, zero, W, H);
      const right = turnPose(s, zero, zero, W, H, 1);
      expect(right.x).toBeCloseTo(-left.x);
      expect(right.y).toBeCloseTo(left.y);
      expect(right.r).toBeCloseTo(-left.r);
    }
    expect(turnPose(0.5, a, b, W, H, 1).x).toBeGreaterThan(W);
    const frames = turnKeyframes(b, a, W, H, '0', '5', 1);
    expect(frames[0]!.transform).toBe('translate(3.00px, 5.00px) rotate(1.200deg)');
    expect(frames[frames.length - 1]!.transform).toMatch(/^translate\(-?0\.00px, -?0\.00px\) rotate\(-?0\.000deg\)$/);
  });
});
