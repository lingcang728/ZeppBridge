import { expect, it } from 'vitest';
import { pathD, sampleStrand, threadTree, trunkCount } from '../threads';

const ports = [
  { id: 'sleep', x: 180, y: 90 }, { id: 'recovery', x: 320, y: 140 }, { id: 'resting_hr', x: 140, y: 230 },
  { id: 'heart_rate', x: 300, y: 300 }, { id: 'training', x: 200, y: 400 }, { id: 'personal_note', x: 330, y: 440 },
];
const lock = { x: 640, y: 260 };

it('gives every card exactly one strand on a decentralised tree', () => {
  const tree = threadTree(lock, 56, ports, { x: 820, y: 260, h: 380 });
  expect(tree.strands.map((s) => s.id).sort()).toEqual(ports.map((p) => p.id).sort());
  expect(tree.trunks).toHaveLength(trunkCount(ports.length));
  expect(tree.trunks.length).toBeGreaterThan(1);
  expect(tree.noise).toHaveLength(ports.length * 2);
  expect(tree.right).toHaveLength(5);
});

it('forks between the lock and the cards and ends on each card port', () => {
  const tree = threadTree(lock, 56, ports, null);
  for (const strand of tree.strands) {
    const port = ports.find((p) => p.id === strand.id)!;
    const fork = strand.branch.a;
    expect(fork.x).toBeLessThan(tree.origin.x);
    expect(fork.x).toBeGreaterThan(port.x);
    expect(strand.branch.d).toEqual({ x: port.x, y: port.y });
    expect(tree.trunks[strand.trunk]!.d).toEqual(fork);
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
