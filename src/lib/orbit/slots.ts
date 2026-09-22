import { NODE_RADIUS, type OrbitNode } from './types';
import { LABEL_GAP, LABEL_PAD_X, estimateLabelBox } from './labels';

/** Contract P5: member ring R = min(w,h)*0.30, candidate ring ≈1.55R. */
export const MEMBER_RING_RATIO = 0.3;
export const CANDIDATE_RING_FACTOR = 1.55;

export const memberRadius = (width: number, height: number): number =>
  Math.min(width, height) * MEMBER_RING_RATIO;

export const candidateRadius = (width: number, height: number): number =>
  memberRadius(width, height) * CANDIDATE_RING_FACTOR;

/*
 * Deterministic anchor assignment.
 *
 * Members sit on the inner ring (R = min(w,h)*0.30), candidates and disabled
 * nodes on the outer ring (≈1.55R). Slot 0 is straight up (-90°), indices run
 * clockwise. Candidate slots are phase-shifted by half a *member* step so
 * outer nodes sit between member spokes instead of hiding behind them.
 *
 * `orbitSlot` lets a caller pin a node to a slot index within its own state
 * group (used so a node keeps its place across leave/rejoin). First claim
 * wins; everyone else fills the lowest free slots in input order — the result
 * is fully determined by the input array, which is what makes replays and
 * tests reproducible.
 */

export interface OrbitAnchor {
  x: number;
  y: number;
}

const TWO_PI = Math.PI * 2;

/** Angle of slot `index` out of `count`, measured clockwise from 12 o'clock. */
export const slotAngle = (index: number, count: number, phase: number): number =>
  phase + (TWO_PI * index) / Math.max(1, count);

/**
 * Order a state-group into slots: nodes with a valid unique `orbitSlot` claim
 * that index, the rest fill the remaining slots in input order.
 */
export const orderBySlot = <T extends Pick<OrbitNode, 'orbitSlot'>>(group: readonly T[]): T[] => {
  const n = group.length;
  const claimed: (T | undefined)[] = new Array<T | undefined>(n);
  const free: T[] = [];
  for (const node of group) {
    const s = node.orbitSlot;
    if (Number.isInteger(s) && s !== undefined && s >= 0 && s < n && claimed[s] === undefined) {
      claimed[s] = node;
    } else {
      free.push(node);
    }
  }
  const ordered: T[] = [];
  let next = 0;
  for (let i = 0; i < n; i += 1) {
    const node = claimed[i] ?? free[next++];
    if (node) ordered.push(node);
  }
  return ordered;
};

/*
 * Content rect: every anchor is clamped so the node's whole footprint —
 * disc plus the label block below it — stays inside the canvas. Without this,
 * the outer ring's top/bottom slots overflow `overflow:hidden` at narrow
 * heights (the disc at 12 o'clock and labels at 6 o'clock clip). The extra
 * padding beyond NODE_RADIUS covers the focus ring and label overhang.
 */
const ANCHOR_PAD = 6;
const DISC_HALF = NODE_RADIUS + 2; // disc + stroke

const clampAnchor = (
  x: number,
  y: number,
  node: OrbitNode,
  width: number,
  height: number,
): OrbitAnchor => {
  const box = estimateLabelBox(node.label, node.sublabel);
  const side = Math.max(DISC_HALF, box.w / 2 + LABEL_PAD_X) + ANCHOR_PAD;
  const top = DISC_HALF + ANCHOR_PAD;
  const bottom = DISC_HALF + (box.h > 0 ? LABEL_GAP + box.h : 0) + ANCHOR_PAD;
  const xLim = Math.max(0, width / 2 - side);
  const yTop = Math.max(0, height / 2 - top);
  const yBot = Math.max(0, height / 2 - bottom);
  return {
    x: Math.min(Math.max(x, -xLim), xLim),
    y: Math.min(Math.max(y, -yTop), yBot),
  };
};

/** World-space anchor per node id. World origin is the canvas center. */
export const assignAnchors = (
  nodes: readonly OrbitNode[],
  width: number,
  height: number,
): Map<string, OrbitAnchor> => {
  const members = orderBySlot(nodes.filter((n) => n.state === 'member'));
  const orbiters = orderBySlot(nodes.filter((n) => n.state !== 'member'));
  const rm = memberRadius(width, height);
  const rc = candidateRadius(width, height);
  // Outer ring shifted by half a member step: candidates land between spokes.
  const outerPhase = -Math.PI / 2 + (members.length > 0 ? Math.PI / members.length : 0);

  const anchors = new Map<string, OrbitAnchor>();
  members.forEach((node, i) => {
    const a = slotAngle(i, members.length, -Math.PI / 2);
    anchors.set(
      node.id,
      clampAnchor(rm * Math.cos(a), rm * Math.sin(a), node, width, height),
    );
  });
  orbiters.forEach((node, i) => {
    const a = slotAngle(i, orbiters.length, outerPhase);
    anchors.set(
      node.id,
      clampAnchor(rc * Math.cos(a), rc * Math.sin(a), node, width, height),
    );
  });
  return anchors;
};
