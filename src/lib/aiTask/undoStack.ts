/**
 * 容量 50 的撤销栈。栈只存「反悔需要的事实」，怎么恢复由调用方决定——
 * 任务草稿存的是动作前那一刻的选择快照（见 `useAiTaskDraft`）。
 */
export const UNDO_CAP = 50;

export interface UndoStack<T> {
  push(op: T): void;
  pop(): T | undefined;
  peek(): T | undefined;
  clear(): void;
  readonly size: number;
  readonly canUndo: boolean;
  /** 只读视图，测试和排查用。 */
  entries(): readonly T[];
}

export const createUndoStack = <T>(cap: number = UNDO_CAP): UndoStack<T> => {
  const ops: T[] = [];
  return {
    push(op) {
      ops.push(op);
      // 溢出丢最旧的：撤销的意义随时间衰减，栈顶必须是最近的动作。
      if (ops.length > cap) ops.splice(0, ops.length - cap);
    },
    pop: () => ops.pop(),
    peek: () => ops[ops.length - 1],
    clear: () => {
      ops.length = 0;
    },
    get size() {
      return ops.length;
    },
    get canUndo() {
      return ops.length > 0;
    },
    entries: () => ops,
  };
};
