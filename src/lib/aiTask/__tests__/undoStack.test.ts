import { describe, expect, it } from 'vitest';
import { createUndoStack, orbitUndoTarget, UNDO_CAP, type OrbitUndoOp } from '../undoStack';

const join = (nodeId: string, prevState: 'member' | 'candidate' = 'candidate'): OrbitUndoOp => ({
  type: 'join', nodeId, prevState,
});

describe('createUndoStack', () => {
  it('push/pop 后进先出，canUndo 反映栈空不空', () => {
    const stack = createUndoStack<OrbitUndoOp>();
    expect(stack.canUndo).toBe(false);
    stack.push(join('sleep'));
    stack.push(join('body'));
    expect(stack.size).toBe(2);
    expect(stack.pop()?.nodeId).toBe('body');
    expect(stack.pop()?.nodeId).toBe('sleep');
    expect(stack.pop()).toBeUndefined();
    expect(stack.canUndo).toBe(false);
  });

  it('容量封顶 50：溢出丢最旧的，栈顶永远是最新动作', () => {
    const stack = createUndoStack<OrbitUndoOp>();
    for (let index = 0; index < UNDO_CAP + 10; index += 1) stack.push(join(`n-${index}`));
    expect(stack.size).toBe(UNDO_CAP);
    expect(stack.pop()?.nodeId).toBe(`n-${UNDO_CAP + 9}`);
    // 最旧的十条已经丢了。
    const ids = stack.entries().map((op) => op.nodeId);
    expect(ids).not.toContain('n-0');
    expect(ids[0]).toBe('n-10');
  });

  it('clear 之后栈空', () => {
    const stack = createUndoStack<OrbitUndoOp>();
    stack.push(join('sleep'));
    stack.clear();
    expect(stack.size).toBe(0);
  });
});

describe('orbitUndoTarget', () => {
  it('撤销 join：把节点设回动作发生前的状态', () => {
    expect(orbitUndoTarget({ type: 'join', nodeId: 'sleep', prevState: 'candidate' }))
      .toEqual({ nodeId: 'sleep', state: 'candidate' });
  });

  it('撤销 leave：同样回到 prevState', () => {
    expect(orbitUndoTarget({ type: 'leave', nodeId: 'body', prevState: 'member' }))
      .toEqual({ nodeId: 'body', state: 'member' });
  });
});
