import { expect, it } from 'vitest';
import { cubicPoint, pathD, sampleStrand, threadTree, trunkCount, type Obstacle } from '../threads';

const ports = [
  { id: 'sleep', x: 180, y: 90 }, { id: 'recovery', x: 320, y: 140 }, { id: 'resting_hr', x: 140, y: 230 },
  { id: 'heart_rate', x: 300, y: 300 }, { id: 'training', x: 200, y: 400 }, { id: 'personal_note', x: 330, y: 440 },
];
const lock = { x: 640, y: 260 };

it('gives every card exactly one strand on a decentralised tree, and a tight bundle on the right', () => {
  const tree = threadTree(lock, 56, ports, { x: 820, y: 260, h: 380 });
  expect(tree.strands.map((s) => s.id).sort()).toEqual(ports.map((p) => p.id).sort());
  expect(tree.trunks).toHaveLength(trunkCount(ports.length));
  expect(tree.trunks.length).toBeGreaterThan(1);
  expect(tree.right).toHaveLength(3);
  const ends = tree.right.map((q) => q.d.y);
  expect(Math.max(...ends) - Math.min(...ends)).toBeLessThanOrEqual(6);
});

it('forks in the open space between the cards and the lock, and ends on each card port', () => {
  const tree = threadTree(lock, 56, ports, null);
  const reach = Math.max(...ports.map((p) => p.x));
  for (const strand of tree.strands) {
    const port = ports.find((p) => p.id === strand.id)!;
    const fork = strand.branch[0]!.a;
    expect(fork.x).toBeLessThan(tree.origin.x);
    expect(fork.x).toBeGreaterThan(reach);
    expect(strand.branch[strand.branch.length - 1]!.d).toEqual({ x: port.x, y: port.y });
    expect(tree.trunks[strand.trunk]!.d).toEqual(fork);
  }
});

it('routes a branch around a card that sits in its way', () => {
  const far = { id: 'far', x: 100, y: 200 };
  const blocker: Obstacle = { id: 'near', x: 200, y: 150, width: 120, height: 100 };
  const tree = threadTree(lock, 56, [far], null, [blocker, { id: 'far', x: -20, y: 150, width: 120, height: 100 }]);
  const branch = tree.strands[0]!.branch;
  expect(branch.length).toBeGreaterThanOrEqual(2);
  for (const q of branch) {
    for (let i = 1; i < 20; i += 1) {
      const p = cubicPoint(q, i / 20);
      const inside = p.x > blocker.x && p.x < blocker.x + blocker.width && p.y > blocker.y && p.y < blocker.y + blocker.height;
      expect(inside).toBe(false);
    }
  }
});

it('is deterministic and samples card → lock', () => {
  const a = threadTree(lock, 56, ports, { x: 820, y: 260, h: 380 });
  const b = threadTree(lock, 56, [...ports].reverse(), { x: 820, y: 260, h: 380 });
  expect(pathD(a.trunks)).toBe(pathD(b.trunks));
  const points = sampleStrand(a, 'training', 12);
  expect(points).toHaveLength(12);
  expect(points[0]).toEqual({ x: 200, y: 400 });
  expect(points[11]!.x).toBeCloseTo(a.origin.x);
  expect(sampleStrand(a, 'missing')).toEqual([]);
});
