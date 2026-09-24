/**
 * 布局（`layout.ts`）的契约：
 *   - 世界坐标以中心为原点；交给 AI 的类别在内圈 `inner`，不交的在
 *     外圈 `outer`，`boundary` 是拖放判定的分界线（inner < boundary < outer）；
 *   - 同样的输入收敛到同样的确定位置：指标从父类别的**当前**位置向外
 *     扇形展开，被拖的节点视为无限质量；
 *   - `settled` 在有限帧内必为真——宁可停在「差不多」也不许空转耗电。
 */
import { describe, expect, it } from 'vitest';
import type { AiTaskCategory } from '../../../bridge/types';
import { newTaskDraft } from '../../draft';
import { buildGraph, type GraphModel, type GraphNode } from '../model';
import {
  createLayout,
  fitZoom,
  graphRadii,
  snapLayout,
  stepLayout,
  syncLayout,
  targetOf,
  wakeLayout,
  type GraphRadii,
  type LayoutNode,
  type LayoutState,
} from '../layout';

const modelOf = (expand: AiTaskCategory[] = []): GraphModel =>
  buildGraph({
    task: newTaskDraft(),
    preview: null,
    expanded: new Set<AiTaskCategory>(expand),
    centerLabel: '任务',
    centerSublabel: null,
    centerIcon: 'spark',
    daysLabel: (days) => `${days} 天`,
  });

const RADII: GraphRadii = { inner: 50, outer: 120, boundary: 94, metricLength: 34 };

const byId = (model: GraphModel) => new Map(model.nodes.map((node) => [node.id, node]));
const graphNode = (model: GraphModel, id: string): GraphNode => {
  const node = byId(model).get(id);
  if (!node) throw new Error(`模型里没有节点 ${id}`);
  return node;
};
const layoutNode = (state: LayoutState, id: string): LayoutNode => {
  const node = state.nodes.get(id);
  if (!node) throw new Error(`布局里没有节点 ${id}`);
  return node;
};

describe('graphRadii', () => {
  it('inner < boundary < outer；小画布外圈保底 130', () => {
    // min/2 − 60 = 90 < 130 → 触发保底。
    const small = graphRadii(300, 300);
    expect(small.outer).toBe(130);
    expect(small.inner).toBeLessThan(small.boundary);
    expect(small.boundary).toBeLessThan(small.outer);
    expect(small.metricLength).toBeGreaterThan(0);
    const mid = graphRadii(800, 600);
    expect(mid.outer).toBe(240);
    expect(mid.inner).toBeLessThan(mid.boundary);
    expect(mid.boundary).toBeLessThan(mid.outer);
    const large = graphRadii(2000, 1600);
    expect(large.outer).toBe(740);
    expect(large.inner).toBeLessThan(large.boundary);
    expect(large.boundary).toBeLessThan(large.outer);
  });
});

describe('syncLayout', () => {
  it('按模型建布局点：中心在原点，指标从父节点位置长出来，变化后重新计帧', () => {
    const state = createLayout();
    const model = modelOf(['sleep']);
    syncLayout(state, model, RADII);
    expect(state.nodes.size).toBe(model.nodes.length);
    expect(state.settled).toBe(false);
    const center = layoutNode(state, 'center');
    expect(center.x).toBe(0);
    expect(center.y).toBe(0);
    const parent = layoutNode(state, 'cat:sleep');
    const metric = layoutNode(state, 'm:sleep:score');
    expect(metric.x).toBe(parent.x);
    expect(metric.y).toBe(parent.y);
  });

  it('模型里消失的节点从布局删掉，留下的保留位置（画面是连续过渡）', () => {
    const state = createLayout();
    syncLayout(state, modelOf(['sleep']), RADII);
    const kept = layoutNode(state, 'cat:workout');
    kept.x = 12.5;
    kept.y = -7.5;
    syncLayout(state, modelOf(), RADII);
    expect(state.nodes.has('m:sleep:score')).toBe(false);
    expect(layoutNode(state, 'cat:workout').x).toBe(12.5);
    expect(layoutNode(state, 'cat:workout').y).toBe(-7.5);
  });
});

