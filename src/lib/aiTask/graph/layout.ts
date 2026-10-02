/**
 * 关系网布局：每个节点有一个确定的「家」（目标位置），用弹簧拉过去，
 * 节点之间做碰撞推开。效果像 Obsidian 的力导向图，但永远会停下来、
 * 同样的输入永远落在同样的位置——测试可以直接跑 `stepLayout`。
 *
 * 几何（世界坐标，中心在原点，单位 = 视图像素 @ 缩放 1）：
 *   - 交给 AI 的类别在内圈 `inner`，不交的在圈外（`outer` 一圈；画布够宽时摆在圈的左右两侧，
 *     不占上下的高度——高度是最紧的那一边）；
 *   - `boundary` 就是界面上那个「交给 AI」的圈；
 *   - 展开的指标从父类别向外排成几层同心弧（见 `metricSlot`），被排除的指标
 *     往外推出自己那一层。
 */
import type { GraphModel, GraphNode } from './model';

export interface GraphRadii {
  inner: number;
  outer: number;
  boundary: number;
  metricLength: number;
  /** 画布够宽：不交的类别摆在虚线圈的左右两侧，而不是沿圆周。 */
  sideways?: boolean;
}

/** 类别节点外面还有一圈日环（再宽 13px）和两行标签，所以半径比画出来的圆大一圈。 */
export const NODE_RADIUS = { center: 42, category: 27, metric: 10 } as const;
/** 碰撞时额外预留的空间（日环 + 标签占的地方）。 */
const LABEL_PAD = { center: 26, category: 38, metric: 18 } as const;
/** 不交的类别离虚线圈多远（圆心到节点）：节点半径 + 日环 + 一点空。 */
export const SIDE_GAP = 70;
const SPRING_K = 0.08;
const DAMPING = 0.8;
const MAX_SPEED = 14;
const SETTLE_ENERGY = 0.05;
const SETTLE_FRAMES = 20;
/** 同一圈上相邻两个指标之间的弧长：一个标签的宽度。 */
export const METRIC_SLOT = 108;
/** 相邻两圈之间的距离：小圆点 + 下面一行标签 + 一点空。 */
export const METRIC_RING_GAP = 66;
/** 指标弧最多张开这么大，朝中心留出缺口（那边是连回中心的线和中心节点）。 */
const METRIC_SPREAD = Math.PI * 1.55;
/** 被排除的指标往外推出自己那一圈这么远；拖回这一圈以内就算保留（见 hit.ts）。 */
export const METRIC_EXCLUDE_PUSH = 56;
export const METRIC_KEEP_MARGIN = 34;
/** 一次变化最多模拟这么多帧就强制停下——宁可停在「差不多」也不空转耗电。 */
const MAX_FRAMES_PER_CHANGE = 300;

/**
 * `width` / `height` 是**看得见的那一块**（扣掉浮在上面的任务名胶囊和交付坞）。
 * 画布够宽时圈几乎占满高度，不交的类别摆在左右；窄了就退回沿圆周摆在外圈。
 */
