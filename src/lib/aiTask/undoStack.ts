/**
 * 容量 50 的撤销栈（A7 P5：图谱只发意图，栈归父级）。
 *
 * 栈里存的是「反悔需要的最小事实」：节点 id + 它之前的状态。撤销时父级把
 * 节点设回 `prevState`，组件按 props 重排——栈自己不碰布局。
 */
import type { AiTaskCategory } from '../bridge/types';

export type OrbitNodeState = 'member' | 'candidate' | 'disabled';

export interface OrbitUndoOp {
  type: 'join' | 'leave';
  nodeId: AiTaskCategory | string;
  prevState: OrbitNodeState;
}

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

/**
 * 一条撤销操作要恢复的目标：撤销 join/leave 都是把节点设回 `prevState`
 * （存的就是动作发生前的状态，方向不用在这里猜）。
 */
export const orbitUndoTarget = (op: OrbitUndoOp): { nodeId: string; state: OrbitNodeState } => ({
  nodeId: String(op.nodeId),
  state: op.prevState,
});
