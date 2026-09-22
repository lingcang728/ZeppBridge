import { describe, expect, it } from 'vitest';
import type { OrbitNode } from '../types';
import {
  SETTLE_ENERGY,
  SETTLE_FRAMES,
  collisionRect,
  createSim,
  energyOf,
  estimateLabelBox,
  snapToAnchors,
  step,
  syncSim,
  type OrbitSimState,
} from '../simulation';

const W = 800;
const H = 600;
const TICK_MS = 16.7;

const node = (id: string, state: OrbitNode['state'], label = id): OrbitNode => ({
  id,
  category: 'workout',
  label,
  state,
});

const rectsOverlap = (
  a: { left: number; right: number; top: number; bottom: number },
  b: { left: number; right: number; top: number; bottom: number },
) => a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;

const runUntilSettled = (state: OrbitSimState, maxTicks = 600): number => {
  let ticks = 0;
  while (!state.settled && ticks < maxTicks) {
    step(state, TICK_MS);
    ticks += 1;
  }
  return ticks;
};

describe('orbit simulation', () => {
  it('settles a full graph within 600 ticks with residual energy below epsilon', () => {
    const nodes: OrbitNode[] = [
      node('a', 'member', 'Workout'),
      node('b', 'member', 'Sleep'),
      node('c', 'member', 'Recovery'),
      node('d', 'candidate', 'Heart rate'),
      node('e', 'candidate', 'Training load'),
      node('f', 'candidate', 'Body'),
      node('g', 'candidate', 'Notes'),
      node('h', 'disabled', 'Attachment'),
    ];
    const state = createSim(nodes, W, H);
    const ticks = runUntilSettled(state);
    expect(ticks).toBeLessThan(600);
    expect(state.settled).toBe(true);
    expect(energyOf(state)).toBeLessThan(SETTLE_ENERGY);
  });

  it('is deterministic: identical inputs converge to identical positions', () => {
    const nodes = [
      node('a', 'member', 'Alpha'),
      node('b', 'member', 'Beta'),
      node('c', 'candidate', 'Gamma'),
      node('d', 'candidate', 'Delta'),
    ];
    const s1 = createSim(nodes, W, H);
    const s2 = createSim(nodes, W, H);
    // Perturb both identically, then run.
    for (const s of [s1, s2]) {
      s.nodes[0].x += 40;
      s.nodes[0].y -= 17;
      s.nodes[2].x -= 23;
      for (let i = 0; i < 400; i += 1) step(s, TICK_MS);
    }
    expect(s1.nodes.map((n) => [n.x, n.y])).toEqual(s2.nodes.map((n) => [n.x, n.y]));
    expect(s1.settled).toBe(true);
  });

  it('separates two overlapping nodes so their collision rects are disjoint', () => {
    const nodes = [node('a', 'member', 'aaaaaaaa'), node('b', 'member', 'bbbbbbbb')];
    const state = createSim(nodes, W, H);
    // Force an overlap at the same spot; anchors stay unchanged.
    state.nodes[0].x = 0;
    state.nodes[0].y = -180;
    state.nodes[1].x = 10;
    state.nodes[1].y = -172;
    for (let i = 0; i < 60; i += 1) step(state, TICK_MS);
    expect(rectsOverlap(collisionRect(state.nodes[0]), collisionRect(state.nodes[1]))).toBe(false);
  });

  it('keeps every label-inclusive collision rect pairwise disjoint once settled', () => {
    const nodes: OrbitNode[] = [
      node('a', 'member', 'Workout data'),
      node('b', 'member', 'Sleep stages'),
      node('c', 'member', 'Recovery'),
      node('d', 'member', 'Heart rate'),
      node('e', 'candidate', 'Training load'),
      node('f', 'candidate', 'Body composition'),
      node('g', 'candidate', 'Personal note'),
      node('h', 'candidate', 'Attachment files'),
      node('i', 'disabled', 'Unavailable'),
    ];
    const state = createSim(nodes, W, H);
    runUntilSettled(state);
    const rects = state.nodes.map((n) => collisionRect(n));
    for (let i = 0; i < rects.length; i += 1) {
      for (let j = i + 1; j < rects.length; j += 1) {
        expect(
          rectsOverlap(rects[i], rects[j]),
          `nodes ${state.nodes[i].id} and ${state.nodes[j].id} overlap`,
        ).toBe(false);
      }
    }
  });

  it('treats a dragged node as kinematic: pointer position wins, it is never pushed', () => {
    const state = createSim([node('a', 'member'), node('b', 'member')], W, H);
    const dragged = state.nodes[0];
    dragged.dragging = true;
    dragged.x = 12;
    dragged.y = -34;
    for (let i = 0; i < 30; i += 1) step(state, TICK_MS);
    expect(dragged.x).toBe(12);
    expect(dragged.y).toBe(-34);
  });

  it('settles around an immovable dragged node instead of rattling forever', () => {
    const state = createSim([node('a', 'member'), node('b', 'member')], W, H);
    // Park the dragged node exactly on the other node's anchor: worst case.
    state.nodes[0].dragging = true;
    state.nodes[0].x = state.nodes[1].anchorX;
    state.nodes[0].y = state.nodes[1].anchorY;
    const ticks = runUntilSettled(state);
    expect(ticks).toBeLessThan(600);
    expect(energyOf(state)).toBeLessThan(SETTLE_ENERGY);
  });

  it('syncSim spawns new nodes and re-settles them onto anchors', () => {
    const state = createSim([node('a', 'member')], W, H);
    runUntilSettled(state);
    syncSim(state, [node('a', 'member'), node('b', 'candidate', 'New node')], W, H);
    expect(state.nodes).toHaveLength(2);
    expect(state.settled).toBe(false);
    runUntilSettled(state);
    const spawned = state.nodes.find((n) => n.id === 'b');
    expect(spawned).toBeDefined();
    expect(Math.hypot(spawned!.x - spawned!.anchorX, spawned!.y - spawned!.anchorY)).toBeLessThan(1);
  });

  it('snapToAnchors lands every node exactly on its anchor, already settled', () => {
    const state = createSim([node('a', 'member'), node('b', 'candidate')], W, H);
    state.nodes[0].x += 33;
    state.nodes[0].vx = 2;
    snapToAnchors(state);
    for (const n of state.nodes) {
      expect(n.x).toBe(n.anchorX);
      expect(n.y).toBe(n.anchorY);
      expect(n.vx).toBe(0);
    }
    expect(state.settled).toBe(true);
    expect(energyOf(state)).toBe(0);
  });

  it('clamps a huge dt so a backgrounded tab cannot catapult nodes', () => {
    const state = createSim([node('a', 'member')], W, H);
    state.nodes[0].x += 200; // 200 px off its anchor
    step(state, 10_000); // a tab that was hidden for 10 s
    const displacement = Math.hypot(
      state.nodes[0].x - state.nodes[0].anchorX,
      state.nodes[0].y - state.nodes[0].anchorY,
    );
    // Capped at MAX_SPEED * (33/16.7) ≈ 11.9 px, never the full 200.
    expect(displacement).toBeGreaterThan(150);
    expect(Math.hypot(state.nodes[0].vx, state.nodes[0].vy)).toBeLessThanOrEqual(6.0001);
  });

  it('runs the whole 600-tick acceptance budget in well under 100 ms', () => {
    const nodes: OrbitNode[] = Array.from({ length: 20 }, (_, i) =>
      node(`n${i}`, i % 3 === 0 ? 'member' : 'candidate', `Node ${i}`),
    );
    const state = createSim(nodes, W, H);
    syncSim(state, nodes, W, H); // exercise the churn path too
    const t0 = performance.now();
    for (let i = 0; i < 600; i += 1) step(state, TICK_MS);
    const elapsed = performance.now() - t0;
    expect(elapsed).toBeLessThan(100);
  });

  it('estimateLabelBox widens with CJK glyphs and a sublabel adds height', () => {
    const latin = estimateLabelBox('Sleep');
    const cjk = estimateLabelBox('睡眠监测');
    expect(cjk.w).toBeGreaterThan(latin.w);
    const withSub = estimateLabelBox('Sleep', 'last 14 days');
    expect(withSub.h).toBeGreaterThan(latin.h);
  });

  it('settle requires the energy band to hold for 30 consecutive frames', () => {
    const state = createSim([node('a', 'member')], W, H);
    // One small nudge: energy briefly spikes, then holds — stableFrames must
    // accumulate, not latch on a single quiet frame.
    state.nodes[0].vx = 0.05;
    let sawSettledEarly = false;
    for (let i = 0; i < SETTLE_FRAMES + 5; i += 1) {
      step(state, TICK_MS);
      if (state.settled && i < SETTLE_FRAMES - 1) sawSettledEarly = true;
    }
    expect(sawSettledEarly).toBe(false);
    expect(state.settled).toBe(true);
  });
});
