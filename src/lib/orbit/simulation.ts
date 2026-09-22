import type { OrbitNode } from './types';
import { NODE_RADIUS, CENTER_RADIUS } from './types';
import { assignAnchors } from './slots';
import { collisionRect, estimateLabelBox, type CollisionRect } from './labels';

// Shared geometry lives in leaf modules so slots/simulation stay acyclic;
// re-export so existing imports from './simulation' keep working.
export { NODE_RADIUS, CENTER_RADIUS } from './types';
export { LABEL_GAP, LABEL_PAD_X, BODY_PAD, estimateLabelBox, collisionRect } from './labels';
export type { CollisionRect } from './labels';

/*
 * Local 2D force-directed simulation for the orbit graph.
 *
 * Everything here is a pure function over `OrbitSimState`: no DOM, no timers,
 * no randomness, no module-level state. The component mutates one plain state
 * object per animation frame; tests drive the same `step()` in a for-loop.
 *
 * Model (contract P5 / W0-S3):
 *  - Each node is springed toward its deterministic ring anchor (k = 0.04).
 *  - Semi-implicit Euler, per-frame damping 0.88, dt is the real frame gap
 *    clamped to ≤33 ms so a backgrounded tab doesn't catapult nodes.
 *  - Collisions use positional correction on AABBs that include the label
 *    box — cheaper than impulse forces and it cannot oscillate. A node being
 *    dragged is kinematic (infinite mass): it pushes others, never pushed.
 *  - "Settled" = total kinetic energy Σv² < 0.02 for 30 consecutive frames.
 */

export const SPRING_K = 0.04;
export const DAMPING = 0.88;
export const SETTLE_ENERGY = 0.02;
export const SETTLE_FRAMES = 30;
/** Speed cap, px per 60 fps frame. */
export const MAX_SPEED = 6;
/** Real dt is clamped to this; longer gaps are treated as one slow frame. */
export const MAX_DT_MS = 33;
const FRAME_MS = 1000 / 60;

export interface OrbitSimNode {
  id: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  anchorX: number;
  anchorY: number;
  radius: number;
  /** Estimated label box; included in the collision body. */
  labelW: number;
  labelH: number;
  /** Kinematic while the pointer holds it: follows the pointer, not forces. */
  dragging: boolean;
}

export interface OrbitSimState {
  nodes: OrbitSimNode[];
  /** Consecutive frames with Σv² below SETTLE_ENERGY. */
  stableFrames: number;
  settled: boolean;
  tick: number;
}

/** New simulation with every node already on its anchor (calm first paint). */
export const createSim = (
  nodes: readonly OrbitNode[],
  width: number,
  height: number,
): OrbitSimState => {
  const anchors = assignAnchors(nodes, width, height);
  return {
    nodes: nodes.map((n) => {
      const anchor = anchors.get(n.id) ?? { x: 0, y: 0 };
      const box = estimateLabelBox(n.label, n.sublabel);
      return {
        id: n.id,
        x: anchor.x,
        y: anchor.y,
        vx: 0,
        vy: 0,
        anchorX: anchor.x,
        anchorY: anchor.y,
        radius: NODE_RADIUS,
        labelW: box.w,
        labelH: box.h,
        dragging: false,
      };
    }),
    stableFrames: 0,
    settled: false,
    tick: 0,
  };
};

/**
 * Reconcile a running simulation with a new node list / size: keep positions
 * and velocities of surviving ids, spawn newcomers at the centre (they spring
 * outward — a deterministic "materialise"), recompute every anchor.
 */
export const syncSim = (
  state: OrbitSimState,
  nodes: readonly OrbitNode[],
  width: number,
  height: number,
): void => {
  const anchors = assignAnchors(nodes, width, height);
  const alive = new Set(nodes.map((n) => n.id));
  state.nodes = state.nodes.filter((sn) => alive.has(sn.id));
  for (const n of nodes) {
    const anchor = anchors.get(n.id) ?? { x: 0, y: 0 };
    const box = estimateLabelBox(n.label, n.sublabel);
    const existing = state.nodes.find((sn) => sn.id === n.id);
    if (existing) {
      existing.anchorX = anchor.x;
      existing.anchorY = anchor.y;
      existing.labelW = box.w;
      existing.labelH = box.h;
    } else {
      state.nodes.push({
        id: n.id,
        x: 0,
        y: 0,
        vx: 0,
        vy: 0,
        anchorX: anchor.x,
        anchorY: anchor.y,
        radius: NODE_RADIUS,
        labelW: box.w,
        labelH: box.h,
        dragging: false,
      });
    }
  }
  state.stableFrames = 0;
  state.settled = false;
};

