import { describe, expect, it } from 'vitest';
import { NODE_RADIUS, type OrbitNode } from '../types';
import { LABEL_GAP, estimateLabelBox } from '../labels';
import { assignAnchors, candidateRadius, memberRadius, orderBySlot, slotAngle } from '../slots';

const W = 800;
const H = 600;

const node = (
  id: string,
  state: OrbitNode['state'],
  orbitSlot?: number,
): OrbitNode => ({ id, category: 'sleep', label: id, state, orbitSlot });

describe('orbit slot assignment', () => {
  it('puts members on the member ring and others on the candidate ring', () => {
    const nodes = [node('m1', 'member'), node('m2', 'member'), node('c1', 'candidate'), node('d1', 'disabled')];
    const anchors = assignAnchors(nodes, W, H);
    const rm = memberRadius(W, H);
    const rc = candidateRadius(W, H);
    expect(Math.hypot(anchors.get('m1')!.x, anchors.get('m1')!.y)).toBeCloseTo(rm, 6);
    expect(Math.hypot(anchors.get('m2')!.x, anchors.get('m2')!.y)).toBeCloseTo(rm, 6);
    expect(Math.hypot(anchors.get('c1')!.x, anchors.get('c1')!.y)).toBeCloseTo(rc, 6);
    // disabled nodes live on the outer ring too.
    expect(Math.hypot(anchors.get('d1')!.x, anchors.get('d1')!.y)).toBeCloseTo(rc, 6);
    expect(rc / rm).toBeCloseTo(1.55, 6);
    expect(rm).toBeCloseTo(Math.min(W, H) * 0.3, 6);
  });

  it('is fully deterministic for identical input', () => {
    const nodes = [node('a', 'member'), node('b', 'member'), node('c', 'candidate'), node('d', 'candidate')];
    expect(assignAnchors(nodes, W, H)).toEqual(assignAnchors(nodes, W, H));
  });

  it('places slot 0 straight up and walks clockwise', () => {
    const anchors = assignAnchors([node('a', 'member'), node('b', 'member'), node('c', 'member')], W, H);
    const rm = memberRadius(W, H);
    expect(anchors.get('a')!.x).toBeCloseTo(0, 6);
    expect(anchors.get('a')!.y).toBeCloseTo(-rm, 6);
    // slot 1 of 3: -90° + 120° = 30° → right half, below centre.
    expect(anchors.get('b')!.x).toBeCloseTo(rm * Math.cos(Math.PI / 6), 6);
    expect(anchors.get('b')!.y).toBeCloseTo(rm * Math.sin(Math.PI / 6), 6);
  });

  it('honours orbitSlot as an override within the state group', () => {
    // 'pinned' asks for slot 2 even though it is listed first.
    const nodes = [node('pinned', 'member', 2), node('a', 'member'), node('b', 'member')];
    const anchors = assignAnchors(nodes, W, H);
    const rm = memberRadius(W, H);
    // slot 2 of 3: -90° + 240° = 150° → left half.
    expect(anchors.get('pinned')!.x).toBeCloseTo(rm * Math.cos((5 * Math.PI) / 6), 6);
    expect(anchors.get('pinned')!.y).toBeCloseTo(rm * Math.sin((5 * Math.PI) / 6), 6);
    // 'a' filled the lowest free slot (0 = top).
    expect(anchors.get('a')!.x).toBeCloseTo(0, 6);
    expect(anchors.get('a')!.y).toBeCloseTo(-rm, 6);
  });

  it('keeps pinned slots stable when siblings are reordered', () => {
    const before = assignAnchors(
      [node('pin', 'member', 1), node('x', 'member'), node('y', 'member'), node('z', 'member')],
      W, H,
    );
    const after = assignAnchors(
      [node('z', 'member'), node('y', 'member'), node('pin', 'member', 1), node('x', 'member')],
      W, H,
    );
    expect(after.get('pin')).toEqual(before.get('pin'));
  });

  it('falls back to input order for invalid, duplicate or out-of-range slots', () => {
    // Two nodes claim slot 0; first claim wins, the second fills the next free slot.
    const nodes = [node('first', 'member', 0), node('second', 'member', 0), node('wild', 'member', 99)];
    const anchors = assignAnchors(nodes, W, H);
    const rm = memberRadius(W, H);
    expect(anchors.get('first')!.y).toBeCloseTo(-rm, 6); // slot 0
    // 'second' and 'wild' fill slots 1 and 2 in input order.
    const s1 = slotAngle(1, 3, -Math.PI / 2);
    const s2 = slotAngle(2, 3, -Math.PI / 2);
    expect(anchors.get('second')!.x).toBeCloseTo(rm * Math.cos(s1), 6);
    expect(anchors.get('wild')!.x).toBeCloseTo(rm * Math.cos(s2), 6);
  });

  it('orderBySlot preserves relative order of unpinned nodes', () => {
    const input = [node('x', 'member'), node('y', 'member'), node('z', 'member')];
    expect(orderBySlot(input).map((n) => n.id)).toEqual(['x', 'y', 'z']);
  });

  it('keeps the whole node footprint inside narrow canvases', () => {
    // 446×404 ≈ the lab stage at a 480 px viewport — the unclamped candidate
    // ring (188) would push discs past the top edge and labels past the bottom.
    const NW = 446;
    const NH = 404;
    const nodes = Array.from({ length: 8 }, (_, i) =>
      ({ id: `n${i}`, category: 'sleep' as const, label: `node ${i}`, sublabel: 'sub', state: 'candidate' as const }));
    const anchors = assignAnchors(nodes, NW, NH);
    for (const [id, a] of anchors) {
      const n = nodes.find((node_) => node_.id === id)!;
      const box = estimateLabelBox(n.label, n.sublabel);
      // disc left/right, focus-ring top, label bottom must all be in-bounds.
      expect(a.x - NODE_RADIUS).toBeGreaterThanOrEqual(-NW / 2);
      expect(a.x + NODE_RADIUS).toBeLessThanOrEqual(NW / 2);
      expect(a.y - NODE_RADIUS).toBeGreaterThanOrEqual(-NH / 2);
      expect(a.y + NODE_RADIUS + LABEL_GAP + box.h).toBeLessThanOrEqual(NH / 2);
    }
  });
});
