/**
 * 关系网布局：每个节点有一个确定的「家」（目标位置），用弹簧拉过去，
 * 节点之间做碰撞推开。效果像 Obsidian 的力导向图，但永远会停下来、
 * 同样的输入永远落在同样的位置——测试可以直接跑 `stepLayout`。
 *
 * 几何（世界坐标，中心在原点，单位 = 视图像素 @ 缩放 1）：
 *   - 交给 AI 的类别在内圈 `inner`，不交的在外圈 `outer`；
 *   - 两圈之间的 `boundary` 就是界面上那个「交给 AI」的圈；
 *   - 展开的指标从父类别向外扇形排开，被排除的指标离父节点更远、落到圈外。
 */
import type { GraphModel, GraphNode } from './model';

export interface GraphRadii {
  inner: number;
  outer: number;
  boundary: number;
  metricLength: number;
}

export const NODE_RADIUS = { center: 30, category: 20, metric: 9 } as const;
/** 碰撞时额外预留的空间（标签占的地方）。 */
const LABEL_PAD = { center: 18, category: 26, metric: 16 } as const;
const SPRING_K = 0.08;
const DAMPING = 0.8;
const MAX_SPEED = 14;
const SETTLE_ENERGY = 0.05;
const SETTLE_FRAMES = 20;
const EXCLUDED_METRIC_STRETCH = 1.75;
/** 同一层相邻指标之间至少留这么宽（标签不叠）。 */
const METRIC_SPACING = 40;
/** 一次变化最多模拟这么多帧就强制停下——宁可停在「差不多」也不空转耗电。 */
const MAX_FRAMES_PER_CHANGE = 300;

export const graphRadii = (width: number, height: number): GraphRadii => {
  const outer = Math.max(130, Math.min(width, height) / 2 - 60);
  return { inner: outer * 0.42, outer, boundary: outer * 0.78, metricLength: outer * 0.28 };
};

export interface LayoutNode {
  id: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  dragging: boolean;
}

export interface LayoutState {
  nodes: Map<string, LayoutNode>;
  stableFrames: number;
  /** 上次 sync 以来跑了多少帧。 */
  frames: number;
  settled: boolean;
}

const categoryAngle = (node: GraphNode) => -Math.PI / 2 + (2 * Math.PI * node.index) / Math.max(1, node.siblings);

/** 一个节点此刻的目标位置。指标跟着父节点的**当前**位置走——拖父节点时孩子一起动。 */
export const targetOf = (node: GraphNode, parent: LayoutNode | undefined, radii: GraphRadii, parentNode?: GraphNode) => {
  if (node.kind === 'center') return { x: 0, y: 0 };
  if (node.kind === 'category') {
    const angle = categoryAngle(node);
    const r = node.included ? radii.inner : radii.outer;
    return { x: r * Math.cos(angle), y: r * Math.sin(angle) };
  }
  const base = parentNode ? categoryAngle(parentNode) : 0;
  const count = node.siblings;
  const spread = Math.min(Math.PI * 0.95, count * 0.4);
  const step = count > 1 ? spread / (count - 1) : 0;
  const angle = base + (node.index - (count - 1) / 2) * step;
  // 指标多时交错成两层；半径保证同层相邻指标的弧长不小于 METRIC_SPACING，
  // 目标位置本身不重叠，碰撞才不会和弹簧打架。
  const twoLayers = count > 8;
  const sameLayerStep = twoLayers ? step * 2 : step;
  const baseLength = sameLayerStep > 0
    ? Math.min(radii.outer * 0.55, Math.max(radii.metricLength, METRIC_SPACING / sameLayerStep))
    : radii.metricLength;
  const layer = twoLayers && node.index % 2 === 1 ? 1.35 : 1;
  const length = baseLength * layer * (node.included ? 1 : EXCLUDED_METRIC_STRETCH);
  const origin = parent ?? { x: 0, y: 0 };
  return { x: origin.x + length * Math.cos(angle), y: origin.y + length * Math.sin(angle) };
};

export const createLayout = (): LayoutState => ({ nodes: new Map(), stableFrames: 0, frames: 0, settled: false });

/**
 * 让布局和模型对齐：新节点从父节点的位置「长出来」，消失的节点删掉。
 * 已有节点保留位置与速度，所以模型变化时画面是连续过渡而不是跳变。
 */
export const syncLayout = (state: LayoutState, model: GraphModel, radii: GraphRadii): void => {
  const alive = new Set(model.nodes.map((node) => node.id));
  for (const id of state.nodes.keys()) if (!alive.has(id)) state.nodes.delete(id);
  const byId = new Map(model.nodes.map((node) => [node.id, node]));
  for (const node of model.nodes) {
    if (state.nodes.has(node.id)) continue;
    const parent = node.parentId ? state.nodes.get(node.parentId) : undefined;
    const spawn = node.kind === 'category'
      ? targetOf(node, undefined, radii)
      : parent
        ? { x: parent.x, y: parent.y }
        : targetOf(node, undefined, radii, node.parentId ? byId.get(node.parentId) : undefined);
    state.nodes.set(node.id, { id: node.id, x: spawn.x, y: spawn.y, vx: 0, vy: 0, dragging: false });
  }
  wakeLayout(state);
};

