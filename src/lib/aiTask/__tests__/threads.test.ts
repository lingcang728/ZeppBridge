import { expect, it } from 'vitest';
import { cubicPoint, pathD, sampleStrand, threadTree, trunkCount } from '../threads';
import { stepCloud, type CloudBody } from '../cloudPhysics';

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

it('forks in the open space between the cards and the lock, and ends on each card port with one smooth curve', () => {
  const tree = threadTree(lock, 56, ports, null);
  const reach = Math.max(...ports.map((p) => p.x));
  for (const strand of tree.strands) {
    const port = ports.find((p) => p.id === strand.id)!;
    const fork = strand.branch[0]!.a;
    expect(fork.x).toBeLessThan(tree.origin.x);
    expect(fork.x).toBeGreaterThan(reach);
    // 一整段斜曲线（10-08：不再是直角走廊）。
    expect(strand.branch).toHaveLength(1);
    expect(strand.branch[0]!.d).toEqual({ x: port.x, y: port.y });
    expect(tree.trunks[strand.trunk]!.d).toEqual(fork);
  }
});

it('dragging one card moves only its own branch — the forks stay put', () => {
  const rest = ports.map((p) => ({ ...p, ry: p.y }));
  const before = threadTree(lock, 56, rest, null, [], 360);
  const dragged = rest.map((p) => (p.id === 'resting_hr' ? { ...p, x: 520, y: 60, side: 'left' as const } : p));
  const after = threadTree(lock, 56, dragged, null, [], 360);
  expect(pathD(after.trunks)).toBe(pathD(before.trunks));
  for (const strand of after.strands) {
    if (strand.id === 'resting_hr') continue;
    expect(pathD(strand.branch)).toBe(pathD(before.strands.find((s) => s.id === strand.id)!.branch));
  }
});

it('a card dragged past the fork is reached from its outer (left) side, not through itself', () => {
  const tree = threadTree(lock, 56, [{ id: 'a', x: 560, y: 120, side: 'left', ry: 200 }, { id: 'b', x: 200, y: 300 }], null, [], 360);
  const branch = tree.strands.find((s) => s.id === 'a')!.branch[0]!;
  // 进入牌之前的控制点在牌的左边（外侧）。
  expect(branch.c.x).toBeLessThan(560);
  const mid = cubicPoint(branch, 0.5);
  expect(Number.isFinite(mid.x) && Number.isFinite(mid.y)).toBe(true);
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

const body = (id: string, x: number, y: number, extra: Partial<CloudBody> = {}): CloudBody => ({ id, rest: { x, y }, d: { x: 0, y: 0 }, v: { x: 0, y: 0 }, ...extra });
const card = { width: 100, height: 126 };
const run = (bodies: CloudBody[], frames: number) => { let calm = false; for (let i = 0; i < frames; i += 1) calm = stepCloud(bodies, card, 1 / 60); return calm; };

it('a held card pushes a neighbour aside; letting go, both settle without overlapping', () => {
  const still = body('b', 200, 100);
  const held = body('a', 0, 100, { pinned: true, at: { x: 170, y: 110 } });
  run([held, still], 90);
  expect(still.d.x).toBeGreaterThan(20);
  // 松手：被拖的那张停在 170，另一张被推开的那张回不到完全重叠的位置。
  const dropped = body('a', 170, 110);
  run([dropped, still], 240);
  const gap = Math.abs(200 + still.d.x - (170 + dropped.d.x));
  expect(gap).toBeGreaterThan(card.width * 0.6);
});

it('springs back to rest once nothing pushes, and reports calm', () => {
  const b = body('b', 200, 100, { d: { x: 40, y: -30 } });
  const calm = run([b], 240);
  expect(Math.abs(b.d.x)).toBeLessThan(0.5);
  expect(Math.abs(b.d.y)).toBeLessThan(0.5);
  expect(calm).toBe(true);
});

it('stays finite with two cards exactly on top of each other and a huge frame gap', () => {
  const a = body('a', 100, 100);
  const b = body('b', 100, 100);
  stepCloud([a, b], card, 2);
  for (const v of [a.d.x, a.d.y, b.d.x, b.d.y]) expect(Number.isFinite(v)).toBe(true);
  expect(a.d.x).not.toBe(b.d.x);
});
