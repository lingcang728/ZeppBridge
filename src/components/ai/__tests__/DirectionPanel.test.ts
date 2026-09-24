/**
 * DirectionPanel 的 SSR 契约：方向 chip 单选（含「不指定」）、问题文本框
 * 与字符计数。草稿是模块单例，渲染前一律 resetDraft 归位。
 */
import { createSSRApp } from 'vue';
import { renderToString } from '@vue/server-renderer';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AiTaskTemplate } from '../../../lib/bridge/types';
import type { Workout } from '../../../types';

const listMock = vi.fn(async () => []);
const templatesMock = vi.fn(async (): Promise<AiTaskTemplate[]> => []);
const workoutsMock = vi.fn(async (): Promise<Workout[]> => []);
const workoutDetailMock = vi.fn(async (_id: string): Promise<Workout | null> => null);

vi.mock('../../../lib/bridge', () => ({
  backend: {
    aiTaskList: () => listMock(),
    aiTaskGet: vi.fn(),
    aiTaskSave: vi.fn(async (task: unknown) => task),
    aiTaskDelete: vi.fn(async () => {}),
    aiTemplateList: () => templatesMock(),
    getRecentWorkouts: () => workoutsMock(),
    getWorkoutDetail: (id: string) => workoutDetailMock(id),
  },
  isDesktop: () => false,
  isTauri: () => false,
  toUserMessage: (_error: unknown, fallback: string) => fallback,
}));

import DirectionPanel from '../DirectionPanel.vue';
import { useAiTaskDraft } from '../../../composables/useAiTaskDraft';

const template = (patch: Partial<AiTaskTemplate> = {}): AiTaskTemplate => ({
  schema_version: 1,
  id: 'tpl-1',
  builtin: true,
  name: '恢复跑方向',
  name_code: null,
  categories: [],
  detail_level: 'standard',
  prompt_template: '方向正文',
  prompt_code: null,
  default_summaries: [],
  required_series: [],
  created_at: '',
  updated_at: '',
  ...patch,
});

const render = (templates: AiTaskTemplate[]) =>
  renderToString(createSSRApp(DirectionPanel, { templates }));

const count = (html: string, re: RegExp): number => (html.match(re) ?? []).length;

const draft = useAiTaskDraft();

describe('DirectionPanel', () => {
  beforeEach(() => {
    draft.resetDraft();
  });

  it('无方向：「不指定」是唯一勾选的 radio；每个模板各一枚 chip', async () => {
    const html = await render([template(), template({ id: 'tpl-2', name: '长跑比较' })]);
    // 1 个「不指定」+ 2 个模板 = 3 枚 radio，恰好 1 枚勾选。
    expect(count(html, /role="radio"/g)).toBe(3);
    expect(count(html, /aria-checked="true"/g)).toBe(1);
    expect(html).toContain('不指定');
    // 模板 chip 显示 templateName（name_code 为空时用存储的 name），
    // 方向正文落在 title 提示上。
    expect(html).toContain('恢复跑方向');
    expect(html).toContain('长跑比较');
    expect(html).toContain('title="方向正文"');
  });

  it('空草稿：计数器 0/500，问题文本框为空', async () => {
    const html = await render([]);
    expect(html).toContain('0/500');
    expect(html).toContain('id="ai-question"');
  });

  it('写过的问题进 textarea，计数器同步成 已用/上限', async () => {
    draft.setPrompt('hello');
    const html = await render([]);
    expect(html).toContain('hello');
    expect(html).toContain('5/500');
  });

  it('选中模板：它的 chip 打勾，用户写过的问题不被冲掉', async () => {
    draft.setPrompt('keep me');
    draft.setTemplate(template());
    const html = await render([template()]);
    // 问题原样保留在 textarea 里。
    expect(html).toContain('keep me');
    // 唯一打勾的是模板这枚 chip（title=方向正文 与 checked 同在一枚按钮里）。
    expect(count(html, /aria-checked="true"/g)).toBe(1);
    expect(html).toMatch(/aria-checked="true"[^>]*title="方向正文"/);
    expect(count(html, /aria-checked="false"/g)).toBe(1);
  });
});
