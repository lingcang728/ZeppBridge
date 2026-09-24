/**
 * HandoffPanel 的 SSR 契约：非桌面运行时主 CTA 禁用、最终提示词如实拼出
 * 「方向 + 问题」、previewError 走 role="alert"、覆盖明细随 preview 出现。
 *
 * 两个 mock 的原因：
 * - `../../../lib/bridge`：组件链路（useAiTaskDraft/useAiTaskHandoff）只认
 *   backend + toUserMessage + isDesktop/isTauri；这里钉死非桌面运行时。
 * - `../../../composables/useAiHandoff`：它的顶层 import
 *   `@tauri-apps/plugin-opener` 是 Tauri 运行时依赖，node 下不该被加载——
 *   与 composables/__tests__/useAiTaskHandoff.test.ts 的既有做法一致。
 */
import { createSSRApp } from 'vue';
import { renderToString } from '@vue/server-renderer';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AiTaskPreview } from '../../../lib/bridge/types';
import type { Workout } from '../../../types';

const prepareMock = vi.fn();
const saveMock = vi.fn(async (task: unknown) => task);
const copyMock = vi.fn(async (_text: string) => {});
const openMock = vi.fn(async (_provider: unknown): Promise<'opened' | 'skipped'> => 'opened');
const revealMock = vi.fn(async (_path: string) => {});

vi.mock('../../../lib/bridge', () => ({
  backend: {
    aiTaskPrepare: (...args: unknown[]) => prepareMock(...args),
    aiTaskSave: (task: unknown) => saveMock(task),
    aiTaskList: vi.fn(async () => []),
    aiTaskGet: vi.fn(),
    aiTaskDelete: vi.fn(async () => {}),
    aiTemplateList: vi.fn(async () => []),
    getRecentWorkouts: vi.fn(async (): Promise<Workout[]> => []),
    getWorkoutDetail: vi.fn(async (_id: string): Promise<Workout | null> => null),
  },
  isDesktop: () => false,
  isTauri: () => false,
  toUserMessage: (_error: unknown, fallback: string) => fallback,
}));

vi.mock('../../../composables/useAiHandoff', () => ({
  copyTextToClipboard: (text: string) => copyMock(text),
  openProviderSite: (provider: unknown) => openMock(provider),
  revealInFolder: (path: string) => revealMock(path),
}));

import HandoffPanel from '../HandoffPanel.vue';
import { useAiTaskDraft } from '../../../composables/useAiTaskDraft';

const previewWithCoverage: AiTaskPreview = {
  task_id: 't-1',
  workouts: [],
  coverage: [{
    category: 'sleep',
    workout_id: null,
    start_date: '2026-09-01',
    end_date: '2026-09-14',
    days_in_range: 14,
    days_with_data: 13,
    sources: ['user_fused'],
    units: { duration_minutes: 'min' },
    missing: false,
  }],
  attachments: [],
  estimated_bytes: 1024,
  warnings: [],
};

const render = (props: {
  preview: AiTaskPreview | null;
  previewError: string | null;
  direction: string | null;
  fallbackTitle: string;
}) => renderToString(createSSRApp(HandoffPanel, props));

const count = (html: string, re: RegExp): number => (html.match(re) ?? []).length;

const draft = useAiTaskDraft();

describe('HandoffPanel', () => {
  beforeEach(() => {
    draft.resetDraft();
    prepareMock.mockReset();
    saveMock.mockClear();
    copyMock.mockClear();
    openMock.mockClear();
    revealMock.mockClear();
  });

  it('非桌面运行时：两枚动作按钮都禁用，并说明要连桌面应用', async () => {
    const html = await render({ preview: null, previewError: null, direction: null, fallbackTitle: '任务' });
    expect(html).toMatch(/<button[^>]*class="[^"]*cta[^"]*"[^>]*disabled/);
    expect(count(html, /disabled/g)).toBe(2);
    expect(html).toContain('连接桌面应用后才能导出');
  });

  it('最终提示词 <pre> 如实拼出方向段与问题段', async () => {
    draft.setPrompt('这次睡眠够恢复吗');
    const html = await render({
      preview: null,
      previewError: null,
      direction: '分析方向：恢复跑上下文',
      fallbackTitle: '任务',
    });
    const pre = html.match(/<pre[^>]*class="prompt"[^>]*>([\s\S]*?)<\/pre>/)?.[1] ?? '';
    expect(pre).toContain('分析方向：恢复跑上下文');
    expect(pre).toContain('这次睡眠够恢复吗');
    // 覆盖说明段（前端提供的本地化文本）也在里面。
    expect(pre.length).toBeGreaterThan(0);
  });

  it('previewError 渲染成 role="alert" 的提示', async () => {
    const html = await render({
      preview: null,
      previewError: '预览服务挂了',
      direction: null,
      fallbackTitle: '任务',
    });
    expect(html).toContain('role="alert"');
    expect(html).toContain('预览服务挂了');
  });

  it('preview 有覆盖行时渲染折叠明细；三步状态区一直在', async () => {
    const html = await render({ preview: previewWithCoverage, previewError: null, direction: null, fallbackTitle: '任务' });
    expect(html).toContain('<details');
    expect(count(html, /<li[\s>]/g)).toBe(3);
  });

  it('preview 为空或没有覆盖行：不出 details', async () => {
    const noPreview = await render({ preview: null, previewError: null, direction: null, fallbackTitle: '任务' });
    expect(noPreview).not.toContain('<details');
    const emptyCoverage = await render({
      preview: { ...previewWithCoverage, coverage: [] },
      previewError: null,
      direction: null,
      fallbackTitle: '任务',
    });
    expect(emptyCoverage).not.toContain('<details');
  });
});