/** reduced-motion path: teleport to anchors and report settled immediately. */
export const snapToAnchors = (state: OrbitSimState): void => {
  for (const n of state.nodes) {
    n.x = n.anchorX;
    n.y = n.anchorY;
    n.vx = 0;
    n.vy = 0;
  }
  state.stableFrames = SETTLE_FRAMES;
  state.settled = true;
};

/** Σv² over free nodes (a dragged node is kinematic, so it never counts). */
export const energyOf = (state: OrbitSimState): number => {
  let energy = 0;
  for (const n of state.nodes) {
    if (!n.dragging) energy += n.vx * n.vx + n.vy * n.vy;
  }
  return energy;
};

const rectsOverlap = (a: CollisionRect, b: CollisionRect): boolean =>
  a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;

/**
 * Push a pair of overlapping bodies apart along the axis of least
 * penetration, split by inverse mass (a kinematic node takes none). Velocity
 * pointing into the overlap is zeroed so sustained contact converges to
 * "tangent and still" instead of rattling forever — that is what lets the
 * energy settle criterion trigger even when two labels genuinely touch.
 */
const pushPair = (a: OrbitSimNode, b: OrbitSimNode): void => {
  const ra = collisionRect(a);
  const rb = collisionRect(b);
  if (!rectsOverlap(ra, rb)) return;
  const overlapX = Math.min(ra.right, rb.right) - Math.max(ra.left, rb.left);
  const overlapY = Math.min(ra.bottom, rb.bottom) - Math.max(ra.top, rb.top);
  // Mass share: dragged nodes are immovable; free nodes split the correction.
  const shareA = a.dragging ? 0 : b.dragging ? 1 : 0.5;
  const shareB = b.dragging ? 0 : a.dragging ? 1 : 0.5;
  if (shareA + shareB === 0) return;
  if (overlapX <= overlapY) {
    const dir = ra.left + ra.right < rb.left + rb.right ? -1 : 1;
    a.x += dir * overlapX * shareA;
    b.x -= dir * overlapX * shareB;
    if (a.vx * dir < 0) a.vx = 0;
    if (b.vx * -dir < 0) b.vx = 0;
  } else {
    const dir = ra.top + ra.bottom < rb.top + rb.bottom ? -1 : 1;
    a.y += dir * overlapY * shareA;
    b.y -= dir * overlapY * shareB;
    if (a.vy * dir < 0) a.vy = 0;
    if (b.vy * -dir < 0) b.vy = 0;
  }
};

/**
 * Advance the simulation by `dtMs` real milliseconds. Mutates `state`.
 * Deterministic: same inputs → same outputs, in array order, no randomness.
 */
export const step = (state: OrbitSimState, dtMs: number): OrbitSimState => {
  const dtF = Math.min(Math.max(dtMs, 0), MAX_DT_MS) / FRAME_MS;
  const damp = Math.pow(DAMPING, dtF);
  state.tick += 1;

  for (const n of state.nodes) {
    if (n.dragging) continue;
    n.vx += (n.anchorX - n.x) * SPRING_K * dtF;
    n.vy += (n.anchorY - n.y) * SPRING_K * dtF;
    n.vx *= damp;
    n.vy *= damp;
    const speed = Math.hypot(n.vx, n.vy);
    if (speed > MAX_SPEED) {
      n.vx *= MAX_SPEED / speed;
      n.vy *= MAX_SPEED / speed;
    }
    n.x += n.vx * dtF;
    n.y += n.vy * dtF;
    // Arrived: pin exactly on the anchor so resting positions are crisp.
    if (
      Math.abs(n.anchorX - n.x) < 0.5
      && Math.abs(n.anchorY - n.y) < 0.5
      && Math.hypot(n.vx, n.vy) < 1
    ) {
      n.x = n.anchorX;
      n.y = n.anchorY;
      n.vx = 0;
      n.vy = 0;
    }
  }

  // Positional-correction collisions, label box included. The centre disc is
  // an extra immovable body so nothing slides over the task label.
  const centerBody: OrbitSimNode = {
    id: '\0center',
    x: 0,
    y: 0,
    vx: 0,
    vy: 0,
    anchorX: 0,
    anchorY: 0,
    radius: CENTER_RADIUS,
    labelW: 0,
    labelH: 0,
    dragging: true,
  };
  const bodies = [...state.nodes, centerBody];
  for (let i = 0; i < bodies.length; i += 1) {
    for (let j = i + 1; j < bodies.length; j += 1) {
      pushPair(bodies[i], bodies[j]);
    }
  }

  const energy = energyOf(state);
  state.stableFrames = energy < SETTLE_ENERGY ? state.stableFrames + 1 : 0;
  state.settled = state.stableFrames >= SETTLE_FRAMES;
  return state;
};
