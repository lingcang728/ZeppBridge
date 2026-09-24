/**
 * 关系网模型（`buildGraph`）的契约：
 *   - 一帧的图 = 中心 + 每个类别一个节点 + 展开类别的指标节点；
 *   - `included` 是节点自己的开关，`effective` 还要父节点也交；连线的
 *     `active` 与之一致——被排除的部分绝不能出现在导出里；
 *   - `coverage`/`missing`/`badge` 如实反映预览，没有预览一律不给数。
 */
import { describe, expect, it } from 'vitest';
import type {
  AiTask,
  AiTaskAttachmentRef,
  AiTaskCategory,
  AiTaskCoverage,
  AiTaskPreview,
} from '../../../bridge/types';
import { AI_TASK_CATEGORY_META, AI_TASK_CATEGORY_ORDER } from '../../categories';
import { newTaskDraft } from '../../draft';
import { CATEGORY_METRICS } from '../../metrics';
import {
  CENTER_ID,
  buildGraph,
  categoryNodeId,
  metricNodeId,
  neighborIds,
  orderedMetrics,
  type GraphInput,
  type GraphModel,
} from '../model';

const inputOf = (patch: Partial<GraphInput> = {}): GraphInput => ({
  task: newTaskDraft(),
  preview: null,
  expanded: new Set<AiTaskCategory>(),
  centerLabel: '任务',
  centerSublabel: null,
  centerIcon: 'spark',
  daysLabel: (days) => `${days} 天`,
  ...patch,
});

const patchRange = (
  task: AiTask,
  category: AiTaskCategory,
  patch: Partial<AiTask['categories'][number]>,
): AiTask => ({
  ...task,
  categories: task.categories.map((range) =>
    range.category === category ? { ...range, ...patch } : range),
});

const coverageOf = (patch: Partial<AiTaskCoverage> = {}): AiTaskCoverage => ({
  category: 'sleep',
  workout_id: null,
  start_date: '2026-03-01',
  end_date: '2026-03-10',
  days_in_range: 10,
  days_with_data: 7,
  sources: ['zepp'],
  units: { score: 'pt' },
  missing: false,
  ...patch,
});

const previewOf = (coverage: AiTaskCoverage[]): AiTaskPreview => ({
  task_id: 'draft', workouts: [], coverage, attachments: [], estimated_bytes: 0, warnings: [],
});

const attachment = (id: string): AiTaskAttachmentRef => ({
  id, path: `C:\\docs\\${id}.pdf`, display_name: `${id}.pdf`,
  kind: 'pdf', byte_len: 10, added_at: '2026-01-01T00:00:00Z',
});

const nodeById = (model: GraphModel, id: string) => {
  const node = model.nodes.find((item) => item.id === id);
  if (!node) throw new Error(`模型里没有节点 ${id}`);
  return node;
};
const linkTo = (model: GraphModel, target: string) =>
  model.links.find((link) => link.target === target);
const metricIds = (model: GraphModel, category: AiTaskCategory) =>
  model.nodes
    .filter((node) => node.kind === 'metric' && node.category === category)
    .map((node) => node.id);

describe('buildGraph · 骨架', () => {
  it('没有预览：中心 + 每个类别一个节点，类别全挂中心', () => {
    const model = buildGraph(inputOf());
    expect(model.nodes).toHaveLength(1 + AI_TASK_CATEGORY_ORDER.length);
    const center = nodeById(model, CENTER_ID);
    expect(center.kind).toBe('center');
    expect(center.included).toBe(true);
    expect(center.effective).toBe(true);
    // 中心图标透传输入；类别图标来自 AI_TASK_CATEGORY_META。
    expect(center.icon).toBe('spark');
    expect(nodeById(model, 'cat:sleep').icon).toBe(AI_TASK_CATEGORY_META.sleep.icon);
    for (const category of AI_TASK_CATEGORY_ORDER) {
      const node = nodeById(model, categoryNodeId(category));
      expect(node.kind).toBe('category');
      expect(node.parentId).toBe(CENTER_ID);
      // 预览没来之前不编覆盖率，也不喊缺失。
      expect(node.coverage).toBeNull();
      expect(node.missing).toBe(false);
    }
    expect(model.links).toHaveLength(AI_TASK_CATEGORY_ORDER.length);
    for (const category of AI_TASK_CATEGORY_ORDER) {
      const link = linkTo(model, categoryNodeId(category));
      expect(link?.source).toBe(CENTER_ID);
      expect(link?.id).toBe(`l:${categoryNodeId(category)}`);
    }
  });

  it('included/effective 跟启用开关走；禁用类别的连线不 active', () => {
    const model = buildGraph(inputOf({
      task: patchRange(newTaskDraft(), 'sleep', { enabled: false }),
    }));
    const sleep = nodeById(model, 'cat:sleep');
    expect(sleep.included).toBe(false);
    expect(sleep.effective).toBe(false);
    expect(sleep.expandable).toBe(false);
    expect(linkTo(model, 'cat:sleep')?.active).toBe(false);
    const heart = nodeById(model, 'cat:heart_rate');
    expect(heart.included).toBe(true);
    expect(heart.effective).toBe(true);
    expect(linkTo(model, 'cat:heart_rate')?.active).toBe(true);
  });
});

