/**
 * 拖放判定：松手时这个节点要交给 AI 还是不要。拖动过程中的提示用同一个
 * 函数，所以「看到的」就是「松手后会发生的」。
 *
 *   - 类别：落在「交给 AI」圈（`boundary`）以内 = 加入，以外 = 移出。
 *   - 指标：离父类别不超过展开长度的 1.4 倍 = 保留，拖远 = 排除。
 *
 * 只有一条线，没有「中间地带」——旧版要把球拖出画布外才算移除，就是
 * 两条阈值中间留了一大片死区。
 */
import type { GraphNode } from './model';
import type { GraphRadii } from './layout';

export interface Point {
  x: number;
  y: number;
}

const METRIC_KEEP_FACTOR = 1.4;

export const dropIncludes = (
  node: Pick<GraphNode, 'kind'>,
  position: Point,
  parent: Point | null,
  radii: GraphRadii,
): boolean | null => {
  if (node.kind === 'category') return Math.hypot(position.x, position.y) < radii.boundary;
  if (node.kind === 'metric' && parent) {
    return Math.hypot(position.x - parent.x, position.y - parent.y) < radii.metricLength * METRIC_KEEP_FACTOR;
  }
  return null;
};
