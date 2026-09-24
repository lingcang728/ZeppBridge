/**
 * 关系网的节点与连线：任务（中心）→ 类别 → 指标。
 *
 * 纯函数，不碰 DOM 也不碰 Vue：输入草稿、预览和「哪些类别展开了」，
 * 输出这一帧该有哪些节点、谁连着谁、各自是不是要交给 AI、覆盖了多少。
 * 位置归 `layout.ts`，拖放判定归 `hit.ts`。
 */
import type { IconName } from '../../../components/Icon.vue';
import type { AiTask, AiTaskCategory, AiTaskPreview } from '../../bridge/types';
import { AI_TASK_CATEGORY_META, AI_TASK_CATEGORY_ORDER, categoryLabel, categoryRangeOf } from '../categories';
import { categoryCoverage } from '../coverage';
import { CATEGORY_METRICS, metricLabel } from '../metrics';

export type GraphNodeKind = 'center' | 'category' | 'metric';

export interface GraphNode {
  id: string;
  kind: GraphNodeKind;
  parentId: string | null;
  category: AiTaskCategory | null;
  metric: string | null;
  label: string;
  sublabel: string | null;
  icon: IconName | null;
  /** 这个节点自己是否要交给 AI（中心恒为 true）。 */
  included: boolean;
  /** 父节点被排除时，子节点即使 included 也不会导出——界面画成淡色。 */
  effective: boolean;
  /** 0..1 的覆盖率；还没有预览或不适用时为 null。 */
  coverage: number | null;
  /** 覆盖分母/分子（弹层里的「12/14 天」）；没有覆盖数据时为 null。 */
  daysHave: number | null;
  daysTotal: number | null;
  missing: boolean;
  /** 类别上的数字角标（附件个数）。 */
  badge: number | null;
  expandable: boolean;
  expanded: boolean;
  /** 类别节点的窗口设置（弹层控件用）；无窗口类别为 null。 */
  daysBefore: number | null;
  includeDay: boolean | null;
  /** 同一父节点下的序号与兄弟数，布局按它扇形展开。 */
  index: number;
  siblings: number;
}

export interface GraphLink {
  id: string;
  source: string;
  target: string;
  active: boolean;
}

export interface GraphModel {
  nodes: GraphNode[];
  links: GraphLink[];
}

export interface GraphInput {
  task: AiTask;
  preview: AiTaskPreview | null;
  expanded: ReadonlySet<AiTaskCategory>;
  centerLabel: string;
  centerSublabel: string | null;
  centerIcon: IconName;
  /** 类别副标题（例如「14 天」），由组件按界面语言给。 */
  daysLabel: (days: number) => string;
}

export const CENTER_ID = 'center';
export const categoryNodeId = (category: AiTaskCategory) => `cat:${category}`;
export const metricNodeId = (category: AiTaskCategory, metric: string) => `m:${category}:${metric}`;

/** 展示顺序：已知指标按 `CATEGORY_METRICS` 的顺序，其余按字母序跟在后面。 */
export const orderedMetrics = (category: AiTaskCategory, fromPreview: string[]): string[] => {
  const known = CATEGORY_METRICS[category] ?? [];
  const pool = fromPreview.length ? fromPreview : [...known];
  const rank = (metric: string) => {
    const index = known.indexOf(metric);
    return index < 0 ? known.length : index;
  };
  return [...pool].sort((a, b) => rank(a) - rank(b) || a.localeCompare(b));
};

const ratio = (have: number, total: number) => (total > 0 ? Math.min(1, have / total) : null);

export const buildGraph = (input: GraphInput): GraphModel => {
  const { task, preview, expanded } = input;
  const nodes: GraphNode[] = [{
    id: CENTER_ID, kind: 'center', parentId: null, category: null, metric: null,
    label: input.centerLabel, sublabel: input.centerSublabel, icon: input.centerIcon,
    included: true, effective: true, coverage: null, daysHave: null, daysTotal: null,
    missing: false, badge: null, expandable: false, expanded: false,
    daysBefore: null, includeDay: null, index: 0, siblings: 1,
  }];
  const links: GraphLink[] = [];

  AI_TASK_CATEGORY_ORDER.forEach((category, index) => {
    const meta = AI_TASK_CATEGORY_META[category];
    const range = categoryRangeOf(task.categories, category);
    const summary = categoryCoverage(preview, category);
    const id = categoryNodeId(category);
    const isExpanded = meta.hasWindow && range.enabled && expanded.has(category);
    nodes.push({
      id, kind: 'category', parentId: CENTER_ID, category, metric: null,
      label: categoryLabel(category),
      sublabel: meta.hasWindow && range.enabled ? input.daysLabel(range.days_before) : null,
      icon: meta.icon,
      included: range.enabled, effective: range.enabled,
      coverage: range.enabled && summary ? ratio(summary.daysWithData, summary.daysInRange) : null,
      daysHave: summary ? summary.daysWithData : null,
      daysTotal: summary ? summary.daysInRange : null,
      missing: range.enabled && Boolean(summary?.missing),
      badge: category === 'attachment' && task.attachments.length ? task.attachments.length : null,
      expandable: meta.hasWindow && range.enabled,
      expanded: isExpanded,
      daysBefore: meta.hasWindow ? range.days_before : null,
      includeDay: meta.hasWindow ? range.include_workout_day : null,
      index, siblings: AI_TASK_CATEGORY_ORDER.length,
    });
    links.push({ id: `l:${id}`, source: CENTER_ID, target: id, active: range.enabled });
    if (!isExpanded) return;

    const excluded = new Set(range.excluded_metrics ?? []);
    const metrics = orderedMetrics(category, summary?.metrics ?? []);
    metrics.forEach((metric, metricIndex) => {
      const metricId = metricNodeId(category, metric);
      const days = summary?.metricDays[metric] ?? 0;
      const included = !excluded.has(metric);
      nodes.push({
        id: metricId, kind: 'metric', parentId: id, category, metric,
        label: metricLabel(metric), sublabel: null, icon: null,
        included, effective: included && range.enabled,
        coverage: summary ? ratio(days, summary.daysInRange) : null,
        daysHave: summary ? days : null,
        daysTotal: summary ? summary.daysInRange : null,
        missing: Boolean(summary) && days === 0,
        badge: null, expandable: false, expanded: false,
        daysBefore: null, includeDay: null, index: metricIndex, siblings: metrics.length,
      });
      links.push({ id: `l:${metricId}`, source: id, target: metricId, active: included });
    });
  });
  return { nodes, links };
};

/** 悬停高亮用：一个节点和它直接相连的节点。 */
export const neighborIds = (model: GraphModel, id: string): Set<string> => {
  const set = new Set([id]);
  for (const link of model.links) {
    if (link.source === id) set.add(link.target);
    if (link.target === id) set.add(link.source);
  }
  return set;
};
