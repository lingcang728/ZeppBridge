/**
 * AiQuestionBar 的 SSR 契约：底部对话条里的问题文本框（id 固定为 ai-question，入口胶囊靠它聚焦）；
 * 字符计数只在写得快到上限时才出现，平时不占地方。草稿是模块单例，渲染前一律 resetDraft 归位。
 */
import { createSSRApp } from 'vue';
import { renderToString } from '@vue/server-renderer';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../lib/bridge', () => ({
  backend: {
    aiTaskList: vi.fn(async () => []),
    aiTaskGet: vi.fn(),
    aiTaskSave: vi.fn(async (task: unknown) => task),
    aiTaskDelete: vi.fn(async () => {}),
    aiTemplateList: vi.fn(async () => []),
    getRecentWorkouts: vi.fn(async () => []),
    getWorkoutDetail: vi.fn(async () => null),
  },
  isDesktop: () => false,
  isTauri: () => false,
  toUserMessage: (_error: unknown, fallback: string) => fallback,
}));

import AiQuestionBar from '../AiQuestionBar.vue';
import { useAiTaskDraft } from '../../../composables/useAiTaskDraft';
import { AI_TASK_PROMPT_MAX } from '../../../lib/aiTask/draft';

const render = () => renderToString(createSSRApp(AiQuestionBar));
const draft = useAiTaskDraft();

describe('AiQuestionBar', () => {
  beforeEach(() => {
    draft.resetDraft();
  });

  it('空草稿：有文本框和占位提示，不显示计数', async () => {
    const html = await render();
    expect(html).toContain('id="ai-question"');
    expect(html).toContain('placeholder=');
    expect(html).not.toContain('/500');
  });

  it('写过的问题进文本框', async () => {
    draft.setPrompt('hello');
    const html = await render();
    expect(html).toContain('hello');
    expect(html).not.toContain('/500');
  });

  it('写到上限的 80% 以后才出现 已用/上限 计数', async () => {
    draft.setPrompt('a'.repeat(Math.ceil(AI_TASK_PROMPT_MAX * 0.81)));
    const html = await render();
    expect(html).toContain(`/${AI_TASK_PROMPT_MAX}`);
  });

  it('文本框带 maxlength，和草稿里的上限是同一个数', async () => {
    const html = await render();
    expect(html).toContain(`maxlength="${AI_TASK_PROMPT_MAX}"`);
  });
});
