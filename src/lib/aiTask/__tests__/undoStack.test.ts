import { describe, expect, it } from 'vitest';
import { createUndoStack, UNDO_CAP } from '../undoStack';

describe('createUndoStack', () => {
  it('push/pop 后进先出，canUndo 反映栈空不空', () => {
    const stack = createUndoStack<string>();
    expect(stack.canUndo).toBe(false);
    stack.push('sleep');
    stack.push('body');
    expect(stack.size).toBe(2);
    expect(stack.pop()).toBe('body');
    expect(stack.pop()).toBe('sleep');
    expect(stack.pop()).toBeUndefined();
    expect(stack.canUndo).toBe(false);
  });

  it('容量封顶 50：溢出丢最旧的，栈顶永远是最新动作', () => {
    const stack = createUndoStack<string>();
    for (let index = 0; index < UNDO_CAP + 10; index += 1) stack.push(`n-${index}`);
    expect(stack.size).toBe(UNDO_CAP);
    expect(stack.pop()).toBe(`n-${UNDO_CAP + 9}`);
    const ids = stack.entries();
    expect(ids).not.toContain('n-0');
    expect(ids[0]).toBe('n-10');
  });

  it('clear 之后栈空', () => {
    const stack = createUndoStack<string>();
    stack.push('sleep');
    stack.clear();
    expect(stack.size).toBe(0);
  });
});
