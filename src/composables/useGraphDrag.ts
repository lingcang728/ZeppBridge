import { onBeforeUnmount, ref, type ComputedRef } from 'vue';
import type { GraphNode } from '../lib/aiTask/graph/model';
import type { GraphRadii, LayoutNode } from '../lib/aiTask/graph/layout';
import { dropIncludes } from '../lib/aiTask/graph/hit';

type Point = { x: number; y: number };

/** 起拖的门槛：小于它算点击。指标点很小，手一抖就成了拖动，所以比以前的 6px 宽一些。 */
const CLICK_TOLERANCE = 9;

/**
 * 关系网里拖一个节点：拖进 / 拖出「交给 AI」的圈，指标拖离 / 拖回父类别。
 *
 * 为什么稳：拖动时只改节点的世界坐标，DOM 顺序和层级一概不动；指针事件挂在
 * window 上（不靠 setPointerCapture）；没走过门槛之前节点不动、松手算点击。
 * 拖动过程中的提示和松手时的判定用同一个 `dropIncludes`——看到的就是会发生的。
 */
export const useGraphDrag = (options: {
  nodeById: ComputedRef<Map<string, GraphNode>>;
  radii: ComputedRef<GraphRadii>;
  pos: (id: string) => LayoutNode;
  toLocal: (event: PointerEvent) => Point;
  localToWorld: (local: Point) => Point;
  /** 开始拖之前（停下镜头、收起弹层）。 */
  beforeDrag: () => void;
  /** 布局需要继续跑 / 画面需要重画。 */
  wake: () => void;
  redraw: () => void;
  /** 没拖动就松手：当成点击。 */
  onClick: (id: string) => void;
  /** 拖完松手，判定出来要不要交给 AI（和现在不一样才会调）。 */
  onDrop: (node: GraphNode, include: boolean) => void;
}) => {
  const drag = ref<{ id: string; grabX: number; grabY: number; startX: number; startY: number; moved: boolean } | null>(null);
  const dropHint = ref<'include' | 'exclude' | null>(null);

  const judge = (id: string) => {
    const node = options.nodeById.value.get(id);
    if (!node) return null;
    return dropIncludes(node, options.pos(id), node.parentId ? options.pos(node.parentId) : null, options.radii.value);
  };

  const onMove = (event: PointerEvent) => {
    const active = drag.value;
    if (!active) return;
    const local = options.toLocal(event);
    // 起步判定用累计位移：超过阈值才算「拖」，不然算点击；没起步之前节点不动。
    active.moved = active.moved || Math.hypot(local.x - active.startX, local.y - active.startY) >= CLICK_TOLERANCE;
    if (!active.moved) return;
    const world = options.localToWorld(local);
    const item = options.pos(active.id);
    item.x = world.x + active.grabX;
    item.y = world.y + active.grabY;
    const include = judge(active.id);
    dropHint.value = include === null ? null : include ? 'include' : 'exclude';
    options.redraw();
  };

  const end = (event?: Event) => {
    window.removeEventListener('pointerup', end);
    window.removeEventListener('pointermove', onMove);
    window.removeEventListener('pointercancel', end);
    const active = drag.value;
    drag.value = null;
    dropHint.value = null;
    if (!active) return;
    const node = options.nodeById.value.get(active.id);
    options.pos(active.id).dragging = false;
    if (!node || (event && event.type !== 'pointerup')) { options.wake(); return; }
    if (!active.moved) {
      options.onClick(active.id);
      options.wake();
      return;
    }
    const include = judge(active.id);
    if (include !== null && include !== node.included) options.onDrop(node, include);
    options.wake();
  };

  const start = (event: PointerEvent, node: GraphNode) => {
    options.beforeDrag();
    const local = options.toLocal(event);
    const world = options.localToWorld(local);
    const item = options.pos(node.id);
    drag.value = { id: node.id, grabX: item.x - world.x, grabY: item.y - world.y, startX: local.x, startY: local.y, moved: false };
    item.dragging = true;
    options.wake();
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', end, { once: true });
    window.addEventListener('pointercancel', end, { once: true });
  };

  onBeforeUnmount(() => end(new Event('blur')));

  return { drag, dropHint, start, cancel: end };
};