describe('snapLayout', () => {
  it('所有节点落到目标位置并立即 settled：启用的在 inner，禁用的在 outer', () => {
    const state = createLayout();
    const model = modelOf(['sleep']);
    syncLayout(state, model, RADII);
    snapLayout(state, model, RADII);
    expect(state.settled).toBe(true);
    const nodes = byId(model);
    for (const node of model.nodes) {
      const item = layoutNode(state, node.id);
      const expected = targetOf(
        node,
        node.parentId ? state.nodes.get(node.parentId) : undefined,
        RADII,
        node.parentId ? nodes.get(node.parentId) : undefined,
      );
      expect(item.x).toBeCloseTo(expected.x, 10);
      expect(item.y).toBeCloseTo(expected.y, 10);
      expect(item.vx).toBe(0);
      expect(item.vy).toBe(0);
    }
    const sleep = layoutNode(state, 'cat:sleep');
    expect(Math.hypot(sleep.x, sleep.y)).toBeCloseTo(RADII.inner, 10);
    const note = layoutNode(state, 'cat:personal_note');
    expect(Math.hypot(note.x, note.y)).toBeCloseTo(RADII.outer, 10);
  });
});

describe('stepLayout', () => {
  it('有限帧内收敛：settled 为真、所有坐标有限，中心钉在原点', () => {
    const state = createLayout();
    const model = modelOf(['sleep']);
    syncLayout(state, model, RADII);
    for (let i = 0; i < 400 && !state.settled; i += 1) {
      stepLayout(state, model, RADII, 16.7);
    }
    expect(state.settled).toBe(true);
    for (const item of state.nodes.values()) {
      expect(Number.isFinite(item.x)).toBe(true);
      expect(Number.isFinite(item.y)).toBe(true);
      expect(Number.isFinite(item.vx)).toBe(true);
      expect(Number.isFinite(item.vy)).toBe(true);
    }
    const center = layoutNode(state, 'center');
    expect(center.x).toBe(0);
    expect(center.y).toBe(0);
  });

  it('正在拖的节点是无限质量：弹簧和碰撞都推不动它', () => {
    const state = createLayout();
    const model = modelOf(['sleep']);
    syncLayout(state, model, RADII);
    const dragged = layoutNode(state, 'cat:sleep');
    dragged.dragging = true;
    dragged.x = 12.5;
    dragged.y = -7.5;
    for (let i = 0; i < 30; i += 1) stepLayout(state, model, RADII, 16.7);
    expect(dragged.x).toBe(12.5);
    expect(dragged.y).toBe(-7.5);
  });
});

describe('targetOf', () => {
  it('中心恒为原点；类别的目标半径按 included 分 inner/outer', () => {
    const model = modelOf();
    expect(targetOf(graphNode(model, 'center'), undefined, RADII)).toEqual({ x: 0, y: 0 });
    const sleep = targetOf(graphNode(model, 'cat:sleep'), undefined, RADII);
    expect(Math.hypot(sleep.x, sleep.y)).toBeCloseTo(RADII.inner, 10);
    const note = targetOf(graphNode(model, 'cat:personal_note'), undefined, RADII);
    expect(Math.hypot(note.x, note.y)).toBeCloseTo(RADII.outer, 10);
  });

  it('指标的目标跟着父节点的当前位置走', () => {
    const model = modelOf(['sleep']);
    const metric = graphNode(model, 'm:sleep:score');
    const parent = graphNode(model, 'cat:sleep');
    const at: LayoutNode = { id: 'p', x: 10, y: -20, vx: 0, vy: 0, dragging: false };
    const t1 = targetOf(metric, at, RADII, parent);
    const t2 = targetOf(metric, { ...at, x: 60, y: 35 }, RADII, parent);
    expect(t2.x - t1.x).toBeCloseTo(50, 10);
    expect(t2.y - t1.y).toBeCloseTo(55, 10);
    // 父节点还没进布局时从原点起算，不出 NaN。
    const t0 = targetOf(metric, undefined, RADII, parent);
    expect(Number.isFinite(t0.x)).toBe(true);
    expect(Number.isFinite(t0.y)).toBe(true);
  });
});

describe('wakeLayout / fitZoom', () => {
  it('snap 之后 wake 重新计帧', () => {
    const state = createLayout();
    const model = modelOf();
    syncLayout(state, model, RADII);
    snapLayout(state, model, RADII);
    expect(state.settled).toBe(true);
    wakeLayout(state);
    expect(state.settled).toBe(false);
    expect(state.frames).toBe(0);
    expect(state.stableFrames).toBe(0);
  });

  it('fitZoom 夹在 [0.5, 1.6]：空图给上限，节点太远给下限', () => {
    const state = createLayout();
    expect(fitZoom(state, 800, 600)).toBe(1.6);
    state.nodes.set('far', { id: 'far', x: 10000, y: 0, vx: 0, vy: 0, dragging: false });
    expect(fitZoom(state, 800, 600)).toBe(0.5);
    const normal = createLayout();
    syncLayout(normal, modelOf(['sleep']), RADII);
    const zoom = fitZoom(normal, 800, 600);
    expect(zoom).toBeGreaterThanOrEqual(0.5);
    expect(zoom).toBeLessThanOrEqual(1.6);
  });
});