export const graphRadii = (width: number, height: number): GraphRadii => {
  const half = Math.min(width, height) / 2;
  const sideways = width >= height * 1.35;
  const boundary = Math.max(110, half - (sideways ? 46 : 96));
  const outer = boundary + SIDE_GAP;
  return { inner: boundary * 0.64, outer, boundary, metricLength: boundary * 0.3, sideways };
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

/**
 * 第 `index` 个指标（共 `count` 个）排在哪一圈、这一圈上偏离父类别朝向多少弧度。
 *
 * 指标一多（「恢复状态」有二十多个），以前是在一段扇形里左右交错两层，标签叠成
 * 一团、点也点不准。现在排成几层同心弧：每一圈能放几个由这一圈的弧长除以一个标签
 * 的宽度决定，内圈放满了再放外圈；每一圈只张开到刚好放下它那几个的角度，居中对着
 * 父类别朝外的方向。
 */
export const metricSlot = (index: number, count: number, radii: GraphRadii): { ring: number; radius: number; offset: number } => {
  let radius = Math.max(radii.metricLength, 90);
  let remaining = index;
  let left = Math.max(1, count);
  for (let ring = 0; ; ring += 1) {
    const capacity = Math.max(1, Math.floor((METRIC_SPREAD * radius) / METRIC_SLOT) + 1);
    const here = Math.min(capacity, left);
    if (remaining < here) {
      const spread = here > 1 ? Math.min(METRIC_SPREAD, ((here - 1) * METRIC_SLOT) / radius) : 0;
      const offset = here > 1 ? -spread / 2 + (remaining * spread) / (here - 1) : 0;
      return { ring, radius, offset };
    }
    remaining -= here;
    left -= here;
    radius += METRIC_RING_GAP;
  }
};

/** 一个节点此刻的目标位置。指标跟着父节点的**当前**位置走——拖父节点时孩子一起动。 */
export const targetOf = (node: GraphNode, parent: LayoutNode | undefined, radii: GraphRadii, parentNode?: GraphNode) => {
  if (node.kind === 'center') return { x: 0, y: 0 };
  if (node.kind === 'category') {
    const angle = categoryAngle(node);
    if (!node.included && radii.sideways) {
      // 左右交替摆，竖直位置沿用它本来的角度，几个不交的类别不会叠在一起。
      const side = node.index % 2 === 0 ? -1 : 1;
      return { x: side * (radii.boundary + SIDE_GAP), y: Math.sin(angle) * radii.boundary * 0.62 };
    }
    const r = node.included ? radii.inner : radii.outer;
    return { x: r * Math.cos(angle), y: r * Math.sin(angle) };
  }
  const base = parentNode ? categoryAngle(parentNode) : 0;
  const slot = metricSlot(node.index, node.siblings, radii);
  const angle = base + slot.offset;
  const length = slot.radius + (node.included ? 0 : METRIC_EXCLUDE_PUSH);
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

/**
 * 聚焦某一类时镜头该停在哪儿：框住这一类和它展开的全部指标（按目标位置算，
 * 不等弹簧跑完），留出标签的余量，放大到正好装下——但至少放大到 1.15 倍，
 * 不然「俯冲进去」就没有进去的感觉。
 */
export const focusFrame = (
  model: GraphModel,
  categoryId: string,
  radii: GraphRadii,
  size: { width: number; height: number },
): { x: number; y: number; zoom: number } | null => {
  const byId = new Map(model.nodes.map((node) => [node.id, node]));
  const parentNode = byId.get(categoryId);
  if (!parentNode) return null;
  const parentTarget = targetOf(parentNode, undefined, radii);
  const points = [parentTarget];
  for (const node of model.nodes) {
    if (node.parentId !== categoryId) continue;
    points.push(targetOf(node, { id: categoryId, ...parentTarget, vx: 0, vy: 0, dragging: false }, radii, parentNode));
  }
  const pad = 70;
  const xs = points.map((p) => p.x);
  const ys = points.map((p) => p.y);
  const minX = Math.min(...xs) - pad;
  const maxX = Math.max(...xs) + pad;
  const minY = Math.min(...ys) - pad;
  const maxY = Math.max(...ys) + pad * 0.8;
  const zoom = Math.min(size.width / (maxX - minX), size.height / (maxY - minY));
  // 至少放大到 1.15 倍，「俯冲进去」才有进去的感觉；指标多到一屏放不下时宁可少放大一点，
  // 也要把整组装进画面——以前硬放大到 1.15，外圈的指标和标签被切在画布外面。
  return { x: (minX + maxX) / 2, y: (minY + maxY) / 2, zoom: Math.min(1.6, Math.max(Math.min(1.15, zoom), 0.7)) };
};