describe('buildGraph · 展开与指标', () => {
  it('展开的已启用窗口类别长出指标节点，挂在类别下面', () => {
    const model = buildGraph(inputOf({ expanded: new Set<AiTaskCategory>(['sleep']) }));
    const known = CATEGORY_METRICS.sleep ?? [];
    expect(known.length).toBeGreaterThan(0);
    expect(metricIds(model, 'sleep')).toHaveLength(known.length);
    const cat = nodeById(model, 'cat:sleep');
    expect(cat.expanded).toBe(true);
    expect(cat.expandable).toBe(true);
    for (const metric of known) {
      const id = metricNodeId('sleep', metric);
      const node = nodeById(model, id);
      expect(node.kind).toBe('metric');
      expect(node.parentId).toBe('cat:sleep');
      expect(node.included).toBe(true);
      expect(node.effective).toBe(true);
      const link = linkTo(model, id);
      expect(link?.source).toBe('cat:sleep');
      expect(link?.active).toBe(true);
    }
    expect(model.nodes).toHaveLength(1 + AI_TASK_CATEGORY_ORDER.length + known.length);
  });

  it('禁用的类别不能展开：expanded 名单里有它也不长指标', () => {
    const model = buildGraph(inputOf({
      task: patchRange(newTaskDraft(), 'sleep', { enabled: false }),
      expanded: new Set<AiTaskCategory>(['sleep']),
    }));
    expect(metricIds(model, 'sleep')).toHaveLength(0);
    expect(nodeById(model, 'cat:sleep').expanded).toBe(false);
  });

  it('无窗口类别（attachment）即使启用也不能展开', () => {
    const model = buildGraph(inputOf({
      task: patchRange(newTaskDraft(), 'attachment', { enabled: true }),
      expanded: new Set<AiTaskCategory>(['attachment']),
    }));
    expect(metricIds(model, 'attachment')).toHaveLength(0);
    const node = nodeById(model, 'cat:attachment');
    expect(node.expanded).toBe(false);
    expect(node.expandable).toBe(false);
    // 启用本身不受影响：它仍然是一条要交给 AI 的线。
    expect(node.included).toBe(true);
    expect(linkTo(model, 'cat:attachment')?.active).toBe(true);
  });

  it('excluded_metrics 的指标 included/effective 都是 false，连线不 active', () => {
    const model = buildGraph(inputOf({
      task: patchRange(newTaskDraft(), 'sleep', { excluded_metrics: ['rem_minutes'] }),
      expanded: new Set<AiTaskCategory>(['sleep']),
    }));
    const excluded = nodeById(model, metricNodeId('sleep', 'rem_minutes'));
    expect(excluded.included).toBe(false);
    expect(excluded.effective).toBe(false);
    expect(linkTo(model, excluded.id)?.active).toBe(false);
    const kept = nodeById(model, metricNodeId('sleep', 'score'));
    expect(kept.included).toBe(true);
    expect(kept.effective).toBe(true);
    expect(linkTo(model, kept.id)?.active).toBe(true);
  });
});

