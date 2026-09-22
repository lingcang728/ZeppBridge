import type { OrbitNodeState } from './types';

/*
 * Undo stack for membership changes (contract P5).
 *
 * The canvas emits `undo` as an *intent* only; the stack lives in the parent
 * because undo must restore `nodes[].state`, which the parent owns. Entries
 * remember the state the node had BEFORE the change, so undo is just
 * "put prevState back" — no inverse-op inference needed.
 */

export const ORBIT_UNDO_CAP = 50;

export interface OrbitUndoEntry {
  type: 'join' | 'leave';
  nodeId: string;
  prevState: OrbitNodeState;
}

/** Push an entry; the stack keeps at most the newest 50 (oldest dropped). */
export const pushUndo = (
  stack: readonly OrbitUndoEntry[],
  entry: OrbitUndoEntry,
): OrbitUndoEntry[] => {
  const next = [...stack, entry];
  return next.length > ORBIT_UNDO_CAP ? next.slice(next.length - ORBIT_UNDO_CAP) : next;
};

/** LIFO pop: returns [entry, rest]; entry is undefined on an empty stack. */
export const popUndo = (
  stack: readonly OrbitUndoEntry[],
): [OrbitUndoEntry | undefined, OrbitUndoEntry[]] => [
  stack[stack.length - 1],
  stack.slice(0, -1),
];

/** State the node should be restored to when this entry is undone. */
export const undoTargetState = (entry: OrbitUndoEntry): OrbitNodeState => entry.prevState;
