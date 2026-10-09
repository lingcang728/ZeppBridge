import { describe, expect, it } from 'vitest';
import { DRAG_REACH, separation, stepCloud, type CloudBody } from '../cloudPhysics';

const card = { width: 100, height: 126 };
const body = (id: string, x: number, y: number, extra: Partial<CloudBody> = {}): CloudBody => ({ id, rest: { x, y }, d: { x: 0, y: 0 }, v: { x: 0, y: 0 }, ...extra });
const run = (bodies: CloudBody[], frames: number, bounds?: { x: number; y: number; width: number; height: number }) => {
  for (let i = 0; i < frames; i += 1) stepCloud(bodies, card, 1 / 60, bounds);
};
const at = (b: CloudBody) => ({ x: b.rest.x + b.d.x, y: b.rest.y + b.d.y });

describe('cloud physics', () => {
  it('counts diagonal neighbours as touching (corners used to stay overlapped)', () => {
    // 椭圆量法下这一对 r ≈ 1，角却叠在一起；超椭圆把它算进推的范围。
    expect(separation(82, 95, card.width * 1.14, card.height * 1.1, 1).r).toBeLessThan(1);
  });

  it('pulls two overlapping resting cards apart until their boxes no longer overlap', () => {
    const a = body('a', 0, 0);
    const b = body('b', 60, 70);
    run([a, b], 240);
    const pa = at(a), pb = at(b);
    expect(Math.abs(pa.x - pb.x) >= card.width - 1 || Math.abs(pa.y - pb.y) >= card.height - 1).toBe(true);
  });

  it('makes neighbours of the dragged card give way by a wide margin', () => {
    const held = body('held', 0, 0, { pinned: true, at: { x: 0, y: 0 } });
    const near = body('near', 110, 10);
    run([held, near], 240);
    expect(at(near).x - 0).toBeGreaterThan(card.width * (DRAG_REACH.x - 0.25));
  });

  it('keeps pushed cards inside the cloud bounds', () => {
    const held = body('held', 200, 0, { pinned: true, at: { x: 200, y: 0 } });
    const edge = body('edge', 280, 0);
    run([held, edge], 360, { x: 0, y: 0, width: 400, height: 600 });
    expect(at(edge).x).toBeLessThanOrEqual(400 - card.width + 40);
  });

  it('springs a released card home from outside the cloud instead of pinning it to the edge', () => {
    const one = body('one', 40, 40, { bounce: true, d: { x: -180, y: 0 } });
    run([one], 4, { x: 0, y: 0, width: 400, height: 600 });
    // 软墙若还压着它，四帧内就会被拽到区边上（x ≈ 0）。弹回的那张要留在区外，从松手处走完这段。
    expect(at(one).x).toBeLessThan(0);
  });

  it('overshoots further when released further away', () => {
    const peak = (dx: number) => {
      const one = body('one', 0, 0, { bounce: true, d: { x: dx, y: 0 } });
      let min = 0;
      for (let i = 0; i < 120; i += 1) { stepCloud([one], card, 1 / 60); min = Math.min(min, one.d.x); }
      return -min;
    };
    expect(peak(160)).toBeGreaterThan(peak(40) * 2);
    expect(peak(40)).toBeGreaterThan(0);
  });
});
