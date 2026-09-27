/**
 * 拖放判定：松手时这个节点要交给 AI 还是不要。拖动过程中的提示用同一个
 * 函数，所以「看到的」就是「松手后会发生的」。
 *
 *   - 类别：落在「交给 AI」圈（`boundary`）以内 = 加入，以外 = 移出。
 *   - 指标：离父类别不超过它自己那一圈再往外一点（METRIC_KEEP_MARGIN）= 保留，
 *     拖远 = 排除。被排除的指标本来就摆在这条线外面，拖回圈里就是保留。
 *
 * 只有一条线，没有「中间地带」——旧版要把球拖出画布外才算移除，就是
 * 两条阈值中间留了一大片死区。
 */
import type { GraphNode } from './model';
import { METRIC_KEEP_MARGIN, metricSlot, type GraphRadii } from './layout';

export interface Point {
  x: number;
  y: number;
}

export const dropIncludes = (
  node: Pick<GraphNode, 'kind'> & Partial<Pick<GraphNode, 'index' | 'siblings'>>,
  position: Point,
  parent: Point | null,
  radii: GraphRadii,
): boolean | null => {
  if (node.kind === 'category') return Math.hypot(position.x, position.y) < radii.boundary;
  if (node.kind === 'metric' && parent) {
    const ring = metricSlot(node.index ?? 0, node.siblings ?? 1, radii).radius;
    return Math.hypot(position.x - parent.x, position.y - parent.y) < ring + METRIC_KEEP_MARGIN;
  }
  return null;
};