/** 有东西变了（模型、拖拽）：重新开始计帧。 */
export const wakeLayout = (state: LayoutState): void => {
  state.stableFrames = 0;
  state.frames = 0;
  state.settled = false;
};

/** 所有节点直接落到目标位置（减少动态效果 / 首帧）。 */
export const snapLayout = (state: LayoutState, model: GraphModel, radii: GraphRadii): void => {
  const byId = new Map(model.nodes.map((node) => [node.id, node]));
  for (const node of model.nodes) {
    const item = state.nodes.get(node.id);
    if (!item) continue;
    const parentNode = node.parentId ? byId.get(node.parentId) : undefined;
    const target = targetOf(node, node.parentId ? state.nodes.get(node.parentId) : undefined, radii, parentNode);
    Object.assign(item, { x: target.x, y: target.y, vx: 0, vy: 0 });
  }
  state.stableFrames = SETTLE_FRAMES;
  state.settled = true;
};

const bodyRadius = (node: GraphNode) => NODE_RADIUS[node.kind] + LABEL_PAD[node.kind];

/** 前进一帧。`dtMs` 是真实帧间隔，封顶 33ms，后台切回来不会把节点弹飞。 */
export const stepLayout = (state: LayoutState, model: GraphModel, radii: GraphRadii, dtMs = 16.7): void => {
  const dt = Math.min(Math.max(dtMs, 0), 33) / 16.7;
  const damp = Math.pow(DAMPING, dt);
  const byId = new Map(model.nodes.map((node) => [node.id, node]));

  for (const node of model.nodes) {
    const item = state.nodes.get(node.id);
    if (!item || item.dragging) continue;
    if (node.kind === 'center') {
      Object.assign(item, { x: 0, y: 0, vx: 0, vy: 0 });
      continue;
    }
    const parentNode = node.parentId ? byId.get(node.parentId) : undefined;
    const target = targetOf(node, node.parentId ? state.nodes.get(node.parentId) : undefined, radii, parentNode);
    item.vx = (item.vx + (target.x - item.x) * SPRING_K * dt) * damp;
    item.vy = (item.vy + (target.y - item.y) * SPRING_K * dt) * damp;
    const speed = Math.hypot(item.vx, item.vy);
    if (speed > MAX_SPEED) {
      item.vx *= MAX_SPEED / speed;
      item.vy *= MAX_SPEED / speed;
    }
    item.x += item.vx * dt;
    item.y += item.vy * dt;
  }

  // 碰撞：位置修正，被拖的节点和中心不动（无限质量）。
  const bodies = model.nodes
    .map((node) => ({ node, item: state.nodes.get(node.id) }))
    .filter((entry): entry is { node: GraphNode; item: LayoutNode } => entry.item !== undefined);
  for (let i = 0; i < bodies.length; i += 1) {
    for (let j = i + 1; j < bodies.length; j += 1) {
      const a = bodies[i];
      const b = bodies[j];
      const min = bodyRadius(a.node) + bodyRadius(b.node) - 14;
      const dx = b.item.x - a.item.x;
      const dy = b.item.y - a.item.y;
      const dist = Math.hypot(dx, dy) || 0.01;
      if (dist >= min) continue;
      const fixedA = a.item.dragging || a.node.kind === 'center';
      const fixedB = b.item.dragging || b.node.kind === 'center';
      if (fixedA && fixedB) continue;
      const push = min - dist;
      const shareA = fixedA ? 0 : fixedB ? 1 : 0.5;
      const shareB = fixedB ? 0 : fixedA ? 1 : 0.5;
      a.item.x -= (dx / dist) * push * shareA;
      a.item.y -= (dy / dist) * push * shareA;
      b.item.x += (dx / dist) * push * shareB;
      b.item.y += (dy / dist) * push * shareB;
      // 接触时削掉速度：持续接触会收敛成「贴着不动」，而不是一直抖。
      for (const body of [a.item, b.item]) {
        body.vx *= 0.5;
        body.vy *= 0.5;
      }
    }
  }

  let energy = 0;
  for (const item of state.nodes.values()) if (!item.dragging) energy += item.vx * item.vx + item.vy * item.vy;
  state.frames += 1;
  state.stableFrames = energy < SETTLE_ENERGY ? state.stableFrames + 1 : 0;
  state.settled = state.stableFrames >= SETTLE_FRAMES || state.frames >= MAX_FRAMES_PER_CHANGE;
};

/** 能完整装下所有节点与标签的缩放倍数（「适应画布」按钮用）。 */
export const fitZoom = (state: LayoutState, width: number, height: number): number => {
  let extent = 1;
  for (const item of state.nodes.values()) extent = Math.max(extent, Math.abs(item.x) + 60, Math.abs(item.y) + 50);
  return Math.min(1.6, Math.max(0.5, Math.min(width, height) / 2 / extent));
};
