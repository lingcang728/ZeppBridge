import { describe, expect, it } from 'vitest';
import {
  ORBIT_UNDO_CAP,
  popUndo,
  pushUndo,
  undoTargetState,
  type OrbitUndoEntry,
} from '../undo';

const entry = (n: number): OrbitUndoEntry => ({
  type: n % 2 === 0 ? 'join' : 'leave',
  nodeId: `n${n}`,
  prevState: 'candidate',
});

describe('orbit undo stack', () => {
  it('pushes and pops LIFO', () => {
    let stack: OrbitUndoEntry[] = [];
    stack = pushUndo(stack, entry(1));
    stack = pushUndo(stack, entry(2));
    expect(stack).toHaveLength(2);
    const [popped, rest] = popUndo(stack);
    expect(popped?.nodeId).toBe('n2');
    expect(rest).toHaveLength(1);
  });

  it('caps at 50 entries, dropping the oldest', () => {
    let stack: OrbitUndoEntry[] = [];
    for (let i = 0; i < ORBIT_UNDO_CAP + 10; i += 1) {
      stack = pushUndo(stack, entry(i));
    }
    expect(stack).toHaveLength(ORBIT_UNDO_CAP);
    // n0..n9 were dropped; the oldest remaining is n10.
    expect(stack[0].nodeId).toBe('n10');
    expect(stack[stack.length - 1].nodeId).toBe(`n${ORBIT_UNDO_CAP + 9}`);
  });

  it('pop on an empty stack is a safe no-op', () => {
    const [popped, rest] = popUndo([]);
    expect(popped).toBeUndefined();
    expect(rest).toEqual([]);
  });

  it('undoTargetState restores the recorded prevState', () => {
    const e: OrbitUndoEntry = { type: 'join', nodeId: 'x', prevState: 'candidate' };
    expect(undoTargetState(e)).toBe('candidate');
    const f: OrbitUndoEntry = { type: 'leave', nodeId: 'y', prevState: 'member' };
    expect(undoTargetState(f)).toBe('member');
  });
});