describe('buildGraph · 覆盖与角标', () => {
  it('类别覆盖率 = days_with_data / days_in_range；missing 如实带上', () => {
    const model = buildGraph(inputOf({
      preview: previewOf([coverageOf({ days_in_range: 10, days_with_data: 7, missing: true })]),
    }));
    const sleep = nodeById(model, 'cat:sleep');
    expect(sleep.coverage).toBeCloseTo(0.7, 10);
    expect(sleep.daysHave).toBe(7);
    expect(sleep.daysTotal).toBe(10);
    expect(sleep.missing).toBe(true);
  });

  it('禁用类别即使预览有行也不给覆盖率', () => {
    const model = buildGraph(inputOf({
      task: patchRange(newTaskDraft(), 'sleep', { enabled: false }),
      preview: previewOf([coverageOf()]),
    }));
    const sleep = nodeById(model, 'cat:sleep');
    expect(sleep.coverage).toBeNull();
    expect(sleep.missing).toBe(false);
  });

  it('指标覆盖用自己的有数据天数；metric_days 里缺的指标标 missing', () => {
    const model = buildGraph(inputOf({
      preview: previewOf([coverageOf({
        units: { score: 'pt', rem_minutes: 'min' },
        metric_days: { score: 5 },
        days_in_range: 10,
      })]),
      expanded: new Set<AiTaskCategory>(['sleep']),
    }));
    // 预览回来后指标清单以 units 的键为准，顺序跟 CATEGORY_METRICS。
    expect(metricIds(model, 'sleep')).toEqual([
      metricNodeId('sleep', 'score'),
      metricNodeId('sleep', 'rem_minutes'),
    ]);
    const score = nodeById(model, metricNodeId('sleep', 'score'));
    expect(score.coverage).toBeCloseTo(0.5, 10);
    expect(score.daysHave).toBe(5);
    expect(score.daysTotal).toBe(10);
    expect(score.missing).toBe(false);
    const rem = nodeById(model, metricNodeId('sleep', 'rem_minutes'));
    expect(rem.coverage).toBe(0);
    expect(rem.missing).toBe(true);
  });

  it('角标只在 attachment 上数附件个数', () => {
    const task: AiTask = { ...newTaskDraft(), attachments: [attachment('a1'), attachment('a2')] };
    const model = buildGraph(inputOf({ task }));
    expect(nodeById(model, 'cat:attachment').badge).toBe(2);
    expect(nodeById(model, 'cat:sleep').badge).toBeNull();
    expect(nodeById(model, CENTER_ID).badge).toBeNull();
    expect(buildGraph(inputOf()).nodes.every((node) => node.badge === null)).toBe(true);
  });
});

describe('buildGraph · 副标题与邻居', () => {
  it('启用窗口类别的副标题用 daysLabel；禁用或无窗口类别没有', () => {
    const model = buildGraph(inputOf({ daysLabel: (days) => `近 ${days} 天` }));
    const sleep = nodeById(model, 'cat:sleep');
    expect(sleep.sublabel).toBe('近 14 天');
    // 窗口设置透传给弹层控件；无窗口类别为 null。
    expect(sleep.daysBefore).toBe(14);
    expect(sleep.includeDay).toBe(true);
    const note = nodeById(model, 'cat:personal_note');
    expect(note.sublabel).toBeNull();
    expect(note.daysBefore).toBeNull();
    expect(note.includeDay).toBeNull();
    const disabled = buildGraph(inputOf({
      task: patchRange(newTaskDraft(), 'sleep', { enabled: false }),
    }));
    expect(nodeById(disabled, 'cat:sleep').sublabel).toBeNull();
  });

  it('neighborIds：自己 + 直连邻居；中心的邻居是所有类别', () => {
    const model = buildGraph(inputOf({ expanded: new Set<AiTaskCategory>(['sleep']) }));
    const aroundCenter = neighborIds(model, CENTER_ID);
    expect(aroundCenter.size).toBe(1 + AI_TASK_CATEGORY_ORDER.length);
    expect(aroundCenter.has('cat:sleep')).toBe(true);
    const aroundSleep = neighborIds(model, 'cat:sleep');
    expect(aroundSleep.has(CENTER_ID)).toBe(true);
    expect(aroundSleep.has(metricNodeId('sleep', 'score'))).toBe(true);
    expect(aroundSleep.size).toBe(1 + 1 + (CATEGORY_METRICS.sleep?.length ?? 0));
    const aroundMetric = neighborIds(model, metricNodeId('sleep', 'score'));
    expect(aroundMetric.size).toBe(2);
    expect(aroundMetric.has('cat:sleep')).toBe(true);
    // 没收进来的类别没有指标节点，邻居只有中心。
    expect(neighborIds(model, 'cat:workout').size).toBe(2);
  });
});

describe('orderedMetrics', () => {
  it('已知指标按 CATEGORY_METRICS 序，未知指标字母序排在后面；空预览回退全量已知', () => {
    expect(orderedMetrics('sleep', ['zzz_x', 'rem_minutes', 'score'])).toEqual([
      'score', 'rem_minutes', 'zzz_x',
    ]);
    expect(orderedMetrics('sleep', [])).toEqual([...(CATEGORY_METRICS.sleep ?? [])]);
    // 没有已知清单的类别：直接按字母序。
    expect(orderedMetrics('personal_note', ['b', 'a'])).toEqual(['a', 'b']);
  });
});
