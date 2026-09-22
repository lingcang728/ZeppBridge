import { memberRadius, candidateRadius } from './slots';

/*
 * Drop-hit rules (contract P5).
 *
 * Two radii measured from the canvas centre create a hysteresis dead band:
 *   dist <  R_member + 48   → "join"     (pull a candidate inside → member)
 *   dist >  R_cand   + 40   → "leave"    (push a member outside → candidate)
 *   between the two         → "keep"     (release springs back, no intent)
 *
 * The ~85 px gap between the thresholds IS the hysteresis: jitter near a
 * single boundary cannot flip the outcome because join and leave are two
 * separate lines. The drag preview uses the exact same classification, so
 * what the user sees while dragging is what a release would do.
 */

export const JOIN_MARGIN = 48;
export const LEAVE_MARGIN = 40;

export interface HitThresholds {
  memberR: number;
  candidateR: number;
  join: number;
  leave: number;
}

export const hitThresholds = (width: number, height: number): HitThresholds => {
  const memberR = memberRadius(width, height);
  const candidateR = candidateRadius(width, height);
  return {
    memberR,
    candidateR,
    join: memberR + JOIN_MARGIN,
    leave: candidateR + LEAVE_MARGIN,
  };
};

export type DropClass = 'join' | 'leave' | 'keep';

/** Distance is `Math.hypot(x, y)` — world origin is the canvas centre. */
export const classifyDrop = (distance: number, t: HitThresholds): DropClass => {
  if (distance < t.join) return 'join';
  if (distance > t.leave) return 'leave';
  return 'keep';
};

/** What the drag preview shows; 'keep' renders as neutral (no intent). */
export const dragIntentFor = (distance: number, t: HitThresholds): 'join' | 'leave' | null => {
  const cls = classifyDrop(distance, t);
  return cls === 'keep' ? null : cls;
};
